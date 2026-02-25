import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { PeriodFilter } from '@/components/PeriodFilter';
import { usePeriodFilter } from '@/hooks/usePeriodFilter';
import { Badge } from '@/components/ui/badge';
import { 
  ShoppingCart, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  Loader2,
  RotateCcw,
  DollarSign,
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

const COLORS = ['hsl(215, 70%, 45%)', 'hsl(142, 70%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'];

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

  const period = usePeriodFilter();

  useEffect(() => {
    fetchDashboardData();
  }, [vendedor, period.dataInicioStr, period.dataFimStr]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const { data: vendas, error } = await supabase
        .from('vendas_internas')
        .select('*')
        .gte('data_venda', period.dataInicioStr)
        .lte('data_venda', period.dataFimStr);

      if (error) throw error;

      const totalVendas = vendas?.length || 0;
      const vendasInstaladas = vendas?.filter(v => 
        v.status_make?.toLowerCase().startsWith('instalad')
      ).length || 0;
      const vendasConfirmadas = vendas?.filter(v => v.status_interno === 'confirmada').length || 0;
      const vendasCanceladas = vendas?.filter(v => v.status_interno === 'cancelada').length || 0;
      const valorTotal = vendas?.filter(v => 
        v.status_make?.toLowerCase().startsWith('instalad')
      ).reduce((sum, v) => sum + (Number(v.valor) || 0), 0) || 0;

      const vendaIds = vendas?.map(v => v.id) || [];
      let conciliadas = 0;
      let valorConciliado = 0;

      if (vendaIds.length > 0) {
        for (let i = 0; i < vendaIds.length; i += 500) {
          const batch = vendaIds.slice(i, i + 500);
          const { data: conciliacoes } = await supabase
            .from('conciliacoes')
            .select('*, venda:vendas_internas(valor)')
            .in('venda_interna_id', batch);

          const batchConciliadas = conciliacoes?.filter(c => c.status_final === 'conciliado') || [];
          conciliadas += batchConciliadas.length;
          valorConciliado += batchConciliadas.reduce((sum, c) => sum + (Number((c as any).venda?.valor) || 0), 0);
        }
      }

      const percentualConciliacao = vendasInstaladas > 0 ? (conciliadas / vendasInstaladas) * 100 : 0;

      setStats({
        totalVendas,
        vendasInstaladas,
        vendasConfirmadas,
        vendasCanceladas,
        valorTotal,
        valorConciliado,
        percentualConciliacao,
      });

      // Fetch estornos for the period
      const startMonth = format(period.dataInicio, 'yyyy-MM');
      const endMonth = format(period.dataFim, 'yyyy-MM');
      const { data: estornosData } = await (supabase as any)
        .from('estornos')
        .select('valor_estornado')
        .gte('referencia_desconto', startMonth)
        .lte('referencia_desconto', endMonth);
      
      const estTotal = (estornosData || []).reduce((s: number, e: any) => s + Number(e.valor_estornado), 0);
      setTotalEstornos(estTotal);

      const statusCount = {
        nova: vendas?.filter(v => v.status_interno === 'nova').length || 0,
        enviada: vendas?.filter(v => v.status_interno === 'enviada').length || 0,
        confirmada: vendasConfirmadas,
        cancelada: vendasCanceladas,
      };

      setVendasPorStatus([
        { name: 'Nova', value: statusCount.nova },
        { name: 'Enviada', value: statusCount.enviada },
        { name: 'Confirmada', value: statusCount.confirmada },
        { name: 'Cancelada', value: statusCount.cancelada },
      ].filter(item => item.value > 0));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const receitaLiquida = (stats?.valorConciliado || 0) - totalEstornos;
  const irl = (stats?.valorConciliado || 0) > 0 ? (receitaLiquida / stats!.valorConciliado) * 100 : 0;


  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* Period Filter */}
        <Card>
          <CardContent className="pt-6">
            <PeriodFilter {...period} />
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
