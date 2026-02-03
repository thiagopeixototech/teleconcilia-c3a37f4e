import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Operadora } from '@/types/database';
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
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Loader2, 
  Plus, 
  Edit,
  Trash2,
  Radio
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export default function OperadorasPage() {
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedOperadora, setSelectedOperadora] = useState<Operadora | null>(null);
  const [nome, setNome] = useState('');
  const [ativa, setAtiva] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchOperadoras();
  }, []);

  const fetchOperadoras = async () => {
    try {
      const { data, error } = await supabase
        .from('operadoras')
        .select('*')
        .order('nome');

      if (error) throw error;
      setOperadoras(data as Operadora[]);
    } catch (error) {
      console.error('Error fetching operadoras:', error);
      toast.error('Erro ao carregar operadoras');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedOperadora(null);
    setNome('');
    setAtiva(true);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (operadora: Operadora) => {
    setIsEditing(true);
    setSelectedOperadora(operadora);
    setNome(operadora.nome);
    setAtiva(operadora.ativa);
    setIsDialogOpen(true);
  };

  const handleOpenDelete = (operadora: Operadora) => {
    setSelectedOperadora(operadora);
    setIsDeleteOpen(true);
  };

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error('Informe o nome da operadora');
      return;
    }

    setIsSaving(true);

    try {
      if (isEditing && selectedOperadora) {
        const { error } = await supabase
          .from('operadoras')
          .update({ nome: nome.trim(), ativa })
          .eq('id', selectedOperadora.id);

        if (error) throw error;
        toast.success('Operadora atualizada com sucesso');
      } else {
        const { error } = await supabase
          .from('operadoras')
          .insert({ nome: nome.trim(), ativa });

        if (error) throw error;
        toast.success('Operadora criada com sucesso');
      }

      setIsDialogOpen(false);
      fetchOperadoras();
    } catch (error: any) {
      console.error('Error saving operadora:', error);
      toast.error(error.message || 'Erro ao salvar operadora');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOperadora) return;

    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from('operadoras')
        .delete()
        .eq('id', selectedOperadora.id);

      if (error) throw error;
      toast.success('Operadora excluída com sucesso');
      setIsDeleteOpen(false);
      fetchOperadoras();
    } catch (error: any) {
      console.error('Error deleting operadora:', error);
      toast.error(error.message || 'Erro ao excluir operadora');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleAtiva = async (operadora: Operadora) => {
    try {
      const { error } = await supabase
        .from('operadoras')
        .update({ ativa: !operadora.ativa })
        .eq('id', operadora.id);

      if (error) throw error;
      toast.success(`Operadora ${operadora.ativa ? 'desativada' : 'ativada'}`);
      fetchOperadoras();
    } catch (error: any) {
      console.error('Error toggling operadora:', error);
      toast.error('Erro ao alterar status');
    }
  };

  if (isLoading) {
    return (
      <AppLayout title="Operadoras">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Operadoras">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" />
                Operadoras Cadastradas ({operadoras.length})
              </CardTitle>
              <CardDescription>
                Gerencie as operadoras de telecomunicações
              </CardDescription>
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Operadora
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operadoras.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhuma operadora cadastrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    operadoras.map((operadora) => (
                      <TableRow key={operadora.id}>
                        <TableCell className="font-medium">{operadora.nome}</TableCell>
                        <TableCell>
                          <Badge variant={operadora.ativa ? 'default' : 'secondary'}>
                            {operadora.ativa ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(operadora.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Switch
                              checked={operadora.ativa}
                              onCheckedChange={() => handleToggleAtiva(operadora)}
                            />
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleOpenEdit(operadora)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleOpenDelete(operadora)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Editar Operadora' : 'Nova Operadora'}</DialogTitle>
              <DialogDescription>
                {isEditing ? 'Atualize os dados da operadora' : 'Adicione uma nova operadora ao sistema'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da Operadora</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Vivo, Claro, TIM..."
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="ativa">Ativa</Label>
                <Switch
                  id="ativa"
                  checked={ativa}
                  onCheckedChange={setAtiva}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir Operadora</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir a operadora "{selectedOperadora?.nome}"?
                Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
