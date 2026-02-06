import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PendingAccessMessage } from '@/components/PendingAccessMessage';
import { 
  ShoppingCart, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  Loader2 
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface DashboardStats {
  totalVendas: number;
  vendasInstaladas: number;
  vendasConfirmadas: number;
  vendasCanceladas: number;
  valorTotal: number;
  percentualConciliacao: number;
}

const COLORS = ['hsl(215, 70%, 45%)', 'hsl(142, 70%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'];

export default function Dashboard() {
  const { vendedor, isAdmin, isSupervisor, role } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [vendasPorStatus, setVendasPorStatus] = useState<{ name: string; value: number }[]>([]);

  // Usuário sem role e sem vendedor vinculado = acesso pendente
  const isPendingAccess = !role && !vendedor && !isAdmin;

  useEffect(() => {
    if (!isPendingAccess) {
      fetchDashboardData();
    } else {
      setIsLoading(false);
    }
  }, [vendedor, isPendingAccess]);

  const fetchDashboardData = async () => {
    try {
      // Fetch vendas internas
      const { data: vendas, error } = await supabase
        .from('vendas_internas')
        .select('*');

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

      // Fetch conciliacoes
      const { data: conciliacoes } = await supabase
        .from('conciliacoes')
        .select('*');

      const conciliadas = conciliacoes?.filter(c => c.status_final === 'conciliado').length || 0;
      const percentualConciliacao = vendasInstaladas > 0 ? (conciliadas / vendasInstaladas) * 100 : 0;

      setStats({
        totalVendas,
        vendasInstaladas,
        vendasConfirmadas,
        vendasCanceladas,
        valorTotal,
        percentualConciliacao,
      });

      // Status distribution for pie chart
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

  if (isLoading) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  // Mostrar mensagem para usuários sem acesso
  if (isPendingAccess) {
    return (
      <AppLayout title="Dashboard">
        <PendingAccessMessage />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                {new Intl.NumberFormat('pt-BR', { 
                  style: 'currency', 
                  currency: 'BRL' 
                }).format(stats?.valorTotal || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                em vendas instaladas
              </p>
            </CardContent>
          </Card>
        </div>

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
      </div>
    </AppLayout>
  );
}
