import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DateRangeBlock } from '@/components/DateRangeBlock';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  ShoppingCart,
  CheckCircle,
  XCircle,
  TrendingUp,
  Loader2,
  RotateCcw,
  DollarSign,
  Filter,
  X,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DashboardStats {
  totalVendas: number;
  vendasInstaladas: number;
  vendasConfirmadas: number;
  vendasCanceladas: number;
  valorTotal: number;
  valorConciliado: number;
  percentualConciliacao: number;
}

interface UsuarioOption {
  id: string;
  nome: string;
  supervisor_id: string | null;
}

const COLORS = ['hsl(38, 92%, 50%)', 'hsl(215, 70%, 45%)', 'hsl(280, 60%, 50%)', 'hsl(142, 70%, 45%)', 'hsl(0, 72%, 51%)'];

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function irlColor(irl: number): string {
  if (irl >= 90) return 'text-success';
  if (irl >= 75) return 'text-warning';
  return 'text-destructive';
}

export default function Dashboard() {
  const { vendedor, isAdmin, isSupervisor, role } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [vendasPorStatus, setVendasPorStatus] = useState<{ name: string; value: number }[]>([]);
  const [totalEstornos, setTotalEstornos] = useState(0);

  // Date filters
  const [dataVendaInicio, setDataVendaInicio] = useState<Date | null>(null);
  const [dataVendaFim, setDataVendaFim] = useState<Date | null>(null);
  const [dataInstInicio, setDataInstInicio] = useState<Date | null>(null);
  const [dataInstFim, setDataInstFim] = useState<Date | null>(null);

  // Entity filters
  const [selectedUsuarioId, setSelectedUsuarioId] = useState<string | null>(null);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | null>(null);

  // Lists for selects
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [supervisores, setSupervisores] = useState<UsuarioOption[]>([]);

  // Derived date strings for RPC
  const dataInicioStr = dataVendaInicio ? format(dataVendaInicio, 'yyyy-MM-dd') : '1900-01-01';
  const dataFimStr = dataVendaFim ? format(dataVendaFim, 'yyyy-MM-dd') : '2099-12-31';
  const dataInstInicioStr = dataInstInicio ? format(dataInstInicio, 'yyyy-MM-dd') : null;
  const dataInstFimStr = dataInstFim ? format(dataInstFim, 'yyyy-MM-dd') : null;

  // Fetch usuarios for filter dropdowns
  useEffect(() => {
    const fetchUsuarios = async () => {
      const { data } = await supabase
        .from('usuarios')
        .select('id, nome, supervisor_id')
        .eq('ativo', true)
        .order('nome');

      if (data) {
        setUsuarios(data);
        // Supervisores are those who have subordinates
        const supervisorIds = new Set(data.filter(u => u.supervisor_id).map(u => u.supervisor_id!));
        setSupervisores(data.filter(u => supervisorIds.has(u.id)));
      }
    };
    fetchUsuarios();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [vendedor, dataInicioStr, dataFimStr, dataInstInicioStr, dataInstFimStr, selectedUsuarioId, selectedSupervisorId]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);

      const rpcParams: Record<string, any> = {
        _data_inicio: dataInicioStr,
        _data_fim: dataFimStr,
      };
      if (dataInstInicioStr) rpcParams._data_instalacao_inicio = dataInstInicioStr;
      if (dataInstFimStr) rpcParams._data_instalacao_fim = dataInstFimStr;
      if (selectedUsuarioId) rpcParams._usuario_id = selectedUsuarioId;
      if (selectedSupervisorId) rpcParams._supervisor_id = selectedSupervisorId;

      const [statsResult, estornosResult] = await Promise.all([
        supabase.rpc('get_dashboard_stats', rpcParams as any),
        supabase
          .from('estornos')
          .select('valor_estornado')
          .gte('referencia_desconto', dataVendaInicio ? format(dataVendaInicio, 'yyyy-MM') : '1900-01')
          .lte('referencia_desconto', dataVendaFim ? format(dataVendaFim, 'yyyy-MM') : '2099-12'),
      ]);

      if (statsResult.error) throw statsResult.error;
      const d = statsResult.data as any;

      const vendasInstaladas = Number(d.vendas_instaladas) || 0;
      const vendasConciliadas = Number(d.vendas_conciliadas) || 0;
      const percentualConciliacao = vendasInstaladas > 0 ? (vendasConciliadas / vendasInstaladas) * 100 : 0;

      setStats({
        totalVendas: Number(d.total_vendas) || 0,
        vendasInstaladas,
        vendasConfirmadas: Number(d.vendas_confirmadas) || 0,
        vendasCanceladas: Number(d.vendas_canceladas) || 0,
        valorTotal: Number(d.valor_total) || 0,
        valorConciliado: Number(d.valor_conciliado) || 0,
        percentualConciliacao,
      });

      const estTotal = (estornosResult.data || []).reduce((s, e) => s + Number(e.valor_estornado), 0);
      setTotalEstornos(estTotal);

      setVendasPorStatus([
        { name: 'Aguardando', value: Number(d.vendas_aguardando) || 0 },
        { name: 'Nova', value: Number(d.vendas_nova) || 0 },
        { name: 'Enviada', value: Number(d.vendas_enviada) || 0 },
        { name: 'Confirmada', value: Number(d.vendas_confirmadas) || 0 },
        { name: 'Cancelada', value: Number(d.vendas_canceladas) || 0 },
      ].filter(item => item.value > 0));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const receitaLiquida = (stats?.valorConciliado || 0) - totalEstornos;
  const irl = (stats?.valorConciliado || 0) > 0 ? (receitaLiquida / stats!.valorConciliado) * 100 : 0;

  const hasActiveFilters = dataVendaInicio || dataVendaFim || dataInstInicio || dataInstFim || selectedUsuarioId || selectedSupervisorId;

  const clearAllFilters = () => {
    setDataVendaInicio(null);
    setDataVendaFim(null);
    setDataInstInicio(null);
    setDataInstFim(null);
    setSelectedUsuarioId(null);
    setSelectedSupervisorId(null);
  };

  // Filter vendedores list by selected supervisor
  const filteredVendedores = selectedSupervisorId
    ? usuarios.filter(u => u.supervisor_id === selectedSupervisorId)
    : usuarios;

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs gap-1">
                  <X className="h-3.5 w-3.5" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Data Venda */}
              <DateRangeBlock
                label="Data de Venda"
                dateFrom={dataVendaInicio}
                dateTo={dataVendaFim}
                onDateFromChange={setDataVendaInicio}
                onDateToChange={setDataVendaFim}
              />

              {/* Data Instalação */}
              <DateRangeBlock
                label="Data de Instalação"
                dateFrom={dataInstInicio}
                dateTo={dataInstFim}
                onDateFromChange={setDataInstInicio}
                onDateToChange={setDataInstFim}
              />

              {/* Supervisor */}
              {(isAdmin || isSupervisor) && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Supervisor</Label>
                  <Select
                    value={selectedSupervisorId || '_all'}
                    onValueChange={(v) => {
                      setSelectedSupervisorId(v === '_all' ? null : v);
                      // Reset vendedor when supervisor changes
                      if (v !== (selectedSupervisorId || '_all')) {
                        setSelectedUsuarioId(null);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Todos</SelectItem>
                      {supervisores.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Vendedor */}
              {(isAdmin || isSupervisor) && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Vendedor</Label>
                  <Select
                    value={selectedUsuarioId || '_all'}
                    onValueChange={(v) => setSelectedUsuarioId(v === '_all' ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Todos</SelectItem>
                      {filteredVendedores.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Vendas Instaladas
                  </CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.vendasInstaladas || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    de {stats?.totalVendas || 0} vendas totais
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Confirmadas
                  </CardTitle>
                  <CheckCircle className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">{stats?.vendasConfirmadas || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    vendas confirmadas
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    % Conciliação
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-info" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-info">
                    {stats?.percentualConciliacao.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    sobre vendas instaladas
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Valor Total
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatBRL(stats?.valorTotal || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    em vendas instaladas
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Valor Conciliado
                  </CardTitle>
                  <CheckCircle className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">
                    {formatBRL(stats?.valorConciliado || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    em vendas conciliadas
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Financial Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Resumo Financeiro
                </CardTitle>
                <CardDescription>Receita conciliada, estornos e receita líquida prevista</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Receita Conciliada</p>
                    <p className="text-xl font-bold text-success">{formatBRL(stats?.valorConciliado || 0)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <RotateCcw className="h-3 w-3 text-destructive" />
                      <p className="text-xs text-muted-foreground">Estornos</p>
                    </div>
                    <p className="text-xl font-bold text-destructive">{formatBRL(totalEstornos)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Receita Líquida</p>
                    <p className={cn("text-xl font-bold", irlColor(irl))}>{formatBRL(receitaLiquida)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground mb-1">IRL</p>
                    <p className={cn("text-xl font-bold", irlColor(irl))}>{irl.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">
                      {irl >= 90 ? '🟢 Ótimo' : irl >= 75 ? '🟡 Atenção' : '🔴 Crítico'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Vendas por Status</CardTitle>
                  <CardDescription>Distribuição das vendas por status interno</CardDescription>
                </CardHeader>
                <CardContent>
                  {vendasPorStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={vendasPorStatus}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {vendasPorStatus.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      Nenhuma venda registrada
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resumo de Conciliação</CardTitle>
                  <CardDescription>Status das conciliações realizadas</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-success" />
                        <span className="text-sm font-medium">Conciliadas</span>
                      </div>
                      <span className="text-lg font-bold">
                        {stats?.vendasConfirmadas || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-warning" />
                        <span className="text-sm font-medium">Divergentes</span>
                      </div>
                      <span className="text-lg font-bold">0</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-destructive" />
                        <span className="text-sm font-medium">Não Encontradas</span>
                      </div>
                      <span className="text-lg font-bold">
                        {(stats?.vendasInstaladas || 0) - (stats?.vendasConfirmadas || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Info */}
            {vendedor && (
              <Card>
                <CardHeader>
                  <CardTitle>Informações do Usuário</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Nome</p>
                      <p className="font-medium">{vendedor.nome}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{vendedor.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Empresa</p>
                      <p className="font-medium">{vendedor.empresa?.nome || 'Não vinculado'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
