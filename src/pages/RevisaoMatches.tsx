import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Loader2, CheckCircle2, XCircle, Search, ArrowUpRight, Phone, FileText, User,
} from 'lucide-react';
import { toast } from 'sonner';

interface PendingMatch {
  conciliacao_id: string;
  venda: {
    id: string;
    cliente_nome: string;
    cpf_cnpj: string | null;
    protocolo_interno: string | null;
    telefone: string | null;
    valor: number | null;
    vendedor_nome: string;
    identificador_make: string | null;
  };
  linha: {
    id: string;
    cliente_nome: string | null;
    cpf_cnpj: string | null;
    protocolo_operadora: string | null;
    telefone: string | null;
    valor_lq: number | null;
    operadora: string;
  };
  tipo_match: string;
  score: number;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function RevisaoMatchesPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<PendingMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const loadPendingMatches = async () => {
    setIsLoading(true);
    try {
      // Load conciliacoes with low score (telefone matches) that are pending
      const { data, error } = await supabase
        .from('conciliacoes')
        .select(`
          id, tipo_match, score_match, status_final,
          vendas_internas!conciliacoes_venda_interna_id_fkey(
            id, cliente_nome, cpf_cnpj, protocolo_interno, telefone, valor, identificador_make,
            usuarios!vendas_internas_usuario_id_fkey(nome)
          ),
          linha_operadora!conciliacoes_linha_operadora_id_fkey(
            id, cliente_nome, cpf_cnpj, protocolo_operadora, telefone, valor_lq, operadora
          )
        `)
        .eq('tipo_match', 'telefone')
        .eq('status_final', 'nao_encontrado')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: PendingMatch[] = (data || []).map((row: any) => ({
        conciliacao_id: row.id,
        venda: {
          id: row.vendas_internas?.id,
          cliente_nome: row.vendas_internas?.cliente_nome || '',
          cpf_cnpj: row.vendas_internas?.cpf_cnpj,
          protocolo_interno: row.vendas_internas?.protocolo_interno,
          telefone: row.vendas_internas?.telefone,
          valor: row.vendas_internas?.valor,
          vendedor_nome: row.vendas_internas?.usuarios?.nome || 'Desconhecido',
          identificador_make: row.vendas_internas?.identificador_make,
        },
        linha: {
          id: row.linha_operadora?.id,
          cliente_nome: row.linha_operadora?.cliente_nome,
          cpf_cnpj: row.linha_operadora?.cpf_cnpj,
          protocolo_operadora: row.linha_operadora?.protocolo_operadora,
          telefone: row.linha_operadora?.telefone,
          valor_lq: row.linha_operadora?.valor_lq,
          operadora: row.linha_operadora?.operadora || '',
        },
        tipo_match: row.tipo_match,
        score: row.score_match || 70,
      }));

      setMatches(mapped);
    } catch (err: any) {
      toast.error('Erro ao carregar: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadPendingMatches(); }, []);

  const filteredMatches = useMemo(() => {
    if (!searchTerm) return matches;
    const term = searchTerm.toLowerCase();
    return matches.filter(m =>
      m.venda.cliente_nome.toLowerCase().includes(term) ||
      (m.venda.cpf_cnpj || '').includes(term) ||
      (m.venda.telefone || '').includes(term) ||
      m.venda.vendedor_nome.toLowerCase().includes(term) ||
      (m.linha.cliente_nome || '').toLowerCase().includes(term)
    );
  }, [matches, searchTerm]);

  const handleConfirm = async (match: PendingMatch) => {
    setProcessingIds(prev => new Set(prev).add(match.conciliacao_id));
    try {
      await supabase.from('conciliacoes').update({
        status_final: 'conciliado',
        validado_por: user?.id,
        validado_em: new Date().toISOString(),
        observacao: 'Confirmado manualmente na revisão de matches',
      }).eq('id', match.conciliacao_id);

      await supabase.from('vendas_internas').update({
        status_interno: 'confirmada',
      }).eq('id', match.venda.id);

      toast.success('Match confirmado');
      setMatches(prev => prev.filter(m => m.conciliacao_id !== match.conciliacao_id));
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setProcessingIds(prev => { const s = new Set(prev); s.delete(match.conciliacao_id); return s; });
    }
  };

  const handleReject = async (match: PendingMatch) => {
    setProcessingIds(prev => new Set(prev).add(match.conciliacao_id));
    try {
      await supabase.from('conciliacoes').update({
        status_final: 'divergente',
        validado_por: user?.id,
        validado_em: new Date().toISOString(),
        observacao: 'Rejeitado na revisão de matches',
      }).eq('id', match.conciliacao_id);

      toast.success('Match rejeitado — venda marcada para contestação');
      setMatches(prev => prev.filter(m => m.conciliacao_id !== match.conciliacao_id));
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setProcessingIds(prev => { const s = new Set(prev); s.delete(match.conciliacao_id); return s; });
    }
  };

  if (isLoading) {
    return (
      <AppLayout title="Revisão de Matches">
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Revisão de Matches">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Matches Pendentes de Confirmação ({matches.length})
            </CardTitle>
            <CardDescription>
              Matches encontrados por telefone (score 70) que requerem confirmação manual antes de entrar no cálculo de comissão.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF, telefone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {filteredMatches.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum match pendente de revisão</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMatches.map(match => (
                  <Card key={match.conciliacao_id} className="border">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Venda Interna */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">Venda Interna</Badge>
                            <span className="text-xs text-muted-foreground">
                              <User className="h-3 w-3 inline mr-1" />
                              {match.venda.vendedor_nome}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            <div><span className="text-muted-foreground">Cliente:</span> <strong>{match.venda.cliente_nome}</strong></div>
                            <div><span className="text-muted-foreground">CPF:</span> {match.venda.cpf_cnpj || '—'}</div>
                            <div><span className="text-muted-foreground">Protocolo:</span> {match.venda.protocolo_interno || '—'}</div>
                            <div><span className="text-muted-foreground">Telefone:</span> {match.venda.telefone || '—'}</div>
                            <div><span className="text-muted-foreground">Valor:</span> {match.venda.valor ? formatBRL(match.venda.valor) : '—'}</div>
                          </div>
                        </div>

                        {/* Linha Operadora */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">Linha a Linha</Badge>
                            <Badge variant="outline" className="text-xs">{match.linha.operadora}</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            <div><span className="text-muted-foreground">Cliente:</span> <strong>{match.linha.cliente_nome || '—'}</strong></div>
                            <div><span className="text-muted-foreground">CPF:</span> {match.linha.cpf_cnpj || '—'}</div>
                            <div><span className="text-muted-foreground">Protocolo:</span> {match.linha.protocolo_operadora || '—'}</div>
                            <div><span className="text-muted-foreground">Telefone:</span> {match.linha.telefone || '—'}</div>
                            <div><span className="text-muted-foreground">Valor LQ:</span> {match.linha.valor_lq ? formatBRL(match.linha.valor_lq) : '—'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-2 text-xs">
                          <Phone className="h-3.5 w-3.5 text-warning" />
                          <span>Match por: <strong>TELEFONE</strong></span>
                          <Badge variant="outline" className="text-xs">Score: {match.score}</Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1.5"
                            disabled={processingIds.has(match.conciliacao_id)}
                            onClick={() => handleConfirm(match)}
                          >
                            {processingIds.has(match.conciliacao_id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5"
                            disabled={processingIds.has(match.conciliacao_id)}
                            onClick={() => handleReject(match)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Rejeitar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
