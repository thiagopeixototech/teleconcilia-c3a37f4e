import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, ArrowUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRangeBlock } from '@/components/DateRangeBlock';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

interface ConsultorPerformance {
  usuario_id: string;
  consultor_nome: string;
  total_vendas: number;
  vendas_instaladas: number;
  vendas_conciliadas: number;
  receita_conciliada: number;
  taxa_conciliacao: number;
  ticket_medio: number;
}

type SortField = 'consultor_nome' | 'total_vendas' | 'vendas_instaladas' | 'vendas_conciliadas' | 'receita_conciliada' | 'taxa_conciliacao' | 'ticket_medio' | 'valor_estornado' | 'receita_liquida' | 'taxa_estorno' | 'irl';

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function irlColor(irl: number): string {
  if (irl >= 90) return 'text-success';
  if (irl >= 75) return 'text-warning';
  return 'text-destructive';
}

function irlBadge(irl: number) {
  if (irl >= 90) return <Badge variant="outline" className="border-success text-success text-xs">{irl.toFixed(1)}%</Badge>;
  if (irl >= 75) return <Badge variant="outline" className="border-warning text-warning text-xs">{irl.toFixed(1)}%</Badge>;
  return <Badge variant="outline" className="border-destructive text-destructive text-xs">{irl.toFixed(1)}%</Badge>;
}

export default function PerformanceConsultor() {
  const { role } = useAuth();
  const [selectedConsultores, setSelectedConsultores] = useState<Set<string>>(new Set());
  const [consultorOptions, setConsultorOptions] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('receita_liquida');
  const [sortAsc, setSortAsc] = useState(false);

  // Independent date filters
  const [dataVendaInicio, setDataVendaInicio] = useState<Date | null>(null);
  const [dataVendaFim, setDataVendaFim] = useState<Date | null>(null);
  const [dataInstalacaoInicio, setDataInstalacaoInicio] = useState<Date | null>(null);
  const [dataInstalacaoFim, setDataInstalacaoFim] = useState<Date | null>(null);

  const dataVendaInicioStr = dataVendaInicio ? format(dataVendaInicio, 'yyyy-MM-dd') : null;
  const dataVendaFimStr = dataVendaFim ? format(dataVendaFim, 'yyyy-MM-dd') : null;
  const dataInstalacaoInicioStr = dataInstalacaoInicio ? format(dataInstalacaoInicio, 'yyyy-MM-dd') : null;
  const dataInstalacaoFimStr = dataInstalacaoFim ? format(dataInstalacaoFim, 'yyyy-MM-dd') : null;

  const hasDateFilter = dataVendaInicio || dataVendaFim || dataInstalacaoInicio || dataInstalacaoFim;

  // Manual search trigger
  const [searchParams, setSearchParams] = useState<{
    vendaInicio: string | null;
    vendaFim: string | null;
    instalacaoInicio: string | null;
    instalacaoFim: string | null;
  } | null>(null);

  const handleBuscar = () => {
    setSearchParams({
      vendaInicio: dataVendaInicioStr,
      vendaFim: dataVendaFimStr,
      instalacaoInicio: dataInstalacaoInicioStr,
      instalacaoFim: dataInstalacaoFimStr,
    });
  };

  // Fetch all consultores on mount (independent of date filters)
  useEffect(() => {
    const fetchConsultores = async () => {
      try {
        const { data, error } = await supabase
          .from('usuarios')
          .select('nome')
          .eq('ativo', true)
          .order('nome');
        if (error) throw error;
        setConsultorOptions((data || []).map((u: any) => u.nome as string));
      } catch (error) {
        console.error('Error fetching consultores:', error);
      }
    };
    fetchConsultores();
  }, []);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['performance-consultores', searchParams],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_performance_consultores', {
        _data_venda_inicio: searchParams!.vendaInicio,
        _data_venda_fim: searchParams!.vendaFim,
        _data_instalacao_inicio: searchParams!.instalacaoInicio,
        _data_instalacao_fim: searchParams!.instalacaoFim,
      });
      if (error) throw error;
      return (data || []) as ConsultorPerformance[];
    },
    enabled: !!searchParams,
  });

  // Fetch estornos for the period reference
  const { data: estornos = [] } = useQuery({
    queryKey: ['estornos-performance', searchParams?.vendaInicio, searchParams?.vendaFim],
    queryFn: async () => {
      if (!searchParams?.vendaInicio && !searchParams?.vendaFim) return [];
      const startMonth = searchParams?.vendaInicio ? searchParams.vendaInicio.substring(0, 7) : '2000-01';
      const endMonth = searchParams?.vendaFim ? searchParams.vendaFim.substring(0, 7) : '2099-12';
      
      const { data, error } = await (supabase as any)
        .from('estornos')
        .select('venda_id, valor_estornado')
        .gte('referencia_desconto', startMonth)
        .lte('referencia_desconto', endMonth);
      if (error) throw error;
      return (data || []) as { venda_id: string | null; valor_estornado: number }[];
    },
    enabled: !!(searchParams?.vendaInicio || searchParams?.vendaFim),
  });

  const vendaIds = useMemo(() => {
    return [...new Set(estornos.filter(e => e.venda_id).map(e => e.venda_id!))];
  }, [estornos]);

  const { data: vendaUsuarioMap = {} } = useQuery({
    queryKey: ['venda-usuario-map', vendaIds],
    queryFn: async () => {
      if (vendaIds.length === 0) return {};
      const map: Record<string, string> = {};
      for (let i = 0; i < vendaIds.length; i += 500) {
        const batch = vendaIds.slice(i, i + 500);
        const { data } = await supabase
          .from('vendas_internas')
          .select('id, usuario_id')
          .in('id', batch);
        data?.forEach(v => { map[v.id] = v.usuario_id; });
      }
      return map;
    },
    enabled: vendaIds.length > 0,
  });

  const estornosPorUsuario = useMemo(() => {
    const map: Record<string, number> = {};
    estornos.forEach(e => {
      if (e.venda_id && vendaUsuarioMap[e.venda_id]) {
        const uid = vendaUsuarioMap[e.venda_id];
        map[uid] = (map[uid] || 0) + Number(e.valor_estornado);
      }
    });
    return map;
  }, [estornos, vendaUsuarioMap]);

  const enrichedRows = useMemo(() => {
    return rows.map(r => {
      const receita = Number(r.receita_conciliada);
      const estorno = estornosPorUsuario[r.usuario_id] || 0;
      const liquida = receita - estorno;
      const taxaEstorno = receita > 0 ? (estorno / receita) * 100 : 0;
      const irl = receita > 0 ? (liquida / receita) * 100 : 0;
      return { ...r, valor_estornado: estorno, receita_liquida: liquida, taxa_estorno: taxaEstorno, irl };
    });
  }, [rows, estornosPorUsuario]);

  // Use independently loaded consultores list
  const allConsultores = consultorOptions;

  const toggleConsultor = (nome: string) => {
    setSelectedConsultores(prev => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome); else next.add(nome);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = enrichedRows;
    if (selectedConsultores.size > 0) {
      result = result.filter(r => selectedConsultores.has(r.consultor_nome));
    }
    result = [...result].sort((a, b) => {
      const aVal = (a as any)[sortField];
      const bVal = (b as any)[sortField];
      if (typeof aVal === 'string') return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  }, [enrichedRows, selectedConsultores, sortField, sortAsc]);

  const totals = useMemo(() => {
    const totalVendas = filtered.reduce((s, r) => s + r.total_vendas, 0);
    const instaladas = filtered.reduce((s, r) => s + r.vendas_instaladas, 0);
    const conciliadas = filtered.reduce((s, r) => s + r.vendas_conciliadas, 0);
    const receita = filtered.reduce((s, r) => s + Number(r.receita_conciliada), 0);
    const estornos = filtered.reduce((s, r) => s + r.valor_estornado, 0);
    const liquida = receita - estornos;
    const taxa = instaladas > 0 ? (conciliadas / instaladas) * 100 : 0;
    const ticket = conciliadas > 0 ? receita / conciliadas : 0;
    const taxaEstorno = receita > 0 ? (estornos / receita) * 100 : 0;
    const irl = receita > 0 ? (liquida / receita) * 100 : 0;
    return { totalVendas, instaladas, conciliadas, receita, estornos, liquida, taxa, ticket, taxaEstorno, irl };
  }, [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(field === 'consultor_nome'); }
  };

  const SortHeader = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={cn("cursor-pointer select-none hover:bg-muted/50 transition-colors", className)}
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn("h-3 w-3", sortField === field ? "text-primary" : "text-muted-foreground/40")} />
      </div>
    </TableHead>
  );

  return (
    <AppLayout title="Performance do Consultor">
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <div className="flex items-center gap-3">
              <Button onClick={handleBuscar} disabled={!hasDateFilter || isLoading} className="gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
              {!hasDateFilter && (
                <p className="text-sm text-muted-foreground">Selecione pelo menos um período de data para visualizar os dados.</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2 min-w-[220px] justify-start">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    {selectedConsultores.size === 0
                      ? 'Todos os consultores'
                      : `${selectedConsultores.size} selecionado(s)`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2 max-h-64 overflow-y-auto" align="start">
                  {allConsultores.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">Nenhum consultor disponível</p>
                  ) : (
                    <div className="space-y-1">
                      {allConsultores.map((nome) => (
                        <label
                          key={nome}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={selectedConsultores.has(nome)}
                            onCheckedChange={() => toggleConsultor(nome)}
                          />
                          {nome}
                        </label>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {selectedConsultores.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedConsultores(new Set())} className="gap-1 text-xs">
                  <X className="h-3 w-3" />
                  Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {!isLoading && searchParams && filtered.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-lg font-bold">{totals.totalVendas}</div>
                <p className="text-xs text-muted-foreground">Registradas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-lg font-bold">{totals.instaladas}</div>
                <p className="text-xs text-muted-foreground">Instaladas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-lg font-bold text-success">{formatBRL(totals.receita)}</div>
                <p className="text-xs text-muted-foreground">Receita Conciliada</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-lg font-bold text-destructive">{formatBRL(totals.estornos)}</div>
                <p className="text-xs text-muted-foreground">Estornos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className={cn("text-lg font-bold", irlColor(totals.irl))}>{formatBRL(totals.liquida)}</div>
                <p className="text-xs text-muted-foreground">Receita Líquida</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className={cn("text-lg font-bold", irlColor(totals.irl))}>{totals.irl.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">IRL Geral</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {!searchParams ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                Clique em "Buscar" para visualizar a performance.
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                Nenhum dado encontrado para o período selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHeader field="consultor_nome">Consultor</SortHeader>
                      <SortHeader field="total_vendas" className="text-center">Registradas</SortHeader>
                      <SortHeader field="vendas_instaladas" className="text-center">Instaladas</SortHeader>
                      <SortHeader field="vendas_conciliadas" className="text-center">Conciliadas</SortHeader>
                      <SortHeader field="receita_conciliada" className="text-right">Receita</SortHeader>
                      <SortHeader field="valor_estornado" className="text-right">Estornos</SortHeader>
                      <SortHeader field="receita_liquida" className="text-right">Rec. Líquida</SortHeader>
                      <SortHeader field="taxa_estorno" className="text-right">% Estorno</SortHeader>
                      <SortHeader field="irl" className="text-right">IRL</SortHeader>
                      <SortHeader field="taxa_conciliacao" className="text-right">% Conc.</SortHeader>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <TableRow key={row.usuario_id}>
                        <TableCell className="font-medium">{row.consultor_nome}</TableCell>
                        <TableCell className="text-center">{row.total_vendas}</TableCell>
                        <TableCell className="text-center">{row.vendas_instaladas}</TableCell>
                        <TableCell className="text-center">{row.vendas_conciliadas}</TableCell>
                        <TableCell className="text-right">{formatBRL(Number(row.receita_conciliada))}</TableCell>
                        <TableCell className="text-right text-destructive">{formatBRL(row.valor_estornado)}</TableCell>
                        <TableCell className={cn("text-right font-medium", irlColor(row.irl))}>{formatBRL(row.receita_liquida)}</TableCell>
                        <TableCell className="text-right">{row.taxa_estorno.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{irlBadge(row.irl)}</TableCell>
                        <TableCell className="text-right">{Number(row.taxa_conciliacao).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell>Total Geral</TableCell>
                      <TableCell className="text-center">{totals.totalVendas}</TableCell>
                      <TableCell className="text-center">{totals.instaladas}</TableCell>
                      <TableCell className="text-center">{totals.conciliadas}</TableCell>
                      <TableCell className="text-right">{formatBRL(totals.receita)}</TableCell>
                      <TableCell className="text-right text-destructive">{formatBRL(totals.estornos)}</TableCell>
                      <TableCell className={cn("text-right", irlColor(totals.irl))}>{formatBRL(totals.liquida)}</TableCell>
                      <TableCell className="text-right">{totals.taxaEstorno.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{irlBadge(totals.irl)}</TableCell>
                      <TableCell className="text-right">{totals.taxa.toFixed(1)}%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
