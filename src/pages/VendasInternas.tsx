import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { VendaInterna, StatusInterno, Operadora } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Loader2, 
  Search, 
  Plus, 
  Eye, 
  Edit, 
  Download,
  Filter,
  Radio
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

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

export default function VendasInternas() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [vendas, setVendas] = useState<VendaInterna[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operadoraFilter, setOperadoraFilter] = useState<string>('all');
  const [selectedVenda, setSelectedVenda] = useState<VendaInterna | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<StatusInterno>('nova');
  const [editObservacoes, setEditObservacoes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchVendas();
    fetchOperadoras();
  }, []);

  const fetchVendas = async () => {
    try {
      const { data, error } = await supabase
        .from('vendas_internas')
        .select(`
          *,
          usuario:usuarios(nome, email),
          empresa:empresas(nome)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVendas(data as any);
    } catch (error) {
      console.error('Error fetching vendas:', error);
      toast.error('Erro ao carregar vendas');
    } finally {
      setIsLoading(false);
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

  // Get operadora name by ID
  const getOperadoraNome = (operadoraId: string | null) => {
    if (!operadoraId) return '-';
    const operadora = operadoras.find(o => o.id === operadoraId);
    return operadora?.nome || '-';
  };

  const handleViewDetails = (venda: VendaInterna) => {
    setSelectedVenda(venda);
    setIsDetailOpen(true);
  };

  const handleEditStatus = (venda: VendaInterna) => {
    setSelectedVenda(venda);
    setEditStatus(venda.status_interno);
    setEditObservacoes(venda.observacoes || '');
    setIsEditOpen(true);
  };

  const handleSaveStatus = async () => {
    if (!selectedVenda) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('vendas_internas')
        .update({ 
          status_interno: editStatus,
          observacoes: editObservacoes 
        })
        .eq('id', selectedVenda.id);

      if (error) throw error;

      toast.success('Status atualizado com sucesso');
      setIsEditOpen(false);
      fetchVendas();
    } catch (error) {
      console.error('Error updating venda:', error);
      toast.error('Erro ao atualizar status');
    } finally {
      setIsSaving(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Protocolo', 'Cliente', 'CPF/CNPJ', 'Operadora', 'Plano', 'Valor', 'Status', 'Data'];
    const rows = filteredVendas.map(v => [
      v.protocolo_interno || '',
      v.cliente_nome,
      v.cpf_cnpj || '',
      getOperadoraNome(v.operadora_id),
      v.plano || '',
      v.valor?.toString() || '',
      statusLabels[v.status_interno],
      format(new Date(v.data_venda), 'dd/MM/yyyy'),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendas_internas_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredVendas = vendas.filter(venda => {
    const matchesSearch = 
      venda.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.protocolo_interno?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || venda.status_interno === statusFilter;
    const matchesOperadora = operadoraFilter === 'all' || venda.operadora_id === operadoraFilter;
    
    return matchesSearch && matchesStatus && matchesOperadora;
  });

  if (isLoading) {
    return (
      <AppLayout title="Vendas Internas">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Vendas Internas">
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, CPF/CNPJ ou protocolo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={operadoraFilter} onValueChange={setOperadoraFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <Radio className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Operadora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Operadoras</SelectItem>
                  {operadoras.map((op) => (
                    <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
              <Button onClick={() => navigate('/vendas/nova')}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Venda
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Vendas Registradas ({filteredVendas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>ID Make</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Operadora</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Confirmada</TableHead>
                    <TableHead>Status Make</TableHead>
                    <TableHead>Data Venda</TableHead>
                    <TableHead>Data Instalação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        Nenhuma venda encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendas.map((venda) => (
                      <TableRow key={venda.id}>
                        <TableCell className="font-mono text-sm">
                          {venda.protocolo_interno || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {venda.identificador_make || '-'}
                        </TableCell>
                        <TableCell className="font-medium">{venda.cliente_nome}</TableCell>
                        <TableCell className="font-mono text-sm">{venda.cpf_cnpj || '-'}</TableCell>
                        <TableCell>{getOperadoraNome(venda.operadora_id)}</TableCell>
                        <TableCell>
                          {venda.valor 
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[venda.status_interno]}>
                            {statusLabels[venda.status_interno]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {venda.status_make || '-'}
                        </TableCell>
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
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleViewDetails(venda)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleEditStatus(venda)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes da Venda</DialogTitle>
              <DialogDescription>
                Protocolo: {selectedVenda?.protocolo_interno || 'N/A'}
              </DialogDescription>
            </DialogHeader>
            {selectedVenda && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Cliente</Label>
                    <p className="font-medium">{selectedVenda.cliente_nome}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">CPF/CNPJ</Label>
                    <p className="font-medium font-mono">{selectedVenda.cpf_cnpj || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Telefone</Label>
                    <p className="font-medium">{selectedVenda.telefone || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Operadora</Label>
                    <p className="font-medium">{getOperadoraNome(selectedVenda.operadora_id)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Plano</Label>
                    <p className="font-medium">{selectedVenda.plano || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor</Label>
                    <p className="font-medium">
                      {selectedVenda.valor 
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedVenda.valor)
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge className={statusColors[selectedVenda.status_interno]}>
                      {statusLabels[selectedVenda.status_interno]}
                    </Badge>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Endereço</Label>
                    <p className="font-medium">
                      {selectedVenda.endereco || '-'} {selectedVenda.cep ? `- CEP: ${selectedVenda.cep}` : ''}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Observações</Label>
                    <p className="font-medium">{selectedVenda.observacoes || 'Nenhuma observação'}</p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Status Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Status</DialogTitle>
              <DialogDescription>
                Atualize o status da venda de {selectedVenda?.cliente_nome}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as StatusInterno)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={editObservacoes}
                  onChange={(e) => setEditObservacoes(e.target.value)}
                  placeholder="Adicione observações sobre esta venda..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveStatus} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
