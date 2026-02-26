import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { registrarAuditoria } from '@/services/auditService';
import { VendaInterna, LinhaOperadora, StatusInterno, Operadora } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { usePeriodFilter } from '@/hooks/usePeriodFilter';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Loader2, Search, MoreHorizontal, AlertTriangle, FileX,
  ShoppingCart, FileText, Send, Filter, Download,
  ChevronDown, ChevronUp, X, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

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

type SortKey = 'vendedor' | 'protocolo_interno' | 'cliente_nome' | 'cpf_cnpj' | 'plano' | 'valor' | 'status_interno' | 'data_venda';
type SortDir = 'asc' | 'desc';

export default function Divergencias() {
  const { user, vendedor, isAdmin, isSupervisor } = useAuth();
  const period = usePeriodFilter();

  const [vendasSemMatch, setVendasSemMatch] = useState<VendaComVendedor[]>([]);
  const [linhasSemMatch, setLinhasSemMatch] = useState<LinhaOperadora[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('vendas');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operadoraFilter, setOperadoraFilter] = useState<string>('all');
  const [vendedorFilter, setVendedorFilter] = useState<string>('all');
  const [dateField, setDateField] = useState<'data_venda' | 'data_instalacao'>('data_instalacao');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  useEffect(() => {
    fetchOperadoras();
  }, []);

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

  const getOperadoraNome = (operadoraId: string | null) => {
    if (!operadoraId) return '-';
    return operadoras.find(o => o.id === operadoraId)?.nome || '-';
  };

  const handleBuscar = () => {
    setHasFetched(true);
    setVisibleCount(50);
    setIsLoading(true);
    setLoadProgress(0);
    fetchDivergencias();
  };

  const fetchDivergencias = async () => {
    try {
      setLoadProgress(5);

      // Fetch vendas in batches
      const allVendas: any[] = [];
      const batchSize = 1000;
      let from = 0;
      let hasMore = true;
      let batchNum = 0;

      while (hasMore) {
        const { data, error } = await supabase
          .from('vendas_internas')
          .select(`
            *,
            usuario:usuarios(nome, email)
          `)
          .gte(dateField, period.dataInicioStr)
          .lte(dateField, period.dataFimStr)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) throw error;
        batchNum++;

        if (data && data.length > 0) {
          allVendas.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
          setLoadProgress(Math.min(40, 5 + batchNum * 15));
        } else {
          hasMore = false;
        }
      }

      setLoadProgress(45);

      // Fetch conciliacoes
      const allConciliacoes: any[] = [];
      from = 0;
      hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('conciliacoes')
          .select('venda_interna_id, linha_operadora_id')
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

      setLoadProgress(65);

      // Fetch linhas in batches
      const allLinhas: any[] = [];
      from = 0;
      hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('linha_operadora')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allLinhas.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setLoadProgress(85);

      // Filter: only non-reconciled
      const vendasComMatch = new Set(allConciliacoes.map(c => c.venda_interna_id));
      const linhasComMatch = new Set(allConciliacoes.map(c => c.linha_operadora_id));

      const vendasSem = allVendas.filter(v => !vendasComMatch.has(v.id));
      const linhasSem = allLinhas.filter(l => !linhasComMatch.has(l.id));

      setLoadProgress(95);
      setVendasSemMatch(vendasSem as VendaComVendedor[]);
      setLinhasSemMatch(linhasSem as LinhaOperadora[]);
      setLoadProgress(100);
    } catch (error) {
      console.error('Error fetching divergencias:', error);
      toast.error('Erro ao carregar divergências');
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setLoadProgress(0);
      }, 300);
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
      fetchDivergencias();
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
      fetchDivergencias();
    } catch (error) {
      console.error('Error marking record:', error);
      toast.error('Erro ao atualizar registro');
    }
  };

  // Filters
  const hasActiveFilters = statusFilter !== 'all' || operadoraFilter !== 'all' || vendedorFilter !== 'all';
  const activeFilterCount = [statusFilter !== 'all', operadoraFilter !== 'all', vendedorFilter !== 'all'].filter(Boolean).length;

  const clearAdvancedFilters = () => {
    setStatusFilter('all');
    setOperadoraFilter('all');
    setVendedorFilter('all');
    setVisibleCount(50);
  };

  useEffect(() => { setVisibleCount(50); }, [searchTerm, statusFilter, operadoraFilter, vendedorFilter]);

  const filteredVendas = (() => {
    const filtered = vendasSemMatch.filter(venda => {
      const matchesSearch =
        venda.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.protocolo_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.usuario?.nome?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || venda.status_interno === statusFilter;
      const matchesOperadora = operadoraFilter === 'all' || venda.operadora_id === operadoraFilter;
      const matchesVendedor = vendedorFilter === 'all' || venda.usuario_id === vendedorFilter;

      return matchesSearch && matchesStatus && matchesOperadora && matchesVendedor;
    });

    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortKey) {
        case 'vendedor':
          valA = a.usuario?.nome || '';
          valB = b.usuario?.nome || '';
          break;
        case 'valor':
          valA = a.valor ?? 0;
          valB = b.valor ?? 0;
          return sortDir === 'asc' ? valA - valB : valB - valA;
        default:
          valA = (a as any)[sortKey] || '';
          valB = (b as any)[sortKey] || '';
      }
      const cmp = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  })();

  const filteredLinhas = linhasSemMatch.filter(linha =>
    linha.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    linha.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    linha.protocolo_operadora?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const vendasContestacao = vendasSemMatch.filter(v => v.status_interno.startsWith('contestacao_'));
  const vendasAguardando = vendasSemMatch.filter(v => !v.status_interno.startsWith('contestacao_') && v.status_interno !== 'cancelada');

  // CSV Export
  const exportVendasCSV = () => {
    const headers = ['Vendedor', 'Protocolo', 'Cliente', 'CPF/CNPJ', 'Operadora', 'Plano', 'Valor', 'Status', 'Data Venda'];
    const rows = filteredVendas.map(v => [
      v.usuario?.nome || '',
      v.protocolo_interno || '',
      v.cliente_nome,
      v.cpf_cnpj || '',
      getOperadoraNome(v.operadora_id),
      v.plano || '',
      v.valor?.toString() || '',
      statusLabels[v.status_interno] || v.status_interno,
      format(new Date(v.data_venda), 'dd/MM/yyyy'),
    ]);
    downloadCSV(headers, rows, 'divergencias_vendas');
  };

  const exportLinhasCSV = () => {
    const headers = ['Operadora', 'Protocolo', 'Cliente', 'CPF/CNPJ', 'Plano', 'Valor', 'Status', 'Arquivo'];
    const rows = filteredLinhas.map(l => [
      l.operadora,
      l.protocolo_operadora || '',
      l.cliente_nome || '',
      l.cpf_cnpj || '',
      l.plano || '',
      (l.valor_lq || l.valor)?.toString() || '',
      l.status_operadora,
      l.arquivo_origem || '',
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

  return (
    <AppLayout title="Divergências">
      <div className="space-y-6">
        {/* Stats - only show after fetch */}
        {hasFetched && !isLoading && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{vendasAguardando.length}</p>
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
                    <p className="text-2xl font-bold">{vendasContestacao.length}</p>
                    <p className="text-sm text-muted-foreground">Em Contestação</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{linhasSemMatch.length}</p>
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
                    <p className="text-2xl font-bold">
                      {vendasSemMatch.length + linhasSemMatch.length}
                    </p>
                    <p className="text-sm text-muted-foreground">Total Divergências</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente, CPF/CNPJ, protocolo ou vendedor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  variant={showAdvancedFilters ? 'secondary' : 'outline'}
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Filtros {activeFilterCount > 0 && `(${activeFilterCount})`}
                </Button>
                <Button variant="outline" onClick={activeTab === 'vendas' ? exportVendasCSV : exportLinhasCSV} disabled={!hasFetched}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
              </div>

              {showAdvancedFilters && (
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Filtros</p>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearAdvancedFilters} className="gap-1 text-xs">
                        <X className="h-3 w-3" />
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={dateField} onValueChange={(v) => setDateField(v as 'data_venda' | 'data_instalacao')}>
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="data_venda">Data de Venda</SelectItem>
                        <SelectItem value="data_instalacao">Data de Instalação</SelectItem>
                      </SelectContent>
                    </Select>
                    <PeriodFilter {...period} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs mb-1.5 block">Status</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os Status</SelectItem>
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Operadora</Label>
                      <Select value={operadoraFilter} onValueChange={setOperadoraFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Operadora" />
                        </SelectTrigger>
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
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Vendedor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos Vendedores</SelectItem>
                            {Array.from(
                              new Map(vendasSemMatch.map(v => [v.usuario_id, v.usuario?.nome || 'Sem nome'])).entries()
                            ).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, nome]) => (
                              <SelectItem key={id} value={id}>{nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleBuscar} disabled={isLoading} className="gap-2">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Buscar
                    </Button>
                  </div>
                  {isLoading && (
                    <div className="space-y-1 pt-2">
                      <Progress value={loadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center">Carregando... {loadProgress}%</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="vendas" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Vendas sem Match {hasFetched && `(${filteredVendas.length})`}
            </TabsTrigger>
            <TabsTrigger value="linhas" className="gap-2">
              <FileText className="h-4 w-4" />
              Linhas sem Match {hasFetched && `(${filteredLinhas.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vendas" className="mt-6">
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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('vendedor')}>
                          <span className="flex items-center">Vendedor<SortIcon col="vendedor" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('protocolo_interno')}>
                          <span className="flex items-center">Protocolo<SortIcon col="protocolo_interno" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('cliente_nome')}>
                          <span className="flex items-center">Cliente<SortIcon col="cliente_nome" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('cpf_cnpj')}>
                          <span className="flex items-center">CPF/CNPJ<SortIcon col="cpf_cnpj" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('plano')}>
                          <span className="flex items-center">Plano<SortIcon col="plano" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('valor')}>
                          <span className="flex items-center">Valor<SortIcon col="valor" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('data_venda')}>
                          <span className="flex items-center">Data Venda<SortIcon col="data_venda" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status_interno')}>
                          <span className="flex items-center">Status<SortIcon col="status_interno" /></span>
                        </TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!hasFetched ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Filter className="h-8 w-8 opacity-40" />
                              <p>Utilize os filtros acima e clique em <strong>Buscar</strong> para carregar as divergências</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : isLoading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                          </TableCell>
                        </TableRow>
                      ) : filteredVendas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            <FileX className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            Nenhuma divergência encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredVendas.slice(0, visibleCount).map((venda) => (
                          <TableRow key={venda.id}>
                            <TableCell className="text-sm">{venda.usuario?.nome || '-'}</TableCell>
                            <TableCell className="font-mono text-sm">{venda.protocolo_interno || '-'}</TableCell>
                            <TableCell className="font-medium">{venda.cliente_nome}</TableCell>
                            <TableCell className="font-mono text-sm">{venda.cpf_cnpj || '-'}</TableCell>
                            <TableCell>{venda.plano || '-'}</TableCell>
                            <TableCell>
                              {venda.valor
                                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)
                                : '-'
                              }
                            </TableCell>
                            <TableCell>
                              {format(new Date(venda.data_venda), 'dd/MM/yyyy', { locale: ptBR })}
                            </TableCell>
                            <TableCell>
                              <Badge className={statusColors[venda.status_interno] || 'bg-muted text-muted-foreground'}>
                                {statusLabels[venda.status_interno] || venda.status_interno}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
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
                {hasFetched && filteredVendas.length > visibleCount && (
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
          </TabsContent>

          <TabsContent value="linhas" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Registros da Operadora sem Correspondência</CardTitle>
                <CardDescription>
                  Registros importados que não foram vinculados a vendas internas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Operadora</TableHead>
                        <TableHead>Protocolo</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>CPF/CNPJ</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Valor LQ</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Arquivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!hasFetched ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Filter className="h-8 w-8 opacity-40" />
                              <p>Utilize os filtros acima e clique em <strong>Buscar</strong> para carregar as divergências</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : isLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                          </TableCell>
                        </TableRow>
                      ) : filteredLinhas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            <FileX className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            Nenhuma divergência encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredLinhas.map((linha) => (
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
                            <TableCell className="text-sm text-muted-foreground">
                              {linha.arquivo_origem || '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
