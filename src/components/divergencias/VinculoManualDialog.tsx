import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { registrarAuditoria } from '@/services/auditService';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Link2, History } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AuditLogRecord, buscarAuditoriaVenda } from '@/services/auditService';

interface VinculoManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: 'venda' | 'linha';
  /** ID do registro de origem */
  registroId: string;
  /** Label do registro de origem para exibição */
  registroLabel: string;
  onSuccess: () => void;
}

interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  extra?: string;
}

export function VinculoManualDialog({
  open, onOpenChange, tipo, registroId, registroLabel, onSuccess,
}: VinculoManualDialogProps) {
  const { user, vendedor } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setResults([]);
      setSelectedId(null);
      setObservacao('');
      setShowHistory(false);
      setAuditLogs([]);
    }
  }, [open]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setIsSearching(true);
    setResults([]);
    try {
      if (tipo === 'venda') {
        // Buscando linhas da operadora para vincular à venda
        const { data, error } = await supabase
          .from('linha_operadora')
          .select('*')
          .or(`protocolo_operadora.ilike.%${searchTerm}%,cpf_cnpj.ilike.%${searchTerm}%,cliente_nome.ilike.%${searchTerm}%,telefone.ilike.%${searchTerm}%`)
          .limit(20);
        if (error) throw error;
        setResults((data || []).map((l: any) => ({
          id: l.id,
          label: `${l.operadora} — ${l.cliente_nome || 'Sem nome'}`,
          sublabel: `Protocolo: ${l.protocolo_operadora || '-'} | CPF: ${l.cpf_cnpj || '-'}`,
          extra: l.valor_lq
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(l.valor_lq)
            : l.valor
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(l.valor)
              : undefined,
        })));
      } else {
        // Buscando vendas internas para vincular à linha
        const { data, error } = await supabase
          .from('vendas_internas')
          .select('*, usuario:usuarios(nome)')
          .or(`protocolo_interno.ilike.%${searchTerm}%,cpf_cnpj.ilike.%${searchTerm}%,cliente_nome.ilike.%${searchTerm}%,identificador_make.ilike.%${searchTerm}%,telefone.ilike.%${searchTerm}%`)
          .limit(20);
        if (error) throw error;
        setResults((data || []).map((v: any) => ({
          id: v.id,
          label: `${v.cliente_nome} — ${v.usuario?.nome || 'Sem vendedor'}`,
          sublabel: `Protocolo: ${v.protocolo_interno || '-'} | CPF: ${v.cpf_cnpj || '-'} | ID Make: ${v.identificador_make || '-'}`,
          extra: v.valor
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.valor)
            : undefined,
        })));
      }
    } catch (err) {
      console.error('Erro ao buscar registros:', err);
      toast.error('Erro ao buscar registros');
    } finally {
      setIsSearching(false);
    }
  };

  const handleVincular = async () => {
    if (!selectedId) return;
    setIsLinking(true);
    try {
      const vendaId = tipo === 'venda' ? registroId : selectedId;
      const linhaId = tipo === 'venda' ? selectedId : registroId;

      // Check if already linked
      const { data: existing } = await supabase
        .from('conciliacoes')
        .select('id')
        .eq('venda_interna_id', vendaId)
        .eq('linha_operadora_id', linhaId)
        .eq('status_final', 'conciliado')
        .maybeSingle();

      if (existing) {
        toast.warning('Estes registros já estão conciliados');
        setIsLinking(false);
        return;
      }

      const { error } = await supabase
        .from('conciliacoes')
        .insert({
          venda_interna_id: vendaId,
          linha_operadora_id: linhaId,
          tipo_match: 'manual' as any,
          status_final: 'conciliado' as any,
          score_match: 100,
          validado_por: user?.id || null,
          validado_em: new Date().toISOString(),
          observacao: observacao.trim() || null,
        });
      if (error) throw error;

      await registrarAuditoria({
        venda_id: vendaId,
        user_id: user?.id,
        user_nome: vendedor?.nome,
        acao: 'CONCILIAR',
        campo: 'vinculo_manual',
        valor_anterior: null,
        valor_novo: JSON.stringify({
          linha_operadora_id: linhaId,
          observacao: observacao.trim() || null,
        }),
        origem: 'UI',
        metadata: { tipo_match: 'manual', origem_tela: 'divergencias' },
      });

      toast.success('Vínculo manual criado com sucesso!');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('Erro ao vincular:', err);
      toast.error('Erro ao criar vínculo manual');
    } finally {
      setIsLinking(false);
    }
  };

  const loadHistory = async () => {
    if (tipo !== 'venda') return;
    setLoadingHistory(true);
    try {
      const { data } = await buscarAuditoriaVenda(registroId, 1, 50);
      setAuditLogs(data);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleToggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && auditLogs.length === 0) loadHistory();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Manualmente
          </DialogTitle>
          <DialogDescription>
            {tipo === 'venda'
              ? 'Busque um registro da operadora para vincular a esta venda'
              : 'Busque uma venda interna para vincular a este registro da operadora'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source record info */}
          <div className="p-3 rounded-md bg-muted/50 border">
            <p className="text-xs text-muted-foreground mb-1">
              {tipo === 'venda' ? 'Venda selecionada' : 'Registro da operadora'}
            </p>
            <p className="text-sm font-medium">{registroLabel}</p>
          </div>

          {/* Search */}
          <div className="space-y-2">
            <Label className="text-sm">
              Buscar {tipo === 'venda' ? 'registro da operadora' : 'venda interna'}
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Protocolo, CPF/CNPJ, nome, telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={isSearching} size="icon" variant="outline">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left p-3 rounded-md border transition-colors ${
                      selectedId === r.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{r.label}</p>
                      {r.extra && <Badge variant="secondary" className="text-xs">{r.extra}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.sublabel}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          {results.length === 0 && searchTerm && !isSearching && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum resultado encontrado
            </p>
          )}

          {/* Observation */}
          {selectedId && (
            <div className="space-y-2">
              <Label className="text-sm">Observação (opcional)</Label>
              <Textarea
                placeholder="Motivo do vínculo manual, anotações..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* History toggle */}
          {tipo === 'venda' && (
            <div>
              <Button variant="ghost" size="sm" onClick={handleToggleHistory} className="gap-2 text-xs">
                <History className="h-3.5 w-3.5" />
                {showHistory ? 'Ocultar Histórico' : 'Ver Histórico de Atividades'}
              </Button>
              {showHistory && (
                <div className="mt-2 border rounded-md p-3 max-h-[200px] overflow-y-auto">
                  {loadingHistory ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhuma atividade registrada
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="text-xs border-b last:border-0 pb-2 last:pb-0">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px]">{log.acao}</Badge>
                            <span className="text-muted-foreground">
                              {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {log.user_nome || 'Sistema'}
                            {log.campo && <> — <span className="font-medium">{log.campo}</span></>}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleVincular} disabled={!selectedId || isLinking} className="gap-2">
            {isLinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
