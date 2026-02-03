import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, UserPlus, Trash2, AlertCircle } from 'lucide-react';
import { AppRole } from '@/types/database';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface UserWithRole {
  id: string;
  email: string;
  created_at: string;
  role: AppRole | null;
  role_id: string | null;
  vendedor_nome: string | null;
}

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
};

const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'bg-destructive text-destructive-foreground',
  supervisor: 'bg-warning text-warning-foreground',
  vendedor: 'bg-primary text-primary-foreground',
};

export default function GestaoRoles() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole | ''>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      // Fetch all users with their roles
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) {
        // Fallback: fetch from user_roles table
        const { data: roles, error: rolesError } = await supabase
          .from('user_roles')
          .select('*');

        if (rolesError) throw rolesError;

        // Get vendedores info
        const { data: vendedores } = await supabase
          .from('vendedores')
          .select('user_id, nome');

        const vendedorMap = new Map(vendedores?.map(v => [v.user_id, v.nome]) || []);

        // Map roles to users
        const usersData = roles?.map(role => ({
          id: role.user_id,
          email: 'Usuário #' + role.user_id.substring(0, 8),
          created_at: role.created_at,
          role: role.role as AppRole,
          role_id: role.id,
          vendedor_nome: vendedorMap.get(role.user_id) || null,
        })) || [];

        setUsers(usersData);
        return;
      }

      // If admin API works, use it
      const { data: roles } = await supabase
        .from('user_roles')
        .select('*');

      const { data: vendedores } = await supabase
        .from('vendedores')
        .select('user_id, nome');

      const roleMap = new Map(roles?.map(r => [r.user_id, { role: r.role as AppRole, id: r.id }]) || []);
      const vendedorMap = new Map(vendedores?.map(v => [v.user_id, v.nome]) || []);

      const usersData: UserWithRole[] = authUsers.users.map(user => ({
        id: user.id,
        email: user.email || 'Sem email',
        created_at: user.created_at,
        role: roleMap.get(user.id)?.role || null,
        role_id: roleMap.get(user.id)?.id || null,
        vendedor_nome: vendedorMap.get(user.id) || null,
      }));

      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os usuários.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setSelectedRole(user.role || '');
    setIsDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!selectedUser || !selectedRole) return;

    setIsSaving(true);
    try {
      if (selectedUser.role_id) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role: selectedRole })
          .eq('id', selectedUser.role_id);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: selectedUser.id, role: selectedRole });

        if (error) throw error;
      }

      toast({
        title: 'Sucesso',
        description: `Permissão de ${ROLE_LABELS[selectedRole]} atribuída com sucesso.`,
      });

      setIsDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Error saving role:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a permissão.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveRole = async (user: UserWithRole) => {
    if (!user.role_id) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', user.role_id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Permissão removida com sucesso.',
      });

      fetchUsers();
    } catch (error) {
      console.error('Error removing role:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover a permissão.',
        variant: 'destructive',
      });
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout title="Gestão de Permissões">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para acessar esta página.
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout title="Gestão de Permissões">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Gestão de Permissões">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Permissões de Usuários</CardTitle>
                <CardDescription>
                  Gerencie as permissões de acesso dos usuários do sistema
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email / Nome</TableHead>
                  <TableHead>Perfil de Vendedor</TableHead>
                  <TableHead>Permissão</TableHead>
                  <TableHead>Data de Criação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.email}</p>
                          <p className="text-sm text-muted-foreground">{user.id.substring(0, 8)}...</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.vendedor_nome ? (
                          <span className="text-foreground">{user.vendedor_nome}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">Não vinculado</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.role ? (
                          <Badge className={ROLE_COLORS[user.role]}>
                            {ROLE_LABELS[user.role]}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Sem permissão
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDialog(user)}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            {user.role ? 'Alterar' : 'Atribuir'}
                          </Button>
                          {user.role && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveRole(user)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Permissão</DialogTitle>
            <DialogDescription>
              Selecione a permissão para o usuário {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma permissão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendedor">
                  <div className="flex items-center gap-2">
                    <Badge className={ROLE_COLORS.vendedor}>Vendedor</Badge>
                    <span className="text-sm text-muted-foreground">- Acesso às próprias vendas</span>
                  </div>
                </SelectItem>
                <SelectItem value="supervisor">
                  <div className="flex items-center gap-2">
                    <Badge className={ROLE_COLORS.supervisor}>Supervisor</Badge>
                    <span className="text-sm text-muted-foreground">- Acesso ao time</span>
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Badge className={ROLE_COLORS.admin}>Administrador</Badge>
                    <span className="text-sm text-muted-foreground">- Acesso total</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRole} disabled={!selectedRole || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}