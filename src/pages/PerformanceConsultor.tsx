import { useState, useMemo, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Search, X, ArrowUpDown, ArrowUp, ArrowDown, Download, Filter, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRangeBlock } from '@/components/DateRangeBlock';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { VendaInterna, StatusInterno, Operadora } from '@/types/database';
import { toast } from 'sonner';

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const statusColors: Record<StatusInterno, string> = {
  nova: 'bg-info text-info-foreground',
  enviada: 'bg-primary text-primary-foreground',
  aguardando: 'bg-warning text-warning-foreground',
  confirmada: 'bg-success text-success-foreground',
  cancelada: 'bg-destructive text-destructive-foreground',
  contestacao_enviada: 'bg-orange-500 text-white',
  contestacao_procedente: 'bg-emerald-600 text-white',
  contestacao_improcedente: 'bg-red-600 text-white',
};

const statusLabels: Record<StatusInterno, string> = {
  nova: 'Nova',
  enviada: 'Enviada',
  aguardando: 'Aguardando',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  contestacao_enviada: 'Enviada p/ Contestação',
  contestacao_procedente: 'Contestação Procedente',
  contestacao_improcedente: 'Contestação Improcedente',
};

type VendaComExtras = VendaInterna & {
  usuario?: { nome: string; email: string } | null;
  empresa?: { nome: string } | null;
  _linha_a_linha_apelido?: string;
  _valor_lal?: number | null;
  _status_pag?: string | null;
  _comissionamento_desconto?: string | null;
  _receita_descontada?: number | null;
  _receita_interna?: number | null;
};

type SortKey = 'protocolo_interno' | 'identificador_make' | 'cliente_nome' | 'cpf_cnpj' | 'operadora' | 'empresa' | 'plano' | 'valor' | 'status_interno' | 'status_make' | 'data_venda' | 'data_instalacao' | 'linha_a_linha' | 'valor_lal' | 'status_pag' | 'comissionamento_desconto' | 'receita_descontada' | 'receita_interna' | 'telefone';
type SortDir = 'asc' | 'desc';

export default function PerformanceConsultor() {
  const { isAdmin, isSupervisor } = useAuth();
  const [vendedorFilter, setVendedorFilter] = useState<string>('all');
  const [vendedorOptions, setVendedorOptions] = useState<{ id: string; nome: string }[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [vendas, setVendas] = useState<VendaComExtras[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [visibleCount, setVisibleCount] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const cancelRef = useRef(false);

  // Date filters
  const [dataVendaInicio, setDataVendaInicio] = useState<Date | null>(null);
  const [dataVendaFim, setDataVendaFim] = useState<Date | null>(null);
  const [dataInstalacaoInicio, setDataInstalacaoInicio] = useState<Date | null>(null);
  const [dataInstalacaoFim, setDataInstalacaoFim] = useState<Date | null>(null);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Detail dialog
  const [selectedVenda, setSelectedVenda] = useState<VendaComExtras | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  useEffect(() => {
    const fetchOptions = async () => {
      const [vendedoresRes, operadorasRes] = await Promise.all([
        supabase.from('usuarios').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('operadoras').select('*').eq('ativa', true).order('nome'),
      ]);
      setVendedorOptions((vendedoresRes.data || []).map((u: any) => ({ id: u.id, nome: u.nome })));
      setOperadoras((operadorasRes.data || []) as Operadora[]);
    };
    fetchOptions();
  }, []);

  const getOperadoraNome = (id: string | null) => {
    if (!id) return '-';
    return operadoras.find(o => o.id === id)?.nome || '-';
  };

  const handleBuscar = () => {
    if (vendedorFilter === 'all') {
      toast.warning('Selecione um vendedor para buscar');
      return;
    }
    cancelRef.current = false;
    setHasFetched(true);
    setVisibleCount(50);
    setIsLoading(true);
    setLoadProgress(0);
    fetchVendas();
  };

  const handleCancelar = () => {
    cancelRef.current = true;
    setIsLoading(false);
    setLoadProgress(0);
    toast.info('Busca cancelada');
  };

  const fetchVendas = async () => {
    try {
      const allVendas: any[] = [];
      const batchSize = 1000;
      let from = 0;
      let hasMore = true;
      let batchNum = 0;
      setLoadProgress(5);

      while (hasMore) {
        if (cancelRef.current) return;
        let query = supabase
          .from('vendas_internas')
          .select(`*, usuario:usuarios(nome, email), empresa:empresas(nome)`)
          .eq('usuario_id', vendedorFilter)
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
          setLoadProgress(Math.min(70, 5 + batchNum * 25));
        } else {
          hasMore = false;
        }
      }

      setLoadProgress(75);

      // Enrich with conciliacoes
      const vendaIds = allVendas.map(v => v.id);
      const conciliacaoMap: Record<string, { apelido: string; valor_lal: number | null }> = {};

      if (vendaIds.length > 0) {
        for (let i = 0; i < vendaIds.length; i += 500) {
          const batch = vendaIds.slice(i, i + 500);
          const { data: concData } = await supabase
            .from('conciliacoes')
            .select('venda_interna_id, linha_operadora_id, status_final')
            .in('venda_interna_id', batch)
            .eq('status_final', 'conciliado');

          if (concData && concData.length > 0) {
            const linhaIds = concData.map(c => c.linha_operadora_id);
            const { data: linhaData } = await supabase
              .from('linha_operadora')
              .select('id, apelido, arquivo_origem, valor_lq')
              .in('id', linhaIds);

            const linhaMap: Record<string, { label: string; valor: number | null }> = {};
            linhaData?.forEach(l => {
              linhaMap[l.id] = { label: l.apelido || l.arquivo_origem || '', valor: l.valor_lq };
            });
            concData.forEach(c => {
              const info = linhaMap[c.linha_operadora_id];
              if (info) conciliacaoMap[c.venda_interna_id] = { apelido: info.label, valor_lal: info.valor };
            });
          }
        }
      }

      // Enrich with comissionamento
      const comissaoMap: Record<string, { status_pag: string | null; comissionamento_desconto: string | null; receita_descontada: number | null; receita_interna: number | null }> = {};
      if (vendaIds.length > 0) {
        for (let i = 0; i < vendaIds.length; i += 500) {
          const batch = vendaIds.slice(i, i + 500);
          const { data: comData } = await supabase
            .from('comissionamento_vendas')
            .select('venda_interna_id, status_pag, comissionamento_desconto, receita_descontada, receita_interna')
            .in('venda_interna_id', batch);
          comData?.forEach(c => {
            comissaoMap[c.venda_interna_id] = {
              status_pag: c.status_pag,
              comissionamento_desconto: c.comissionamento_desconto,
              receita_descontada: c.receita_descontada,
              receita_interna: c.receita_interna,
            };
          });
        }
      }

      setLoadProgress(95);

      const enriched = allVendas.map(v => ({
        ...v,
        _linha_a_linha_apelido: conciliacaoMap[v.id]?.apelido || '',
        _valor_lal: conciliacaoMap[v.id]?.valor_lal || null,
        _status_pag: comissaoMap[v.id]?.status_pag || null,
        _comissionamento_desconto: comissaoMap[v.id]?.comissionamento_desconto || null,
        _receita_descontada: comissaoMap[v.id]?.receita_descontada || null,
        _receita_interna: comissaoMap[v.id]?.receita_interna || null,
      }));

      setVendas(enriched as VendaComExtras[]);
      setLoadProgress(100);
    } catch (error) {
      console.error('Error fetching vendas:', error);
      toast.error('Erro ao carregar vendas');
    } finally {
      setTimeout(() => { setIsLoading(false); setLoadProgress(0); }, 300);
    }
  };

  const filteredVendas = useMemo(() => {
    let result = vendas.filter(v => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return v.cliente_nome.toLowerCase().includes(s) ||
        v.cpf_cnpj?.toLowerCase().includes(s) ||
        v.protocolo_interno?.toLowerCase().includes(s) ||
        v.identificador_make?.toLowerCase().includes(s) ||
        v.telefone?.toLowerCase().includes(s);
    });

    if (!sortKey) return result;

    return [...result].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortKey) {
        case 'operadora': valA = getOperadoraNome(a.operadora_id); valB = getOperadoraNome(b.operadora_id); break;
        case 'empresa': valA = a.empresa?.nome || ''; valB = b.empresa?.nome || ''; break;
        case 'valor': case 'valor_lal': case 'receita_interna': case 'receita_descontada':
          valA = sortKey === 'valor' ? (a.valor ?? 0) : sortKey === 'valor_lal' ? (a._valor_lal ?? 0) : sortKey === 'receita_interna' ? (a._receita_interna ?? 0) : (a._receita_descontada ?? 0);
          valB = sortKey === 'valor' ? (b.valor ?? 0) : sortKey === 'valor_lal' ? (b._valor_lal ?? 0) : sortKey === 'receita_interna' ? (b._receita_interna ?? 0) : (b._receita_descontada ?? 0);
          return sortDir === 'asc' ? valA - valB : valB - valA;
        case 'linha_a_linha': valA = a._linha_a_linha_apelido || ''; valB = b._linha_a_linha_apelido || ''; break;
        default: valA = (a as any)[sortKey] || ''; valB = (b as any)[sortKey] || '';
      }
      const cmp = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [vendas, searchTerm, sortKey, sortDir, operadoras]);

  // Summary
  const summary = useMemo(() => {
    const total = filteredVendas.length;
    const valorTotal = filteredVendas.reduce((s, v) => s + (v.valor ?? 0), 0);
    const valorLal = filteredVendas.reduce((s, v) => s + (v._valor_lal ?? 0), 0);
    const receitaInterna = filteredVendas.reduce((s, v) => s + (v._receita_interna ?? 0), 0);
    const descontada = filteredVendas.reduce((s, v) => s + (v._receita_descontada ?? 0), 0);
    return { total, valorTotal, valorLal, receitaInterna, descontada };
  }, [filteredVendas]);

  const exportToCSV = () => {
    const headers = ['Protocolo', 'ID Make', 'Cliente', 'CPF/CNPJ', 'Telefone', 'Operadora', 'Empresa', 'Plano', 'Valor', 'Status Interno', 'Status Make', 'Data Venda', 'Data Instalação', 'Linha a Linha', 'Valor LAL', 'Valor Interno', 'Status Pag', 'Desconto', 'Receita Descontada'];
    const rows = filteredVendas.map(v => [
      v.protocolo_interno || '', v.identificador_make || '', v.cliente_nome, v.cpf_cnpj || '', v.telefone || '',
      getOperadoraNome(v.operadora_id), v.empresa?.nome || '', v.plano || '', v.valor?.toString() || '',
      statusLabels[v.status_interno] || v.status_interno, v.status_make || '',
      format(new Date(v.data_venda), 'dd/MM/yyyy'), v.data_instalacao ? format(new Date(v.data_instalacao), 'dd/MM/yyyy') : '',
      v._linha_a_linha_apelido || '', v._valor_lal?.toString() || '', v._receita_interna?.toString() || '',
      v._status_pag || '', v._comissionamento_desconto || '', v._receita_descontada?.toString() || '',
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const vendedorNome = vendedorOptions.find(v => v.id === vendedorFilter)?.nome || 'vendedor';
    link.download = `detalhado_${vendedorNome.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectedVendedorNome = vendedorOptions.find(v => v.id === vendedorFilter)?.nome;

  return (
    <AppLayout title="Detalhado por Consultor">
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs mb-1.5 block">Vendedor *</Label>
                <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Selecione...</SelectItem>
                    {vendedorOptions.map(({ id, nome }) => (
                      <SelectItem key={id} value={id}>{nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <DateRangeBlock label="Data de Venda" dateFrom={dataVendaInicio} dateTo={dataVendaFim} onDateFromChange={setDataVendaInicio} onDateToChange={setDataVendaFim} />
              <DateRangeBlock label="Data de Instalação" dateFrom={dataInstalacaoInicio} dateTo={dataInstalacaoFim} onDateFromChange={setDataInstalacaoInicio} onDateToChange={setDataInstalacaoFim} />
            </div>
            <div className="flex items-center gap-3">
              {isLoading && (
                <Button variant="destructive" onClick={handleCancelar} className="gap-2">
                  <X className="h-4 w-4" /> Cancelar
                </Button>
              )}
              <Button onClick={handleBuscar} disabled={isLoading || vendedorFilter === 'all'} className="gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
              {vendedorFilter === 'all' && (
                <p className="text-sm text-muted-foreground">Selecione um vendedor para buscar.</p>
              )}
            </div>
            {isLoading && (
              <div className="space-y-1">
                <Progress value={loadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">Carregando... {loadProgress}%</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {hasFetched && !isLoading && filteredVendas.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card><CardContent className="pt-4 pb-3 text-center"><div className="text-lg font-bold">{summary.total}</div><p className="text-xs text-muted-foreground">Total Vendas</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center"><div className="text-lg font-bold">{formatBRL(summary.valorTotal)}</div><p className="text-xs text-muted-foreground">Valor Total</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center"><div className="text-lg font-bold">{formatBRL(summary.valorLal)}</div><p className="text-xs text-muted-foreground">Valor LAL</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center"><div className="text-lg font-bold">{formatBRL(summary.receitaInterna)}</div><p className="text-xs text-muted-foreground">Valor Interno</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center"><div className="text-lg font-bold">{formatBRL(summary.descontada)}</div><p className="text-xs text-muted-foreground">Receita Descontada</p></CardContent></Card>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {selectedVendedorNome ? `Vendas de ${selectedVendedorNome}` : 'Vendas'} ({filteredVendas.length})
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 w-52" />
              </div>
              {filteredVendas.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-1">
                  <Download className="h-4 w-4" /> CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {([
                      ['protocolo_interno', 'Protocolo'],
                      ['identificador_make', 'ID Make'],
                      ['cliente_nome', 'Cliente'],
                      ['cpf_cnpj', 'CPF/CNPJ'],
                      ['telefone', 'Telefone'],
                      ['operadora', 'Operadora'],
                      ['empresa', 'Empresa'],
                      ['plano', 'Plano'],
                      ['valor', 'Valor'],
                      ['status_interno', 'Status'],
                      ['status_make', 'Status Make'],
                      ['data_venda', 'Data Venda'],
                      ['data_instalacao', 'Data Instalação'],
                      ['linha_a_linha', 'Linha a Linha'],
                      ['valor_lal', 'Valor LAL'],
                      ['receita_interna', 'Valor Interno'],
                      ['status_pag', 'Status Pag'],
                      ['comissionamento_desconto', 'Desconto'],
                      ['receita_descontada', 'Receita Desc.'],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <TableHead key={key} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(key)}>
                        <span className="flex items-center">{label}<SortIcon col={key} /></span>
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!hasFetched ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Filter className="h-8 w-8 opacity-40" />
                          <p>Selecione um vendedor e clique em <strong>Buscar</strong></p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : isLoading ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : filteredVendas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                        Nenhuma venda encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendas.slice(0, visibleCount).map(venda => (
                      <TableRow key={venda.id}>
                        <TableCell className="font-mono text-sm">{venda.protocolo_interno || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{venda.identificador_make || '-'}</TableCell>
                        <TableCell className="font-medium">{venda.cliente_nome}</TableCell>
                        <TableCell className="font-mono text-sm">{venda.cpf_cnpj || '-'}</TableCell>
                        <TableCell className="text-sm">{venda.telefone || '-'}</TableCell>
                        <TableCell>{getOperadoraNome(venda.operadora_id)}</TableCell>
                        <TableCell className="text-sm">{venda.empresa?.nome || '-'}</TableCell>
                        <TableCell className="text-sm">{venda.plano || '-'}</TableCell>
                        <TableCell>{venda.valor ? formatBRL(venda.valor) : '-'}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[venda.status_interno]}>
                            {statusLabels[venda.status_interno]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{venda.status_make || '-'}</TableCell>
                        <TableCell>{format(new Date(venda.data_venda), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                        <TableCell>{venda.data_instalacao ? format(new Date(venda.data_instalacao), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{venda._linha_a_linha_apelido || '-'}</TableCell>
                        <TableCell>{venda._valor_lal != null ? formatBRL(venda._valor_lal) : '-'}</TableCell>
                        <TableCell>{venda._receita_interna != null ? formatBRL(venda._receita_interna) : '-'}</TableCell>
                        <TableCell>
                          {venda._status_pag ? (
                            <Badge variant={venda._status_pag === 'OK' ? 'default' : 'destructive'}>{venda._status_pag}</Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm">{venda._comissionamento_desconto || '-'}</TableCell>
                        <TableCell>{venda._receita_descontada != null ? formatBRL(venda._receita_descontada) : '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedVenda(venda); setIsDetailOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredVendas.length > visibleCount && (
              <div className="flex justify-center p-4">
                <Button variant="outline" onClick={() => setVisibleCount(prev => prev + 50)} className="w-full md:w-auto">
                  Mostrar mais ({filteredVendas.length - visibleCount} restantes)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Venda</DialogTitle>
              <DialogDescription>Protocolo: {selectedVenda?.protocolo_interno || 'N/A'}</DialogDescription>
            </DialogHeader>
            {selectedVenda && (
              <div className="grid grid-cols-2 gap-4 py-4">
                {([
                  ['Cliente', selectedVenda.cliente_nome],
                  ['CPF/CNPJ', selectedVenda.cpf_cnpj],
                  ['Telefone', selectedVenda.telefone],
                  ['Operadora', getOperadoraNome(selectedVenda.operadora_id)],
                  ['Empresa', selectedVenda.empresa?.nome],
                  ['Plano', selectedVenda.plano],
                  ['Valor', selectedVenda.valor ? formatBRL(selectedVenda.valor) : null],
                  ['Status Interno', statusLabels[selectedVenda.status_interno]],
                  ['Status Make', selectedVenda.status_make],
                  ['ID Make', selectedVenda.identificador_make],
                  ['Data Venda', format(new Date(selectedVenda.data_venda), 'dd/MM/yyyy')],
                  ['Data Instalação', selectedVenda.data_instalacao ? format(new Date(selectedVenda.data_instalacao), 'dd/MM/yyyy') : null],
                  ['Linha a Linha', selectedVenda._linha_a_linha_apelido],
                  ['Valor LAL', selectedVenda._valor_lal != null ? formatBRL(selectedVenda._valor_lal) : null],
                  ['Valor Interno', selectedVenda._receita_interna != null ? formatBRL(selectedVenda._receita_interna) : null],
                  ['Status Pag', selectedVenda._status_pag],
                  ['Desconto', selectedVenda._comissionamento_desconto],
                  ['Receita Descontada', selectedVenda._receita_descontada != null ? formatBRL(selectedVenda._receita_descontada) : null],
                  ['Endereço', selectedVenda.endereco],
                  ['CEP', selectedVenda.cep],
                ] as [string, string | null | undefined][]).map(([label, value]) => (
                  <div key={label}>
                    <Label className="text-muted-foreground">{label}</Label>
                    <p className="font-medium">{value || '-'}</p>
                  </div>
                ))}
                {selectedVenda.observacoes && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Observações</Label>
                    <p className="font-medium whitespace-pre-wrap">{selectedVenda.observacoes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
