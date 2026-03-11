import { useState, useEffect, useCallback, useMemo } from 'react';
import { normalizeCpfCnpj, normalizeCpfCnpjForMatch } from '@/lib/normalizeCpfCnpj';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, GitCompare, CheckCircle2, Search, XCircle, RefreshCw, Trash2, ChevronDown,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';

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
  data_venda?: string;
  // Pre-match fields (computed client-side)
  matched_linha_id?: string | null;
  matched_valor_lq?: number | null;
  matched_apelido?: string | null;
  is_atencao?: boolean;
  atencao_key?: string;
}

export function StepConciliacao({ comissionamentoId }: Props) {
  const { user } = useAuth();
  const [vendas, setVendas] = useState<ComVenda[]>([]);
  const [lals, setLals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [matchRan, setMatchRan] = useState(false);

  const [statusPagFilter, setStatusPagFilter] = useState<string>('all');
  const [statusMakeFilter, setStatusMakeFilter] = useState<string>('all');
  const [matchFilter, setMatchFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [duplicateSelections, setDuplicateSelections] = useState<Record<string, string>>({});

  // Collect unique status_make values for dynamic filter
  const uniqueStatusMake = useMemo(() => {
    const set = new Set<string>();
    vendas.forEach(v => {
      if (v.status_make) set.add(v.status_make.trim());
    });
    return Array.from(set).sort();
  }, [vendas]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setMatchRan(false);
    try {
      const allVendas: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('comissionamento_vendas')
          .select(`
            id, venda_interna_id, status_pag, receita_interna, receita_lal, lal_apelido, linha_operadora_id,
            vendas_internas!comissionamento_vendas_venda_interna_id_fkey(
              cliente_nome, cpf_cnpj, protocolo_interno, status_make, valor, data_venda,
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

      const mapped: ComVenda[] = allVendas.map((row: any) => {
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
          data_venda: vi?.data_venda,
          matched_linha_id: row.linha_operadora_id || null,
          matched_valor_lq: row.receita_lal || null,
          matched_apelido: row.lal_apelido || null,
          is_atencao: false,
          atencao_key: undefined,
        };
      });

      const lalData = lalRes.data || [];
      setVendas(mapped);
      setLals(lalData);

      // Auto-run pre-match if there are LALs and unprocessed vendas
      if (lalData.length > 0) {
        await runPreMatch(mapped, lalData);
      }
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [comissionamentoId]);

  const runPreMatch = async (vendasData: ComVenda[], lalData: any[]) => {
    try {
      const lalApelidos = lalData.map((l: any) => l.apelido);
      const lalMatchMap = new Map<string, string>();
      lalData.forEach((l: any) => lalMatchMap.set(l.apelido, l.tipo_match));

      // Fetch all linhas for all LALs
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

      const normDoc = normalizeCpfCnpjForMatch;
      const linhasByProtocolo = new Map<string, any[]>();
      const linhasByCpf = new Map<string, any[]>();

      for (const linha of allLinhas) {
        if (linha.protocolo_operadora) {
          const key = linha.protocolo_operadora.trim();
          if (!linhasByProtocolo.has(key)) linhasByProtocolo.set(key, []);
          linhasByProtocolo.get(key)!.push(linha);
        }
        if (linha.cpf_cnpj) {
          const key = normDoc(linha.cpf_cnpj);
          if (!linhasByCpf.has(key)) linhasByCpf.set(key, []);
          linhasByCpf.get(key)!.push(linha);
        }
      }

      // Phase 1: Find which match key each venda would use
      type MatchCandidate = {
        vendaIndex: number;
        matchKey: string;
        matchType: 'protocolo' | 'cpf';
        linhas: any[];
        apelido: string;
      };

      const candidates: MatchCandidate[] = [];

      vendasData.forEach((venda, index) => {
        if (venda.linha_operadora_id) return; // already linked in DB

        for (const lal of lalData) {
          const tipoMatch = lal.tipo_match;

          if (tipoMatch === 'protocolo' && venda.protocolo_interno) {
            const key = venda.protocolo_interno.trim();
            const linhas = linhasByProtocolo.get(key);
            if (linhas && linhas.length > 0) {
              candidates.push({ vendaIndex: index, matchKey: `proto:${key}`, matchType: 'protocolo', linhas, apelido: lal.apelido });
              return; // first match wins per venda
            }
          }

          if (tipoMatch === 'cpf' && venda.cpf_cnpj) {
            const key = normDoc(venda.cpf_cnpj);
            const linhas = linhasByCpf.get(key);
            if (linhas && linhas.length > 0) {
              candidates.push({ vendaIndex: index, matchKey: `cpf:${key}`, matchType: 'cpf', linhas, apelido: lal.apelido });
              return;
            }
          }
        }
      });

      // Phase 2: Group candidates by matchKey to find duplicates
      const groupedByKey = new Map<string, MatchCandidate[]>();
      for (const c of candidates) {
        if (!groupedByKey.has(c.matchKey)) groupedByKey.set(c.matchKey, []);
        groupedByKey.get(c.matchKey)!.push(c);
      }

      // Also check already-linked vendas for duplicate detection
      const linkedKeys = new Set<string>();
      for (const v of vendasData) {
        if (v.linha_operadora_id) {
          for (const [key, linhas] of linhasByProtocolo) {
            if (linhas.some(l => l.id === v.linha_operadora_id)) {
              linkedKeys.add(`proto:${key}`);
              break;
            }
          }
          for (const [key, linhas] of linhasByCpf) {
            if (linhas.some(l => l.id === v.linha_operadora_id)) {
              linkedKeys.add(`cpf:${key}`);
              break;
            }
          }
        }
      }

      // Phase 3: Apply matches and flag duplicates
      const updated = vendasData.map((venda, index) => {
        if (venda.linha_operadora_id) return venda;

        const candidate = candidates.find(c => c.vendaIndex === index);
        if (!candidate) {
          return { ...venda, matched_linha_id: null, matched_valor_lq: null, matched_apelido: null, is_duplicada: false, duplicata_key: undefined };
        }

        const group = groupedByKey.get(candidate.matchKey)!;
        const isAlreadyLinked = linkedKeys.has(candidate.matchKey);
        const isDuplicate = group.length > 1 || isAlreadyLinked;

        const totalValorLq = candidate.linhas.reduce((sum: number, l: any) => sum + Number(l.valor_lq || 0), 0);
        const primaryLinha = candidate.linhas[0];

        return {
          ...venda,
          matched_linha_id: primaryLinha.id,
          matched_valor_lq: totalValorLq,
          matched_apelido: candidate.apelido,
          is_duplicada: isDuplicate,
          duplicata_key: isDuplicate ? candidate.matchKey : undefined,
        };
      });

      setVendas(updated);
      setMatchRan(true);
    } catch (err: any) {
      console.error('Pre-match error:', err);
    }
  };

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
      result = result.filter(v => (v.status_make || '').toLowerCase() === statusMakeFilter.toLowerCase());
    }
    if (matchFilter !== 'all') {
      if (matchFilter === 'encontrada') {
        result = result.filter(v => (v.matched_linha_id || v.linha_operadora_id) && !v.is_duplicada);
      } else if (matchFilter === 'duplicada') {
        result = result.filter(v => v.is_duplicada);
      } else {
        result = result.filter(v => !v.matched_linha_id && !v.linha_operadora_id);
      }
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
  }, [vendas, statusPagFilter, statusMakeFilter, matchFilter, searchTerm]);

  const displayedVendas = filteredVendas.slice(0, 200);

  // Group duplicates by duplicata_key for accordion view
  const duplicateGroups = useMemo(() => {
    if (matchFilter !== 'duplicada') return new Map<string, ComVenda[]>();
    const groups = new Map<string, ComVenda[]>();
    filteredVendas.forEach(v => {
      if (v.duplicata_key) {
        if (!groups.has(v.duplicata_key)) groups.set(v.duplicata_key, []);
        groups.get(v.duplicata_key)!.push(v);
      }
    });
    return groups;
  }, [filteredVendas, matchFilter]);

  const handleConfirmDuplicate = async (groupKey: string) => {
    const selectedId = duplicateSelections[groupKey];
    if (!selectedId) { toast.error('Selecione o registro válido antes de confirmar'); return; }

    const group = duplicateGroups.get(groupKey);
    if (!group) return;

    setIsProcessing(true);
    try {
      // Mark selected as OK
      const selected = group.find(v => v.id === selectedId)!;
      const okUpdate: any = { status_pag: 'OK' };
      if (!selected.linha_operadora_id && selected.matched_linha_id) {
        okUpdate.linha_operadora_id = selected.matched_linha_id;
        okUpdate.receita_lal = selected.matched_valor_lq;
        okUpdate.lal_apelido = selected.matched_apelido;
      }
      await supabase.from('comissionamento_vendas').update(okUpdate).eq('id', selectedId);

      // Mark others as DESCONTADA
      const otherIds = group.filter(v => v.id !== selectedId).map(v => v.id);
      if (otherIds.length > 0) {
        await supabase.from('comissionamento_vendas').update({ status_pag: 'DESCONTADA' }).in('id', otherIds);
      }

      toast.success(`Conciliação confirmada: 1 OK, ${otherIds.length} descartadas`);
      setDuplicateSelections(prev => { const next = { ...prev }; delete next[groupKey]; return next; });
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

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

  const bulkSaveAndMark = async (newStatus: 'OK' | 'DESCONTADA') => {
    if (selectedIds.size === 0) { toast.error('Selecione vendas primeiro'); return; }
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const vendasToUpdate = vendas.filter(v => ids.includes(v.id));

      for (let i = 0; i < vendasToUpdate.length; i += 50) {
        const batch = vendasToUpdate.slice(i, i + 50);
        await Promise.all(
          batch.map(v => {
            const updateData: any = { status_pag: newStatus };
            // If pre-matched but not yet saved to DB, save the link too
            if (!v.linha_operadora_id && v.matched_linha_id) {
              updateData.linha_operadora_id = v.matched_linha_id;
              updateData.receita_lal = v.matched_valor_lq;
              updateData.lal_apelido = v.matched_apelido;
            }
            return supabase.from('comissionamento_vendas').update(updateData).eq('id', v.id);
          })
        );
        setProgress({ current: Math.min(i + 50, vendasToUpdate.length), total: vendasToUpdate.length });
      }

      toast.success(`${vendasToUpdate.length} vendas marcadas como ${newStatus}`);
      setSelectedIds(new Set());
      setSelectAll(false);
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const bulkRemoveFromCommission = async () => {
    if (selectedIds.size === 0) { toast.error('Selecione vendas primeiro'); return; }
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error } = await supabase
          .from('comissionamento_vendas')
          .delete()
          .in('id', batch);
        if (error) throw error;
        setProgress({ current: Math.min(i + 50, ids.length), total: ids.length });
      }
      toast.success(`${ids.length} vendas removidas da competência`);
      setSelectedIds(new Set());
      setSelectAll(false);
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const formatBRL = (v: number | null) =>
    v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '-';

  const statusPagBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-xs">Pendente</Badge>;
    if (status === 'OK') return <Badge className="bg-success/20 text-success text-xs">OK</Badge>;
    return <Badge className="bg-destructive/20 text-destructive text-xs">DESCONTADA</Badge>;
  };

  const matchBadge = (v: ComVenda) => {
    if (v.linha_operadora_id && !v.is_duplicada) return <Badge className="bg-success/20 text-success text-xs">Vinculada</Badge>;
    if (v.is_duplicada) return <Badge className="bg-warning/20 text-warning text-xs">⚠ Duplicada</Badge>;
    if (v.matched_linha_id) return <Badge className="bg-accent text-accent-foreground text-xs">Encontrada</Badge>;
    return <Badge variant="outline" className="text-xs text-muted-foreground">Não encontrada</Badge>;
  };

  const matchStats = useMemo(() => {
    const total = vendas.length;
    const found = vendas.filter(v => (v.matched_linha_id || v.linha_operadora_id) && !v.is_duplicada).length;
    const duplicadas = vendas.filter(v => v.is_duplicada).length;
    const notFound = total - found - duplicadas;
    const percentage = total > 0 ? ((found / total) * 100).toFixed(1) : '0';
    return { total, found, notFound, duplicadas, percentage };
  }, [vendas]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando e analisando matches...</p>
      </div>
    );
  }

  const stats = {
    total: vendas.length,
    ok: vendas.filter(v => v.status_pag === 'OK').length,
    descontada: vendas.filter(v => v.status_pag === 'DESCONTADA').length,
    pendente: vendas.filter(v => !v.status_pag).length,
  };

  return (
    <div className="space-y-4">
      {/* Match Indicators */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total no Comissionamento</p>
              <p className="text-xl font-bold">{matchStats.total}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Encontradas no LAL</p>
              <p className="text-xl font-bold text-success">{matchStats.found}</p>
            </div>
            <div className="text-center cursor-pointer" onClick={() => setMatchFilter(matchFilter === 'duplicada' ? 'all' : 'duplicada')}>
              <p className="text-xs text-muted-foreground">Duplicadas</p>
              <p className="text-xl font-bold text-warning">{matchStats.duplicadas}</p>
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

      {/* Status Pag Summary */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </Card>
        <Card className="p-3 text-center cursor-pointer hover:bg-accent/50" onClick={() => setStatusPagFilter(statusPagFilter === 'OK' ? 'all' : 'OK')}>
          <p className="text-xs text-muted-foreground">OK</p>
          <p className="text-lg font-bold text-success">{stats.ok}</p>
        </Card>
        <Card className="p-3 text-center cursor-pointer hover:bg-accent/50" onClick={() => setStatusPagFilter(statusPagFilter === 'DESCONTADA' ? 'all' : 'DESCONTADA')}>
          <p className="text-xs text-muted-foreground">Descontada</p>
          <p className="text-lg font-bold text-destructive">{stats.descontada}</p>
        </Card>
        <Card className="p-3 text-center cursor-pointer hover:bg-accent/50" onClick={() => setStatusPagFilter(statusPagFilter === 'vazio' ? 'all' : 'vazio')}>
          <p className="text-xs text-muted-foreground">Pendente</p>
          <p className="text-lg font-bold text-warning">{stats.pendente}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-8 pl-8 w-48 text-sm"
          />
        </div>
        <Select value={matchFilter} onValueChange={setMatchFilter}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Match LAL" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="encontrada">Encontrada no LAL</SelectItem>
            <SelectItem value="duplicada">⚠ Duplicadas</SelectItem>
            <SelectItem value="nao_encontrada">Não Encontrada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusMakeFilter} onValueChange={setStatusMakeFilter}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Status Pedido" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {uniqueStatusMake.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusPagFilter} onValueChange={setStatusPagFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status Pag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="OK">OK</SelectItem>
            <SelectItem value="DESCONTADA">Descontada</SelectItem>
            <SelectItem value="vazio">Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={loadData} className="h-8 gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Recarregar
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredVendas.length} resultados
        </span>
      </div>

      {/* Bulk Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        {selectedIds.size > 0 ? (
          <>
            <span className="text-sm font-medium">{selectedIds.size} selecionadas</span>
            <Button size="sm" onClick={() => bulkSaveAndMark('OK')} disabled={isProcessing} className="gap-1.5">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Marcar como OK
            </Button>
            <Button size="sm" variant="destructive" onClick={() => bulkSaveAndMark('DESCONTADA')} disabled={isProcessing} className="gap-1.5">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Marcar como DESCONTADA
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={isProcessing} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                  Remover da Competência
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover {selectedIds.size} vendas da competência?</AlertDialogTitle>
                  <AlertDialogDescription>
                    As vendas serão removidas deste comissionamento. Elas continuarão existindo no sistema, apenas não farão parte desta competência. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkRemoveFromCommission} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Confirmar Remoção
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" variant="ghost" onClick={() => { setSelectedIds(new Set()); setSelectAll(false); }}>
              Limpar seleção
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Use os filtros para encontrar as vendas desejadas, selecione e marque como OK ou DESCONTADA.
          </p>
        )}
      </div>

      {progress && (
        <div className="space-y-1">
          <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">{progress.current} / {progress.total}</p>
        </div>
      )}

      {/* Duplicate Accordion View */}
      {matchFilter === 'duplicada' && duplicateGroups.size > 0 ? (
        <div className="border rounded-lg">
          <Accordion type="multiple" className="w-full">
            {Array.from(duplicateGroups.entries()).map(([groupKey, group]) => {
              const first = group[0];
              const lalValue = first.matched_valor_lq ?? first.receita_lal;
              return (
                <AccordionItem key={groupKey} value={groupKey} className="border-b last:border-b-0">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/30">
                    <div className="flex items-center gap-4 text-left w-full mr-4">
                      <Badge className="bg-warning/20 text-warning text-xs shrink-0">
                        {group.length} registros
                      </Badge>
                      <span className="text-sm font-medium truncate max-w-[200px]">{first.cliente_nome || '-'}</span>
                      <span className="text-xs font-mono text-muted-foreground">{first.cpf_cnpj || first.protocolo_interno || '-'}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{formatBRL(lalValue)}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <RadioGroup
                      value={duplicateSelections[groupKey] || ''}
                      onValueChange={(val) => setDuplicateSelections(prev => ({ ...prev, [groupKey]: val }))}
                      className="space-y-2"
                    >
                      {group.map(v => (
                        <div
                          key={v.id}
                          className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
                            duplicateSelections[groupKey] === v.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-accent/20'
                          }`}
                        >
                          <RadioGroupItem value={v.id} id={`dup-${v.id}`} />
                          <Label htmlFor={`dup-${v.id}`} className="flex-1 cursor-pointer">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Vendedor:</span>{' '}
                                <span className="font-medium">{v.vendedor_nome || '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Data Venda:</span>{' '}
                                <span className="font-medium">{v.data_venda || '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Status:</span>{' '}
                                <span className="font-medium">{v.status_make || '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Pag:</span>{' '}
                                {statusPagBadge(v.status_pag)}
                              </div>
                            </div>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleConfirmDuplicate(groupKey)}
                        disabled={!duplicateSelections[groupKey] || isProcessing}
                        className="gap-1.5"
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Confirmar Conciliação
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      ) : (
        /* Standard Table View */
        <>
          <div className="overflow-x-auto border rounded-lg max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={selectAll} onCheckedChange={handleSelectAll} />
                  </TableHead>
                  <TableHead className="text-xs">Match</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">CPF</TableHead>
                  <TableHead className="text-xs">Protocolo</TableHead>
                  <TableHead className="text-xs">Vendedor</TableHead>
                  <TableHead className="text-xs">Data Venda</TableHead>
                  <TableHead className="text-xs">Status Pedido</TableHead>
                  <TableHead className="text-xs">Status Pag</TableHead>
                  <TableHead className="text-xs">Receita Int.</TableHead>
                  <TableHead className="text-xs">Receita LAL</TableHead>
                  <TableHead className="text-xs">LAL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedVendas.map(v => (
                  <TableRow key={v.id} className={`${selectedIds.has(v.id) ? 'bg-accent/50' : ''} ${v.is_duplicada ? 'bg-warning/5' : ''}`}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} />
                    </TableCell>
                    <TableCell>{matchBadge(v)}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{v.cliente_nome || '-'}</TableCell>
                    <TableCell className="text-xs font-mono">{v.cpf_cnpj || '-'}</TableCell>
                    <TableCell className="text-xs font-mono">{v.protocolo_interno || '-'}</TableCell>
                    <TableCell className="text-xs max-w-[100px] truncate">{v.vendedor_nome || '-'}</TableCell>
                    <TableCell className="text-xs">{v.data_venda || '-'}</TableCell>
                    <TableCell className="text-xs">{v.status_make || '-'}</TableCell>
                    <TableCell>{statusPagBadge(v.status_pag)}</TableCell>
                    <TableCell className="text-xs">{formatBRL(v.receita_interna)}</TableCell>
                    <TableCell className="text-xs">{formatBRL(v.matched_valor_lq ?? v.receita_lal)}</TableCell>
                    <TableCell className="text-xs max-w-[80px] truncate">{v.matched_apelido ?? v.lal_apelido ?? '-'}</TableCell>
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
        </>
      )}
    </div>
  );
}
