import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PeriodFilter } from '@/components/PeriodFilter';
import { usePeriodFilter } from '@/hooks/usePeriodFilter';

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

type SortField = keyof ConsultorPerformance;

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function PerformanceConsultor() {
  const { role } = useAuth();
  const period = usePeriodFilter('performance');
  const { dataInicio, dataFim } = period;
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('consultor_nome');
  const [sortAsc, setSortAsc] = useState(true);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['performance-consultores', dataInicio.toISOString(), dataFim.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_performance_consultores', {
        _data_inicio: format(dataInicio, 'yyyy-MM-dd'),
        _data_fim: format(dataFim, 'yyyy-MM-dd'),
      });
      if (error) throw error;
      return (data || []) as ConsultorPerformance[];
    },
  });

  const filtered = useMemo(() => {
    let result = rows;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r => r.consultor_nome.toLowerCase().includes(term));
    }
    result = [...result].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string') return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  }, [rows, searchTerm, sortField, sortAsc]);

  const totals = useMemo(() => {
    const totalVendas = filtered.reduce((s, r) => s + r.total_vendas, 0);
    const instaladas = filtered.reduce((s, r) => s + r.vendas_instaladas, 0);
    const conciliadas = filtered.reduce((s, r) => s + r.vendas_conciliadas, 0);
    const receita = filtered.reduce((s, r) => s + Number(r.receita_conciliada), 0);
    const taxa = instaladas > 0 ? (conciliadas / instaladas) * 100 : 0;
    const ticket = conciliadas > 0 ? receita / conciliadas : 0;
    return { totalVendas, instaladas, conciliadas, receita, taxa, ticket };
  }, [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
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
            <PeriodFilter {...period} />
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar consultor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-[220px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
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
                      <SortHeader field="total_vendas">Vendas Registradas</SortHeader>
                      <SortHeader field="vendas_instaladas">Vendas Instaladas</SortHeader>
                      <SortHeader field="vendas_conciliadas">Vendas Conciliadas</SortHeader>
                      <SortHeader field="receita_conciliada">Receita Conciliada</SortHeader>
                      <SortHeader field="taxa_conciliacao">Taxa Conciliação</SortHeader>
                      <SortHeader field="ticket_medio">Ticket Médio</SortHeader>
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
                        <TableCell className="text-right">{Number(row.taxa_conciliacao).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{formatBRL(Number(row.ticket_medio))}</TableCell>
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
                      <TableCell className="text-right">{totals.taxa.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{formatBRL(totals.ticket)}</TableCell>
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
