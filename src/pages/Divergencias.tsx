import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { VendaInterna, LinhaOperadora, StatusInterno } from '@/types/database';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Loader2, 
  Search, 
  MoreHorizontal,
  AlertTriangle,
  FileX,
  ShoppingCart,
  FileText,
  Send,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

type VendaComVendedor = VendaInterna & {
  vendedor?: { nome: string } | null;
};

const statusInternoLabels: Record<string, string> = {
  nova: 'Nova',
  enviada: 'Enviada',
  aguardando: 'Aguardando',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  contestacao_enviada: 'Contestação Enviada',
  contestacao_procedente: 'Contestação Procedente',
  contestacao_improcedente: 'Contestação Improcedente',
};

const statusInternoColors: Record<string, string> = {
  nova: 'bg-blue-100 text-blue-800',
  enviada: 'bg-indigo-100 text-indigo-800',
  aguardando: 'bg-yellow-100 text-yellow-800',
  confirmada: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
  contestacao_enviada: 'bg-orange-100 text-orange-800',
  contestacao_procedente: 'bg-emerald-100 text-emerald-800',
  contestacao_improcedente: 'bg-rose-100 text-rose-800',
};

export default function Divergencias() {
  const [vendasSemMatch, setVendasSemMatch] = useState<VendaComVendedor[]>([]);
  const [linhasSemMatch, setLinhasSemMatch] = useState<LinhaOperadora[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('vendas');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchDivergencias();
  }, []);

  const fetchDivergencias = async () => {
    try {
      // Fetch vendas instaladas with vendedor
      const { data: vendas, error: vendasError } = await supabase
        .from('vendas_internas')
        .select(`
          *,
          vendedor:usuarios!vendas_internas_usuario_id_fkey(nome)
        `)
        .eq('status_make', 'instalado')
        .order('created_at', { ascending: false });

      if (vendasError) throw vendasError;

      // Fetch all conciliacoes
      const { data: conciliacoes, error: conciliacoesError } = await supabase
        .from('conciliacoes')
        .select('venda_interna_id, linha_operadora_id');

      if (conciliacoesError) throw conciliacoesError;

      // Fetch all linhas
      const { data: linhas, error: linhasError } = await supabase
        .from('linha_operadora')
        .select('*')
        .order('created_at', { ascending: false });

      if (linhasError) throw linhasError;

      // Find vendas instaladas without conciliacao
      const vendasComMatch = new Set(conciliacoes?.map(c => c.venda_interna_id) || []);
      const vendasSem = vendas?.filter(v => !vendasComMatch.has(v.id)) || [];

      // Find linhas without conciliacao
      const linhasComMatch = new Set(conciliacoes?.map(c => c.linha_operadora_id) || []);
      const linhasSem = linhas?.filter(l => !linhasComMatch.has(l.id)) || [];

      setVendasSemMatch(vendasSem as VendaComVendedor[]);
      setLinhasSemMatch(linhasSem as LinhaOperadora[]);
    } catch (error) {
      console.error('Error fetching divergencias:', error);
      toast.error('Erro ao carregar divergências');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContestacao = async (vendaId: string) => {
    try {
      const { error } = await supabase
        .from('vendas_internas')
        .update({ status_interno: 'contestacao_enviada' })
        .eq('id', vendaId);

      if (error) throw error;
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
            status_interno: newStatus
          })
          .eq('id', id);

        if (error) throw error;
      }

      toast.success(`Registro atualizado com sucesso`);
      fetchDivergencias();
    } catch (error) {
      console.error('Error marking record:', error);
      toast.error('Erro ao atualizar registro');
    }
  };

  const filteredVendas = vendasSemMatch.filter(venda => {
    const matchesSearch = 
      venda.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.protocolo_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.vendedor?.nome?.toLowerCase().includes(searchTerm.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && venda.status_interno === statusFilter;
  });

  const filteredLinhas = linhasSemMatch.filter(linha =>
    linha.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    linha.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    linha.protocolo_operadora?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const vendasContestacao = vendasSemMatch.filter(v => v.status_interno.startsWith('contestacao_'));
  const vendasAguardando = vendasSemMatch.filter(v => !v.status_interno.startsWith('contestacao_') && v.status_interno !== 'cancelada');

  if (isLoading) {
    return (
      <AppLayout title="Divergências">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Divergências">
      <div className="space-y-6">
        {/* Stats */}
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

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
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
              {activeTab === 'vendas' && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-56">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="aguardando">Aguardando</SelectItem>
                    <SelectItem value="contestacao_enviada">Contestação Enviada</SelectItem>
                    <SelectItem value="contestacao_procedente">Contestação Procedente</SelectItem>
                    <SelectItem value="contestacao_improcedente">Contestação Improcedente</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="vendas" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Vendas sem Match ({vendasSemMatch.length})
            </TabsTrigger>
            <TabsTrigger value="linhas" className="gap-2">
              <FileText className="h-4 w-4" />
              Linhas sem Match ({filteredLinhas.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vendas" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Vendas Instaladas sem Correspondência</CardTitle>
                <CardDescription>
                  Vendas com status "instalado" que não foram encontradas nos registros da operadora
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Protocolo</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>CPF/CNPJ</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Data Venda</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            <FileX className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            Nenhuma divergência encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredVendas.map((venda) => (
                          <TableRow key={venda.id}>
                            <TableCell className="font-mono text-sm">
                              {venda.protocolo_interno || '-'}
                            </TableCell>
                            <TableCell className="font-medium">{venda.cliente_nome}</TableCell>
                            <TableCell className="font-mono text-sm">{venda.cpf_cnpj || '-'}</TableCell>
                            <TableCell>{venda.vendedor?.nome || '-'}</TableCell>
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
                              <Badge className={statusInternoColors[venda.status_interno] || 'bg-gray-100 text-gray-800'}>
                                {statusInternoLabels[venda.status_interno] || venda.status_interno}
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
                                      <DropdownMenuItem 
                                        onClick={() => handleMarkAs('venda', venda.id, 'contestacao_procedente')}
                                      >
                                        Contestação Procedente
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleMarkAs('venda', venda.id, 'contestacao_improcedente')}
                                      >
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
                      {filteredLinhas.length === 0 ? (
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
                            <TableCell className="font-mono text-sm">
                              {linha.protocolo_operadora || '-'}
                            </TableCell>
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
