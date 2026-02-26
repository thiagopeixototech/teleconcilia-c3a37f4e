import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { registrarAuditoria } from '@/services/auditService';
import { VendaInterna, LinhaOperadora, StatusInterno, Operadora } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { DateRangeBlock } from '@/components/DateRangeBlock';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Loader2, Search, MoreHorizontal, AlertTriangle, FileX,
  ShoppingCart, FileText, Send, Filter, Download,
  X, ArrowUpDown, ArrowUp, ArrowDown, Link2,
} from 'lucide-react';
import { VinculoManualDialog } from '@/components/divergencias/VinculoManualDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

type TipoDivergencia = 'vendas' | 'linhas' | null;

type VendaComVendedor = VendaInterna & {
  vendedor?: { nome: string } | null;
  usuario?: { nome: string; email: string } | null;
};

const statusLabels: Record<string, string> = {
  nova: 'Nova',
  enviada: 'Enviada',
  aguardando: 'Aguardando',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  contestacao_enviada: 'Contestação Enviada',
  contestacao_procedente: 'Contestação Procedente',
  contestacao_improcedente: 'Contestação Improcedente',
};

const statusColors: Record<string, string> = {
  nova: 'bg-info text-info-foreground',
  enviada: 'bg-primary text-primary-foreground',
  aguardando: 'bg-warning text-warning-foreground',
  confirmada: 'bg-success text-success-foreground',
  cancelada: 'bg-destructive text-destructive-foreground',
  contestacao_enviada: 'bg-orange-500 text-white',
  contestacao_procedente: 'bg-emerald-600 text-white',
  contestacao_improcedente: 'bg-red-600 text-white',
};

type SortKeyVendas = 'vendedor' | 'protocolo_interno' | 'identificador_make' | 'cliente_nome' | 'cpf_cnpj' | 'plano' | 'valor' | 'status_interno' | 'status_make' | 'data_venda' | 'data_instalacao';
type SortKeyLinhas = 'operadora' | 'protocolo_operadora' | 'cliente_nome' | 'cpf_cnpj' | 'plano' | 'valor' | 'status_operadora' | 'apelido' | 'data_status';
type SortDir = 'asc' | 'desc';

export default function Divergencias() {
  const { user, vendedor, isAdmin, isSupervisor } = useAuth();

  // Context selection
  const [tipoDivergencia, setTipoDivergencia] = useState<TipoDivergencia>(null);

  // Data
  const [vendasSemMatch, setVendasSemMatch] = useState<VendaComVendedor[]>([]);
  const [linhasSemMatch, setLinhasSemMatch] = useState<LinhaOperadora[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [visibleCount, setVisibleCount] = useState(50);

  // Shared
  const [searchTerm, setSearchTerm] = useState('');

  // Vendas-specific filters
  const [dataVendaInicio, setDataVendaInicio] = useState<Date | null>(null);
  const [dataVendaFim, setDataVendaFim] = useState<Date | null>(null);
  const [dataInstalacaoInicio, setDataInstalacaoInicio] = useState<Date | null>(null);
  const [dataInstalacaoFim, setDataInstalacaoFim] = useState<Date | null>(null);
  const [operadoraFilter, setOperadoraFilter] = useState<string>('all');
  const [vendedorOptions, setVendedorOptions] = useState<{ id: string; nome: string }[]>([]);
  const [vendedorFilter, setVendedorFilter] = useState<string>('all');
  const [statusMakeFilter, setStatusMakeFilter] = useState<string>('all');
  const [idMakeSearch, setIdMakeSearch] = useState('');
  const [protocoloSearch, setProtocoloSearch] = useState('');
  const [statusMakeOptions, setStatusMakeOptions] = useState<string[]>([]);

  // Linhas-specific filters
  const [linhaALinhaFilter, setLinhaALinhaFilter] = useState<string>('all');
  const [linhaALinhaOptions, setLinhaALinhaOptions] = useState<string[]>([]);
  const [linhaOperadoraFilter, setLinhaOperadoraFilter] = useState<string>('all');
  const [linhaCpfSearch, setLinhaCpfSearch] = useState('');
  const [linhaProtocoloSearch, setLinhaProtocoloSearch] = useState('');
  const [linhaDataStatusInicio, setLinhaDataStatusInicio] = useState<Date | null>(null);
  const [linhaDataStatusFim, setLinhaDataStatusFim] = useState<Date | null>(null);

  // Cancel ref
  const cancelRef = useRef(false);

  // Vinculo manual dialog
  const [vinculoOpen, setVinculoOpen] = useState(false);
  const [vinculoTipo, setVinculoTipo] = useState<'venda' | 'linha'>('venda');
  const [vinculoRegistroId, setVinculoRegistroId] = useState('');
  const [vinculoRegistroLabel, setVinculoRegistroLabel] = useState('');

  // Sorting
  const [sortKeyVendas, setSortKeyVendas] = useState<SortKeyVendas | null>(null);
  const [sortKeyLinhas, setSortKeyLinhas] = useState<SortKeyLinhas | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSortVendas = (key: SortKeyVendas) => {
    if (sortKeyVendas === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKeyVendas(key);
      setSortDir('asc');
    }
  };

  const toggleSortLinhas = (key: SortKeyLinhas) => {
    if (sortKeyLinhas === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKeyLinhas(key);
      setSortDir('asc');
    }
  };

  const SortIconVendas = ({ col }: { col: SortKeyVendas }) => {
    if (sortKeyVendas !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const SortIconLinhas = ({ col }: { col: SortKeyLinhas }) => {
    if (sortKeyLinhas !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Load filter options on mount
  useEffect(() => {
    fetchOperadoras();
    fetchStatusMakeOptions();
    fetchLinhaALinhaOptions();
    fetchVendedorOptions();
  }, []);

  // Reset data when context changes
  useEffect(() => {
    setHasFetched(false);
    setVendasSemMatch([]);
    setLinhasSemMatch([]);
    setVisibleCount(50);
    clearFilters();
  }, [tipoDivergencia]);

  const fetchLinhaALinhaOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('linha_operadora')
        .select('apelido, arquivo_origem');
      if (error) throw error;
      const labels = (data || [])
        .map((d: any) => (d.apelido || d.arquivo_origem) as string)
        .filter(Boolean);
      const unique = [...new Set(labels)].sort();
      setLinhaALinhaOptions(unique);
    } catch (error) {
      console.error('Error fetching linha a linha options:', error);
    }
  };

  const fetchOperadoras = async () => {
    try {
      const { data, error } = await supabase
        .from('operadoras')
        .select('*')
        .eq('ativa', true)
        .order('nome');
      if (error) throw error;
      setOperadoras(data as Operadora[]);
    } catch (error) {
      console.error('Error fetching operadoras:', error);
    }
  };

  const fetchStatusMakeOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('vendas_internas')
        .select('status_make')
        .not('status_make', 'is', null)
        .not('status_make', 'eq', '');
      if (error) throw error;
      const unique = [...new Set((data || []).map((d: any) => d.status_make as string))].sort();
      setStatusMakeOptions(unique);
    } catch (error) {
      console.error('Error fetching status_make options:', error);
    }
  };

  const fetchVendedorOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      setVendedorOptions((data || []).map((u: any) => ({ id: u.id, nome: u.nome })));
    } catch (error) {
      console.error('Error fetching vendedor options:', error);
    }
  };

  const getOperadoraNome = (operadoraId: string | null) => {
    if (!operadoraId) return '-';
    return operadoras.find(o => o.id === operadoraId)?.nome || '-';
  };

  const clearFilters = () => {
    setSearchTerm('');
    setOperadoraFilter('all');
    setVendedorFilter('all');
    setStatusMakeFilter('all');
    setIdMakeSearch('');
    setProtocoloSearch('');
    setDataVendaInicio(null);
    setDataVendaFim(null);
    setDataInstalacaoInicio(null);
    setDataInstalacaoFim(null);
    setLinhaALinhaFilter('all');
    setLinhaOperadoraFilter('all');
    setLinhaCpfSearch('');
    setLinhaProtocoloSearch('');
    setLinhaDataStatusInicio(null);
    setLinhaDataStatusFim(null);
    setVisibleCount(50);
  };

  const handleBuscar = () => {
    cancelRef.current = false;
    setHasFetched(true);
    setVisibleCount(50);
    setIsLoading(true);
    setLoadProgress(0);
    if (tipoDivergencia === 'vendas') {
      fetchVendasSemMatch();
    } else if (tipoDivergencia === 'linhas') {
      fetchLinhasSemMatch();
    }
  };

  const handleCancelar = () => {
    cancelRef.current = true;
    setIsLoading(false);
    setLoadProgress(0);
    toast.info('Busca cancelada');
  };

  const fetchVendasSemMatch = async () => {
    try {
      setLoadProgress(5);
      const batchSize = 1000;

      // Fetch vendas in batches
      const allVendas: any[] = [];
      let from = 0;
      let hasMore = true;
      let batchNum = 0;

      while (hasMore) {
        if (cancelRef.current) return;

        let query = supabase
          .from('vendas_internas')
          .select(`*, usuario:usuarios(nome, email)`)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (dataVendaInicio) query = query.gte('data_venda', format(dataVendaInicio, 'yyyy-MM-dd'));
        if (dataVendaFim) query = query.lte('data_venda', format(dataVendaFim, 'yyyy-MM-dd'));
        if (dataInstalacaoInicio) query = query.gte('data_instalacao', format(dataInstalacaoInicio, 'yyyy-MM-dd'));
        if (dataInstalacaoFim) query = query.lte('data_instalacao', format(dataInstalacaoFim, 'yyyy-MM-dd'));

        const { data, error } = await query;
        if (error) throw error;
        if (cancelRef.current) return;
        batchNum++;

        if (data && data.length > 0) {
          allVendas.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
          setLoadProgress(Math.min(50, 5 + batchNum * 15));
        } else {
          hasMore = false;
        }
      }

      setLoadProgress(55);

      // Fetch conciliacoes
      const allConciliacoes: any[] = [];
      from = 0;
      hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('conciliacoes')
          .select('venda_interna_id')
          .eq('status_final', 'conciliado')
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allConciliacoes.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setLoadProgress(85);

      const vendasComMatch = new Set(allConciliacoes.map(c => c.venda_interna_id));
      const vendasSem = allVendas.filter(v => !vendasComMatch.has(v.id));

      setLoadProgress(95);
      setVendasSemMatch(vendasSem as VendaComVendedor[]);
      setLoadProgress(100);
    } catch (error) {
      console.error('Error fetching vendas divergentes:', error);
      toast.error('Erro ao carregar vendas divergentes');
    } finally {
      setTimeout(() => { setIsLoading(false); setLoadProgress(0); }, 300);
    }
  };

  const fetchLinhasSemMatch = async () => {
    try {
      setLoadProgress(5);
      const batchSize = 1000;

      // Fetch linhas in batches
      const allLinhas: any[] = [];
      let from = 0;
      let hasMore = true;
      let batchNum = 0;

      while (hasMore) {
        if (cancelRef.current) return;

        let query = supabase
          .from('linha_operadora')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (linhaDataStatusInicio) query = query.gte('data_status', format(linhaDataStatusInicio, 'yyyy-MM-dd'));
        if (linhaDataStatusFim) query = query.lte('data_status', format(linhaDataStatusFim, 'yyyy-MM-dd'));

        const { data, error } = await query;
        if (error) throw error;
        if (cancelRef.current) return;
        batchNum++;

        if (data && data.length > 0) {
          allLinhas.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
          setLoadProgress(Math.min(50, 5 + batchNum * 15));
        } else {
          hasMore = false;
        }
      }

      setLoadProgress(55);

      // Fetch conciliacoes
      const allConciliacoes: any[] = [];
      from = 0;
      hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('conciliacoes')
          .select('linha_operadora_id')
          .eq('status_final', 'conciliado')
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allConciliacoes.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setLoadProgress(85);

      const linhasComMatch = new Set(allConciliacoes.map(c => c.linha_operadora_id));
      const linhasSem = allLinhas.filter(l => !linhasComMatch.has(l.id));

      setLoadProgress(95);
      setLinhasSemMatch(linhasSem as LinhaOperadora[]);
      setLoadProgress(100);
    } catch (error) {
      console.error('Error fetching linhas divergentes:', error);
      toast.error('Erro ao carregar linhas divergentes');
    } finally {
      setTimeout(() => { setIsLoading(false); setLoadProgress(0); }, 300);
    }
  };

  const handleContestacao = async (vendaId: string) => {
    try {
      const { error } = await supabase
        .from('vendas_internas')
        .update({ status_interno: 'contestacao_enviada' })
        .eq('id', vendaId);
      if (error) throw error;

      await registrarAuditoria({
        venda_id: vendaId,
        user_id: user?.id,
        user_nome: vendedor?.nome,
        acao: 'MUDAR_STATUS_INTERNO',
        campo: 'status_interno',
        valor_anterior: null,
        valor_novo: 'contestacao_enviada',
      });

      toast.success('Contestação enviada com sucesso');
      fetchVendasSemMatch();
    } catch (error) {
      console.error('Error sending contestacao:', error);
      toast.error('Erro ao enviar contestação');
    }
  };

  const handleMarkAs = async (type: 'venda' | 'linha', id: string, action: string) => {
    try {
      if (type === 'venda') {
        const statusMap: Record<string, StatusInterno> = {
          ignorar: 'cancelada',
          contestacao_procedente: 'contestacao_procedente',
          contestacao_improcedente: 'contestacao_improcedente',
        };
        const newStatus = statusMap[action] || 'cancelada';

        const { error } = await supabase
          .from('vendas_internas')
          .update({
            observacoes: `[${action.toUpperCase()}] Marcado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
            status_interno: newStatus,
          })
          .eq('id', id);
        if (error) throw error;
      }
      toast.success('Registro atualizado com sucesso');
      if (tipoDivergencia === 'vendas') fetchVendasSemMatch();
    } catch (error) {
      console.error('Error marking record:', error);
      toast.error('Erro ao atualizar registro');
    }
  };

  // Client-side filters for vendas
  const filteredVendas = (() => {
    const filtered = vendasSemMatch.filter(venda => {
      const matchesSearch = !searchTerm ||
        venda.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.protocolo_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.identificador_make?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.usuario?.nome?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesOperadora = operadoraFilter === 'all' || venda.operadora_id === operadoraFilter;
      const matchesVendedor = vendedorFilter === 'all' || venda.usuario_id === vendedorFilter;
      const matchesStatusMake = statusMakeFilter === 'all' ||
        (statusMakeFilter === '_empty_' ? (!venda.status_make || venda.status_make === '') : venda.status_make === statusMakeFilter);
      const matchesIdMake = !idMakeSearch ||
        venda.identificador_make?.toLowerCase().includes(idMakeSearch.toLowerCase());
      const matchesProtocolo = !protocoloSearch ||
        venda.protocolo_interno?.toLowerCase().includes(protocoloSearch.toLowerCase());

      return matchesSearch && matchesOperadora && matchesVendedor && matchesStatusMake && matchesIdMake && matchesProtocolo;
    });

    if (!sortKeyVendas) return filtered;

    return [...filtered].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortKeyVendas) {
        case 'vendedor':
          valA = a.usuario?.nome || '';
          valB = b.usuario?.nome || '';
          break;
        case 'valor':
          valA = a.valor ?? 0;
          valB = b.valor ?? 0;
          return sortDir === 'asc' ? valA - valB : valB - valA;
        case 'data_venda':
          valA = a.data_venda || '';
          valB = b.data_venda || '';
          break;
        case 'data_instalacao':
          valA = a.data_instalacao || '';
          valB = b.data_instalacao || '';
          break;
        default:
          valA = (a as any)[sortKeyVendas] || '';
          valB = (b as any)[sortKeyVendas] || '';
      }
      const cmp = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  })();

  // Client-side filters for linhas
  const filteredLinhas = (() => {
    const filtered = linhasSemMatch.filter(linha => {
      const matchesSearch = !searchTerm ||
        linha.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        linha.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        linha.protocolo_operadora?.toLowerCase().includes(searchTerm.toLowerCase());

      const linhaLabel = linha.apelido || linha.arquivo_origem || '';
      const matchesLinhaALinha = linhaALinhaFilter === 'all' ||
        (linhaALinhaFilter === '_sem_' ? !linhaLabel : linhaLabel === linhaALinhaFilter);

      const matchesOperadora = linhaOperadoraFilter === 'all' ||
        linha.operadora === linhaOperadoraFilter;

      const matchesCpf = !linhaCpfSearch ||
        linha.cpf_cnpj?.toLowerCase().includes(linhaCpfSearch.toLowerCase());

      const matchesProtocolo = !linhaProtocoloSearch ||
        linha.protocolo_operadora?.toLowerCase().includes(linhaProtocoloSearch.toLowerCase());

      return matchesSearch && matchesLinhaALinha && matchesOperadora && matchesCpf && matchesProtocolo;
    });

    if (!sortKeyLinhas) return filtered;

    return [...filtered].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortKeyLinhas) {
        case 'valor':
          valA = a.valor_lq ?? a.valor ?? 0;
          valB = b.valor_lq ?? b.valor ?? 0;
          return sortDir === 'asc' ? valA - valB : valB - valA;
        case 'apelido':
          valA = a.apelido || a.arquivo_origem || '';
          valB = b.apelido || b.arquivo_origem || '';
          break;
        case 'data_status':
          valA = a.data_status || '';
          valB = b.data_status || '';
          break;
        default:
          valA = (a as any)[sortKeyLinhas] || '';
          valB = (b as any)[sortKeyLinhas] || '';
      }
      const cmp = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  })();

  // CSV Export
  const exportVendasCSV = () => {
    const headers = ['Vendedor', 'Protocolo', 'ID Make', 'Cliente', 'CPF/CNPJ', 'Operadora', 'Plano', 'Valor', 'Status Make', 'Data Venda', 'Data Instalação'];
    const rows = filteredVendas.map(v => [
      v.usuario?.nome || '',
      v.protocolo_interno || '',
      v.identificador_make || '',
      v.cliente_nome,
      v.cpf_cnpj || '',
      getOperadoraNome(v.operadora_id),
      v.plano || '',
      v.valor?.toString() || '',
      v.status_make || '',
      format(new Date(v.data_venda), 'dd/MM/yyyy'),
      v.data_instalacao ? format(new Date(v.data_instalacao), 'dd/MM/yyyy') : '',
    ]);
    downloadCSV(headers, rows, 'divergencias_vendas');
  };

  const exportLinhasCSV = () => {
    const headers = ['Operadora', 'Protocolo', 'Cliente', 'CPF/CNPJ', 'Plano', 'Valor', 'Status', 'Data Status', 'Lote'];
    const rows = filteredLinhas.map(l => [
      l.operadora,
      l.protocolo_operadora || '',
      l.cliente_nome || '',
      l.cpf_cnpj || '',
      l.plano || '',
      (l.valor_lq || l.valor)?.toString() || '',
      l.status_operadora,
      l.data_status ? format(new Date(l.data_status), 'dd/MM/yyyy') : '',
      l.apelido || l.arquivo_origem || '',
    ]);
    downloadCSV(headers, rows, 'divergencias_linhas');
  };

  const downloadCSV = (headers: string[], rows: string[][], name: string) => {
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Unique operadora names from linhas data for linhas filter
  const linhaOperadoraNames = [...new Set(linhasSemMatch.map(l => l.operadora))].sort();

  return (
    <AppLayout title="Divergências">
      <div className="space-y-6">

        {/* Step 1: Context Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Análise de Divergências
            </CardTitle>
            <CardDescription>
              Selecione o tipo de análise para visualizar os filtros correspondentes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Label className="text-sm font-medium">Tipo de Divergência</Label>
              <RadioGroup
                value={tipoDivergencia || ''}
                onValueChange={(v) => setTipoDivergencia(v as TipoDivergencia)}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <label
                  htmlFor="ctx-vendas"
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    tipoDivergencia === 'vendas'
                      ? 'border-destructive bg-destructive/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <RadioGroupItem value="vendas" id="ctx-vendas" className="mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-destructive" />
                      <span className="font-medium">Vendas não confirmadas pela operadora</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Vendas internas que não possuem registro correspondente nos dados da operadora
                    </p>
                  </div>
                </label>

                <label
                  htmlFor="ctx-linhas"
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    tipoDivergencia === 'linhas'
                      ? 'border-warning bg-warning/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <RadioGroupItem value="linhas" id="ctx-linhas" className="mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-warning" />
                      <span className="font-medium">Ordens da operadora sem venda registrada</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Registros importados da operadora que não foram vinculados a vendas internas
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Dynamic Filters */}
        {tipoDivergencia && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Filtros — {tipoDivergencia === 'vendas' ? 'Base de Vendas Internas' : 'Base da Operadora'}
                  </p>
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
                    <X className="h-3 w-3" />
                    Limpar filtros
                  </Button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={
                      tipoDivergencia === 'vendas'
                        ? 'Buscar por cliente, CPF/CNPJ, protocolo, ID Make ou vendedor...'
                        : 'Buscar por cliente, CPF/CNPJ ou protocolo...'
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Vendas-specific filters */}
                {tipoDivergencia === 'vendas' && (
                  <>
                    <div className="flex flex-wrap gap-6">
                      <DateRangeBlock
                        label="Data de Venda"
                        dateFrom={dataVendaInicio}
                        dateTo={dataVendaFim}
                        onDateFromChange={setDataVendaInicio}
                        onDateToChange={setDataVendaFim}
                      />
                      <DateRangeBlock
                        label="Data de Instalação"
                        dateFrom={dataInstalacaoInicio}
                        dateTo={dataInstalacaoFim}
                        onDateFromChange={setDataInstalacaoInicio}
                        onDateToChange={setDataInstalacaoFim}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs mb-1.5 block">Status Make</Label>
                        <Select value={statusMakeFilter} onValueChange={setStatusMakeFilter}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="_empty_">Sem Status</SelectItem>
                            {statusMakeOptions.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">Operadora</Label>
                        <Select value={operadoraFilter} onValueChange={setOperadoraFilter}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Operadora" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas Operadoras</SelectItem>
                            {operadoras.map((op) => (
                              <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {(isAdmin || isSupervisor) && (
                        <div>
                          <Label className="text-xs mb-1.5 block">Vendedor</Label>
                          <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos Vendedores</SelectItem>
                              {vendedorOptions.map(({ id, nome }) => (
                                <SelectItem key={id} value={id}>{nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs mb-1.5 block">ID Make</Label>
                        <Input
                          placeholder="Buscar ID Make..."
                          value={idMakeSearch}
                          onChange={(e) => setIdMakeSearch(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">Protocolo</Label>
                        <Input
                          placeholder="Buscar protocolo..."
                          value={protocoloSearch}
                          onChange={(e) => setProtocoloSearch(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Linhas-specific filters */}
                {tipoDivergencia === 'linhas' && (
                  <>
                    <div className="flex flex-wrap gap-6">
                      <DateRangeBlock
                        label="Data do Status"
                        dateFrom={linhaDataStatusInicio}
                        dateTo={linhaDataStatusFim}
                        onDateFromChange={setLinhaDataStatusInicio}
                        onDateToChange={setLinhaDataStatusFim}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs mb-1.5 block">Lote / Arquivo</Label>
                        <Select value={linhaALinhaFilter} onValueChange={setLinhaALinhaFilter}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os Lotes</SelectItem>
                            <SelectItem value="_sem_">Sem Apelido</SelectItem>
                            {linhaALinhaOptions.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">Operadora</Label>
                        <Select value={linhaOperadoraFilter} onValueChange={setLinhaOperadoraFilter}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            {operadoras.map((op) => (
                              <SelectItem key={op.id} value={op.nome}>{op.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">CPF/CNPJ</Label>
                        <Input
                          placeholder="Buscar CPF/CNPJ..."
                          value={linhaCpfSearch}
                          onChange={(e) => setLinhaCpfSearch(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">Protocolo</Label>
                        <Input
                          placeholder="Buscar protocolo operadora..."
                          value={linhaProtocoloSearch}
                          onChange={(e) => setLinhaProtocoloSearch(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Buscar button */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    onClick={tipoDivergencia === 'vendas' ? exportVendasCSV : exportLinhasCSV}
                    disabled={!hasFetched}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <div className="flex gap-2">
                    {isLoading && (
                      <Button variant="destructive" onClick={handleCancelar} className="gap-2">
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                    )}
                    <Button onClick={handleBuscar} disabled={isLoading} className="gap-2">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Buscar
                    </Button>
                  </div>
                </div>

                {isLoading && (
                  <div className="space-y-1 pt-2">
                    <Progress value={loadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">Carregando... {loadProgress}%</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {hasFetched && !isLoading && tipoDivergencia === 'vendas' && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{filteredVendas.length}</p>
                    <p className="text-sm text-muted-foreground">Vendas sem Match</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                    <Send className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {vendasSemMatch.filter(v => v.status_interno.startsWith('contestacao_')).length}
                    </p>
                    <p className="text-sm text-muted-foreground">Em Contestação</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{vendasSemMatch.length}</p>
                    <p className="text-sm text-muted-foreground">Total Divergente</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {hasFetched && !isLoading && tipoDivergencia === 'linhas' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{filteredLinhas.length}</p>
                    <p className="text-sm text-muted-foreground">Linhas sem Match</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{linhasSemMatch.length}</p>
                    <p className="text-sm text-muted-foreground">Total sem Vínculo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Results: Vendas */}
        {tipoDivergencia === 'vendas' && hasFetched && !isLoading && (
          <Card>
            <CardHeader>
              <CardTitle>Vendas sem Correspondência</CardTitle>
              <CardDescription>
                Vendas que ainda não foram conciliadas com registros da operadora
              </CardDescription>
              {filteredVendas.length > visibleCount && (
                <p className="text-sm text-muted-foreground">
                  Mostrando {Math.min(visibleCount, filteredVendas.length)} de {filteredVendas.length}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('vendedor')}>
                        <span className="flex items-center">Vendedor<SortIconVendas col="vendedor" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('protocolo_interno')}>
                        <span className="flex items-center">Protocolo<SortIconVendas col="protocolo_interno" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('identificador_make')}>
                        <span className="flex items-center">ID Make<SortIconVendas col="identificador_make" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('cliente_nome')}>
                        <span className="flex items-center">Cliente<SortIconVendas col="cliente_nome" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('cpf_cnpj')}>
                        <span className="flex items-center">CPF/CNPJ<SortIconVendas col="cpf_cnpj" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('valor')}>
                        <span className="flex items-center">Valor<SortIconVendas col="valor" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('status_make')}>
                        <span className="flex items-center">Status Make<SortIconVendas col="status_make" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('data_venda')}>
                        <span className="flex items-center">Data Venda<SortIconVendas col="data_venda" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortVendas('data_instalacao')}>
                        <span className="flex items-center">Data Instalação<SortIconVendas col="data_instalacao" /></span>
                      </TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVendas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          <FileX className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          Nenhuma divergência encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredVendas.slice(0, visibleCount).map((venda) => (
                        <TableRow key={venda.id}>
                          <TableCell className="text-sm">{venda.usuario?.nome || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{venda.protocolo_interno || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{venda.identificador_make || '-'}</TableCell>
                          <TableCell className="font-medium">{venda.cliente_nome}</TableCell>
                          <TableCell className="font-mono text-sm">{venda.cpf_cnpj || '-'}</TableCell>
                          <TableCell>
                            {venda.valor
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)
                              : '-'
                            }
                          </TableCell>
                          <TableCell className="text-sm">{venda.status_make || '-'}</TableCell>
                          <TableCell>
                            {format(new Date(venda.data_venda), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {venda.data_instalacao
                              ? format(new Date(venda.data_instalacao), 'dd/MM/yyyy', { locale: ptBR })
                              : '-'
                            }
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setVinculoTipo('venda');
                                  setVinculoRegistroId(venda.id);
                                  setVinculoRegistroLabel(`${venda.cliente_nome} — ${venda.protocolo_interno || venda.identificador_make || venda.cpf_cnpj || 'Sem identificador'}`);
                                  setVinculoOpen(true);
                                }}>
                                  <Link2 className="h-4 w-4 mr-2" />
                                  Vincular Manualmente
                                </DropdownMenuItem>
                                {!venda.status_interno.startsWith('contestacao_') && (
                                  <DropdownMenuItem onClick={() => handleContestacao(venda.id)}>
                                    <Send className="h-4 w-4 mr-2" />
                                    Enviar Contestação
                                  </DropdownMenuItem>
                                )}
                                {venda.status_interno === 'contestacao_enviada' && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleMarkAs('venda', venda.id, 'contestacao_procedente')}>
                                      Contestação Procedente
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleMarkAs('venda', venda.id, 'contestacao_improcedente')}>
                                      Contestação Improcedente
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleMarkAs('venda', venda.id, 'ignorar')}
                                  className="text-destructive"
                                >
                                  Cancelar Venda
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {filteredVendas.length > visibleCount && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCount(prev => prev + 50)}
                    className="w-full md:w-auto"
                  >
                    Mostrar mais ({filteredVendas.length - visibleCount} restantes)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Results: Linhas */}
        {tipoDivergencia === 'linhas' && hasFetched && !isLoading && (
          <Card>
            <CardHeader>
              <CardTitle>Registros da Operadora sem Correspondência</CardTitle>
              <CardDescription>
                Registros importados que não foram vinculados a vendas internas
              </CardDescription>
              {filteredLinhas.length > visibleCount && (
                <p className="text-sm text-muted-foreground">
                  Mostrando {Math.min(visibleCount, filteredLinhas.length)} de {filteredLinhas.length}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('operadora')}>
                        <span className="flex items-center">Operadora<SortIconLinhas col="operadora" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('protocolo_operadora')}>
                        <span className="flex items-center">Protocolo<SortIconLinhas col="protocolo_operadora" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('cliente_nome')}>
                        <span className="flex items-center">Cliente<SortIconLinhas col="cliente_nome" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('cpf_cnpj')}>
                        <span className="flex items-center">CPF/CNPJ<SortIconLinhas col="cpf_cnpj" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('plano')}>
                        <span className="flex items-center">Plano<SortIconLinhas col="plano" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('valor')}>
                        <span className="flex items-center">Valor LQ<SortIconLinhas col="valor" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('status_operadora')}>
                        <span className="flex items-center">Status<SortIconLinhas col="status_operadora" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('data_status')}>
                        <span className="flex items-center">Data Status<SortIconLinhas col="data_status" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSortLinhas('apelido')}>
                        <span className="flex items-center">Lote<SortIconLinhas col="apelido" /></span>
                      </TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLinhas.length === 0 ? (
                      <TableRow>
                         <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          <FileX className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          Nenhuma divergência encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLinhas.slice(0, visibleCount).map((linha) => (
                        <TableRow key={linha.id}>
                          <TableCell className="font-medium">{linha.operadora}</TableCell>
                          <TableCell className="font-mono text-sm">{linha.protocolo_operadora || '-'}</TableCell>
                          <TableCell>{linha.cliente_nome || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{linha.cpf_cnpj || '-'}</TableCell>
                          <TableCell>{linha.plano || '-'}</TableCell>
                          <TableCell>
                            {linha.valor_lq
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(linha.valor_lq)
                              : linha.valor
                                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(linha.valor)
                                : '-'
                            }
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{linha.status_operadora}</Badge>
                          </TableCell>
                          <TableCell>
                            {linha.data_status
                              ? format(new Date(linha.data_status), 'dd/MM/yyyy', { locale: ptBR })
                              : '-'
                            }
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {linha.apelido || linha.arquivo_origem || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => {
                                setVinculoTipo('linha');
                                setVinculoRegistroId(linha.id);
                                setVinculoRegistroLabel(`${linha.operadora} — ${linha.cliente_nome || linha.protocolo_operadora || linha.cpf_cnpj || 'Sem identificador'}`);
                                setVinculoOpen(true);
                              }}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Vincular
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {filteredLinhas.length > visibleCount && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCount(prev => prev + 50)}
                    className="w-full md:w-auto"
                  >
                    Mostrar mais ({filteredLinhas.length - visibleCount} restantes)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty state when no context selected */}
        {!tipoDivergencia && (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Filter className="h-10 w-10 opacity-40" />
                <p className="text-lg font-medium">Selecione o tipo de análise acima</p>
                <p className="text-sm">Os filtros serão exibidos de acordo com o contexto escolhido</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vinculo Manual Dialog */}
        <VinculoManualDialog
          open={vinculoOpen}
          onOpenChange={setVinculoOpen}
          tipo={vinculoTipo}
          registroId={vinculoRegistroId}
          registroLabel={vinculoRegistroLabel}
          onSuccess={() => {
            if (tipoDivergencia === 'vendas') fetchVendasSemMatch();
            else if (tipoDivergencia === 'linhas') fetchLinhasSemMatch();
          }}
        />
      </div>
    </AppLayout>
  );
}
