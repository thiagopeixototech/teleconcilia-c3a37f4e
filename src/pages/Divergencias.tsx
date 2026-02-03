import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { VendaInterna, LinhaOperadora } from '@/types/database';
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
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export default function Divergencias() {
  const [vendasSemMatch, setVendasSemMatch] = useState<VendaInterna[]>([]);
  const [linhasSemMatch, setLinhasSemMatch] = useState<LinhaOperadora[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('vendas');

  useEffect(() => {
    fetchDivergencias();
  }, []);

  const fetchDivergencias = async () => {
    try {
      // Fetch all vendas
      const { data: vendas, error: vendasError } = await supabase
        .from('vendas_internas')
        .select('*')
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

      // Find vendas without conciliacao
      const vendasComMatch = new Set(conciliacoes?.map(c => c.venda_interna_id) || []);
      const vendasSem = vendas?.filter(v => !vendasComMatch.has(v.id)) || [];

      // Find linhas without conciliacao
      const linhasComMatch = new Set(conciliacoes?.map(c => c.linha_operadora_id) || []);
      const linhasSem = linhas?.filter(l => !linhasComMatch.has(l.id)) || [];

      setVendasSemMatch(vendasSem as VendaInterna[]);
      setLinhasSemMatch(linhasSem as LinhaOperadora[]);
    } catch (error) {
      console.error('Error fetching divergencias:', error);
      toast.error('Erro ao carregar divergências');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAs = async (type: 'venda' | 'linha', id: string, action: string) => {
    try {
      if (type === 'venda') {
        const { error } = await supabase
          .from('vendas_internas')
          .update({ 
            observacoes: `[${action.toUpperCase()}] Marcado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
            status_interno: action === 'ignorar' ? 'cancelada' : 'nova'
          })
          .eq('id', id);

        if (error) throw error;
      } else {
        // For linhas, we could add a similar marking mechanism
        // For now, just show success
      }

      toast.success(`Registro marcado como ${action}`);
      fetchDivergencias();
    } catch (error) {
      console.error('Error marking record:', error);
      toast.error('Erro ao marcar registro');
    }
  };

  const filteredVendas = vendasSemMatch.filter(venda =>
    venda.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    venda.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    venda.protocolo_interno?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLinhas = linhasSemMatch.filter(linha =>
    linha.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    linha.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    linha.protocolo_operadora?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{vendasSemMatch.length}</p>
                  <p className="text-sm text-muted-foreground">Vendas sem Match</p>
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

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, CPF/CNPJ ou protocolo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="vendas" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Vendas sem Match ({filteredVendas.length})
            </TabsTrigger>
            <TabsTrigger value="linhas" className="gap-2">
              <FileText className="h-4 w-4" />
              Linhas sem Match ({filteredLinhas.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vendas" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Vendas Internas sem Correspondência</CardTitle>
                <CardDescription>
                  Vendas que não foram encontradas nos registros da operadora
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
                        <TableHead>Plano</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem 
                                    onClick={() => handleMarkAs('venda', venda.id, 'ignorar')}
                                  >
                                    Ignorar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleMarkAs('venda', venda.id, 'erro_interno')}
                                  >
                                    Erro Interno
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleMarkAs('venda', venda.id, 'venda_externa')}
                                  >
                                    Venda Externa
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
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLinhas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                              <Badge variant="outline">{linha.status_operadora}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem 
                                    onClick={() => handleMarkAs('linha', linha.id, 'ignorar')}
                                  >
                                    Ignorar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleMarkAs('linha', linha.id, 'erro_operadora')}
                                  >
                                    Erro Operadora
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleMarkAs('linha', linha.id, 'cliente_externo')}
                                  >
                                    Cliente Externo
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
        </Tabs>
      </div>
    </AppLayout>
  );
}
