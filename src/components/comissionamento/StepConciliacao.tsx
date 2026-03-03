import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2, GitCompare, CheckCircle2, Search, Download, AlertCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  comissionamentoId: string;
}

interface ComVenda {
  id: string;
  venda_interna_id: string;
  status_pag: string | null;
  receita_interna: number | null;
  receita_lal: number | null;
  lal_apelido: string | null;
  linha_operadora_id: string | null;
  cliente_nome?: string;
  cpf_cnpj?: string;
  protocolo_interno?: string;
  status_make?: string;
  valor_venda?: number;
  vendedor_nome?: string;
}

export function StepConciliacao({ comissionamentoId }: Props) {
  const { user } = useAuth();
  const [vendas, setVendas] = useState<ComVenda[]>([]);
  const [lals, setLals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const [statusPagFilter, setStatusPagFilter] = useState<string>('all');
  const [statusMakeFilter, setStatusMakeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch ALL comissionamento_vendas using recursive batching
      const allVendas: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('comissionamento_vendas')
          .select(`
            id, venda_interna_id, status_pag, receita_interna, receita_lal, lal_apelido, linha_operadora_id,
            vendas_internas!comissionamento_vendas_venda_interna_id_fkey(
              cliente_nome, cpf_cnpj, protocolo_interno, status_make, valor,
              usuarios!vendas_internas_usuario_id_fkey(nome)
            )
          `)
          .eq('comissionamento_id', comissionamentoId)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        allVendas.push(...data);
        if (data.length < batchSize) break;
        offset += batchSize;
      }

      const [lalRes] = await Promise.all([
        supabase
          .from('comissionamento_lal')
          .select('*')
          .eq('comissionamento_id', comissionamentoId),
      ]);

      const mapped = allVendas.map((row: any) => {
        const vi = row.vendas_internas;
        return {
          id: row.id,
          venda_interna_id: row.venda_interna_id,
          status_pag: row.status_pag,
          receita_interna: row.receita_interna,
          receita_lal: row.receita_lal,
          lal_apelido: row.lal_apelido,
          linha_operadora_id: row.linha_operadora_id,
          cliente_nome: vi?.cliente_nome,
          cpf_cnpj: vi?.cpf_cnpj,
          protocolo_interno: vi?.protocolo_interno,
          status_make: vi?.status_make,
          valor_venda: vi?.valor,
          vendedor_nome: vi?.usuarios?.nome,
        };
      });

      setVendas(mapped);
      if (lalRes.data) setLals(lalRes.data);
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [comissionamentoId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredVendas = useMemo(() => {
    let result = vendas;
    if (statusPagFilter !== 'all') {
      if (statusPagFilter === 'vazio') {
        result = result.filter(v => !v.status_pag);
      } else {
        result = result.filter(v => v.status_pag === statusPagFilter);
      }
    }
    if (statusMakeFilter !== 'all') {
      result = result.filter(v => (v.status_make || '').toLowerCase().startsWith(statusMakeFilter));
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(v =>
        (v.cliente_nome || '').toLowerCase().includes(term) ||
        (v.cpf_cnpj || '').includes(term) ||
        (v.protocolo_interno || '').toLowerCase().includes(term) ||
        (v.vendedor_nome || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [vendas, statusPagFilter, statusMakeFilter, searchTerm]);

  const displayedVendas = filteredVendas.slice(0, 200);

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(new Set(filteredVendas.map(v => v.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runConciliacao = async () => {
    if (lals.length === 0) {
      toast.error('Nenhum LAL importado neste comissionamento');
      return;
    }

    setIsProcessing(true);
    const vendasToProcess = vendas.filter(v => !v.status_pag && !v.linha_operadora_id);
    setProgress({ current: 0, total: vendasToProcess.length });

    try {
      const lalApelidos = lals.map((l: any) => l.apelido);
      const lalMatchMap = new Map<string, string>();
      lals.forEach((l: any) => lalMatchMap.set(l.apelido, l.tipo_match));

      const allLinhas: any[] = [];
      for (const apelido of lalApelidos) {
        let offset = 0;
        while (true) {
          const { data } = await supabase
            .from('linha_operadora')
            .select('id, protocolo_operadora, cpf_cnpj, telefone, valor_lq, apelido')
            .eq('apelido', apelido)
            .range(offset, offset + 999);
          if (!data || data.length === 0) break;
          allLinhas.push(...data);
          if (data.length < 1000) break;
          offset += 1000;
        }
      }

      const normDoc = (v: string) => v.replace(/[^\d]/g, '');
      const linhasByProtocolo = new Map<string, any>();
      const linhasByCpf = new Map<string, any>();
      const usedLinhaIds = new Set<string>();

      for (const linha of allLinhas) {
        if (linha.protocolo_operadora) {
          linhasByProtocolo.set(linha.protocolo_operadora.trim(), linha);
        }
        if (linha.cpf_cnpj) {
          linhasByCpf.set(normDoc(linha.cpf_cnpj), linha);
        }
      }

      const existingConcIds = vendas.filter(v => v.linha_operadora_id).map(v => v.linha_operadora_id!);
      existingConcIds.forEach(id => usedLinhaIds.add(id));

      let matchCount = 0;
      const updates: { id: string; data: any }[] = [];

      for (let i = 0; i < vendasToProcess.length; i++) {
        const venda = vendasToProcess[i];
        let matchedLinha: any = null;
        let matchedApelido: string | null = null;

        for (const lal of lals) {
          const tipoMatch = lal.tipo_match;

          if (tipoMatch === 'protocolo' && venda.protocolo_interno) {
            const linha = linhasByProtocolo.get(venda.protocolo_interno.trim());
            if (linha && !usedLinhaIds.has(linha.id)) {
              matchedLinha = linha;
              matchedApelido = lal.apelido;
              break;
            }
          }

          if (tipoMatch === 'cpf' && venda.cpf_cnpj) {
            const linha = linhasByCpf.get(normDoc(venda.cpf_cnpj));
            if (linha && !usedLinhaIds.has(linha.id)) {
              matchedLinha = linha;
              matchedApelido = lal.apelido;
              break;
            }
          }
        }

        if (matchedLinha) {
          usedLinhaIds.add(matchedLinha.id);
          updates.push({
            id: venda.id,
            data: {
              linha_operadora_id: matchedLinha.id,
              receita_lal: matchedLinha.valor_lq,
              lal_apelido: matchedApelido,
              status_pag: 'OK',
            },
          });
          matchCount++;
        }

        if (i % 100 === 0) {
          setProgress({ current: i, total: vendasToProcess.length });
          await new Promise(r => setTimeout(r, 5));
        }
      }

      for (let i = 0; i < updates.length; i += 50) {
        const batch = updates.slice(i, i + 50);
        await Promise.all(
          batch.map(u => supabase.from('comissionamento_vendas').update(u.data).eq('id', u.id))
        );
      }

      toast.success(`Conciliação concluída: ${matchCount} de ${vendasToProcess.length} vendas conciliadas`);
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const bulkUpdateStatusPag = async (newStatus: 'OK' | 'DESCONTADA') => {
    if (selectedIds.size === 0) { toast.error('Selecione vendas primeiro'); return; }
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        await Promise.all(
          batch.map(id => supabase.from('comissionamento_vendas').update({ status_pag: newStatus as any }).eq('id', id))
        );
      }
      toast.success(`${ids.length} vendas atualizadas para ${newStatus}`);
      setSelectedIds(new Set());
      setSelectAll(false);
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatBRL = (v: number | null) =>
    v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '-';

  const statusPagBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-xs">Pendente</Badge>;
    if (status === 'OK') return <Badge className="bg-success/20 text-success text-xs">OK</Badge>;
    return <Badge className="bg-destructive/20 text-destructive text-xs">DESCONTADA</Badge>;
  };

  // Match indicators (P5) - moved before early return
  const matchStats = useMemo(() => {
    const total = vendas.length;
    const found = vendas.filter(v => v.linha_operadora_id).length;
    const notFound = total - found;
    const percentage = total > 0 ? ((found / total) * 100).toFixed(1) : '0';
    return { total, found, notFound, percentage };
  }, [vendas]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const stats = {
    total: vendas.length,
    ok: vendas.filter(v => v.status_pag === 'OK').length,
    descontada: vendas.filter(v => v.status_pag === 'DESCONTADA').length,
    pendente: vendas.filter(v => !v.status_pag).length,
  };

  return (
    <div className="space-y-4">
      {/* Match Indicators - P5 */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total no Comissionamento</p>
              <p className="text-xl font-bold">{matchStats.total}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Encontradas no LAL</p>
              <p className="text-xl font-bold text-success">{matchStats.found}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Não Encontradas</p>
              <p className="text-xl font-bold text-destructive">{matchStats.notFound}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">% Match</p>
              <p className="text-xl font-bold">{matchStats.percentage}%</p>
            </div>
          </div>
          <Progress value={Number(matchStats.percentage)} className="h-2 mt-3" />
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">OK</p>
          <p className="text-lg font-bold text-success">{stats.ok}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Descontada</p>
          <p className="text-lg font-bold text-destructive">{stats.descontada}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Pendente</p>
          <p className="text-lg font-bold text-warning">{stats.pendente}</p>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={runConciliacao} disabled={isProcessing} className="gap-1.5">
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
          Conciliar Automaticamente
        </Button>
        {selectedIds.size > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={() => bulkUpdateStatusPag('OK')} disabled={isProcessing} className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Marcar {selectedIds.size} como OK
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdateStatusPag('DESCONTADA')} disabled={isProcessing} className="gap-1.5 text-destructive">
              Marcar {selectedIds.size} como DESCONTADA
            </Button>
          </>
        )}
      </div>

      {progress && (
        <div className="space-y-1">
          <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">{progress.current} / {progress.total}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-8 pl-8 w-48 text-sm"
          />
        </div>
        <Select value={statusPagFilter} onValueChange={setStatusPagFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="status_pag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="OK">OK</SelectItem>
            <SelectItem value="DESCONTADA">Descontada</SelectItem>
            <SelectItem value="vazio">Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusMakeFilter} onValueChange={setStatusMakeFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="status_pedido" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="instalad">Instalada</SelectItem>
            <SelectItem value="churn">Churn</SelectItem>
            <SelectItem value="cancelad">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground self-center">
          {filteredVendas.length} resultados
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox checked={selectAll} onCheckedChange={handleSelectAll} />
              </TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">CPF</TableHead>
              <TableHead className="text-xs">Protocolo</TableHead>
              <TableHead className="text-xs">Vendedor</TableHead>
              <TableHead className="text-xs">Status Pedido</TableHead>
              <TableHead className="text-xs">Status Pag</TableHead>
              <TableHead className="text-xs">Receita Int.</TableHead>
              <TableHead className="text-xs">Receita LAL</TableHead>
              <TableHead className="text-xs">LAL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedVendas.map(v => (
              <TableRow key={v.id} className={selectedIds.has(v.id) ? 'bg-accent/50' : ''}>
                <TableCell>
                  <Checkbox checked={selectedIds.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} />
                </TableCell>
                <TableCell className="text-xs max-w-[120px] truncate">{v.cliente_nome || '-'}</TableCell>
                <TableCell className="text-xs font-mono">{v.cpf_cnpj || '-'}</TableCell>
                <TableCell className="text-xs font-mono">{v.protocolo_interno || '-'}</TableCell>
                <TableCell className="text-xs max-w-[100px] truncate">{v.vendedor_nome || '-'}</TableCell>
                <TableCell className="text-xs">{v.status_make || '-'}</TableCell>
                <TableCell>{statusPagBadge(v.status_pag)}</TableCell>
                <TableCell className="text-xs">{formatBRL(v.receita_interna)}</TableCell>
                <TableCell className="text-xs">{formatBRL(v.receita_lal)}</TableCell>
                <TableCell className="text-xs max-w-[80px] truncate">{v.lal_apelido || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filteredVendas.length > 200 && (
        <p className="text-xs text-muted-foreground text-center">
          Mostrando 200 de {filteredVendas.length}. Use os filtros para refinar.
        </p>
      )}
    </div>
  );
}
