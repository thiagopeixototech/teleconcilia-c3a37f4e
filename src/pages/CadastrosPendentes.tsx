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
import { Loader2, UserCheck, Clock, Building2, Shield } from 'lucide-react';
import { AppRole, Empresa } from '@/types/database';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface PendingUser {
  id: string;
  user_id: string | null;
  nome: string;
  email: string;
  cpf: string | null;
  created_at: string;
  empresa_id: string | null;
  hasRole: boolean;
}

// Format CPF for display
const formatCPF = (cpf: string | null): string => {
  if (!cpf) return '-';
  const cleanCPF = cpf.replace(/[^\d]/g, '');
  if (cleanCPF.length !== 11) return cpf;
  return `${cleanCPF.slice(0, 3)}.${cleanCPF.slice(3, 6)}.${cleanCPF.slice(6, 9)}-${cleanCPF.slice(9)}`;
};

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
};

export default function CadastrosPendentes() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>('vendedor');
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('none');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    try {
      // Fetch vendedores that don't have roles yet
      const { data: vendedores, error: vendedoresError } = await supabase
        .from('vendedores')
        .select('id, user_id, nome, email, cpf, created_at, empresa_id')
        .order('created_at', { ascending: false });

      if (vendedoresError) throw vendedoresError;

      // Fetch existing roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id');

      if (rolesError) throw rolesError;

      const roleUserIds = new Set(roles?.map(r => r.user_id) || []);

      // Filter to only show pending users (no role assigned yet or no empresa)
      const pending = (vendedores || [])
        .filter(v => {
          const hasRole = v.user_id ? roleUserIds.has(v.user_id) : false;
          const hasEmpresa = !!v.empresa_id;
          // Show if doesn't have role OR doesn't have empresa
          return !hasRole || !hasEmpresa;
        })
        .map(v => ({
          ...v,
          hasRole: v.user_id ? roleUserIds.has(v.user_id) : false,
        }));

      setPendingUsers(pending);

      // Fetch empresas
      const { data: empresasData, error: empresasError } = await supabase
        .from('empresas')
        .select('*')
        .eq('ativa', true)
        .order('nome');

      if (empresasError) throw empresasError;

      setEmpresas(empresasData as Empresa[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (user: PendingUser) => {
    setSelectedUser(user);
    setSelectedRole('vendedor');
    setSelectedEmpresa(user.empresa_id || 'none');
    setIsDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedUser) return;

    setIsSaving(true);
    try {
      // Update empresa_id
      const { error: vendedorError } = await supabase
        .from('vendedores')
        .update({ 
          empresa_id: selectedEmpresa === 'none' ? null : selectedEmpresa 
        })
        .eq('id', selectedUser.id);

      if (vendedorError) throw vendedorError;

      // If user has user_id, assign role
      if (selectedUser.user_id) {
        // Check if role already exists
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', selectedUser.user_id)
          .maybeSingle();

        if (existingRole) {
          // Update existing role
          const { error: roleError } = await supabase
            .from('user_roles')
            .update({ role: selectedRole })
            .eq('id', existingRole.id);

          if (roleError) throw roleError;
        } else {
          // Insert new role
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({ user_id: selectedUser.user_id, role: selectedRole });

          if (roleError) throw roleError;
        }
      }

      toast({
        title: 'Sucesso',
        description: `${selectedUser.nome} foi autorizado como ${ROLE_LABELS[selectedRole]}.`,
      });

      setIsDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error approving user:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível autorizar o usuário.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout title="Cadastros Pendentes">
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
      <AppLayout title="Cadastros Pendentes">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Cadastros Pendentes">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-warning" />
              <div>
                <CardTitle>Cadastros Aguardando Aprovação</CardTitle>
                <CardDescription>
                  Usuários que precisam ser vinculados a uma empresa e ter permissões atribuídas
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {pendingUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum cadastro pendente no momento.</p>
                <p className="text-sm mt-1">Todos os usuários já foram autorizados.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status da Conta</TableHead>
                    <TableHead>Pendência</TableHead>
                    <TableHead>Data do Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.nome}</TableCell>
                      <TableCell className="font-mono text-sm">{formatCPF(user.cpf)}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.user_id ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Login ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Aguardando login
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {!user.hasRole && (
                            <Badge variant="secondary" className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              Sem permissão
                            </Badge>
                          )}
                          {!user.empresa_id && (
                            <Badge variant="secondary" className="text-xs">
                              <Building2 className="h-3 w-3 mr-1" />
                              Sem empresa
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleOpenDialog(user)}
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          Autorizar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorizar Usuário</DialogTitle>
            <DialogDescription>
              Configure o acesso para {selectedUser?.nome}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma empresa</SelectItem>
                  {empresas.map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Acesso</Label>
              <Select 
                value={selectedRole} 
                onValueChange={(value) => setSelectedRole(value as AppRole)}
                disabled={!selectedUser?.user_id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">
                    <span>Vendedor</span>
                    <span className="text-xs text-muted-foreground ml-2">- Acesso às próprias vendas</span>
                  </SelectItem>
                  <SelectItem value="supervisor">
                    <span>Supervisor</span>
                    <span className="text-xs text-muted-foreground ml-2">- Acesso ao time</span>
                  </SelectItem>
                  <SelectItem value="admin">
                    <span>Administrador</span>
                    <span className="text-xs text-muted-foreground ml-2">- Acesso total</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {!selectedUser?.user_id && (
                <p className="text-xs text-muted-foreground">
                  A permissão será atribuída quando o usuário fizer o primeiro login.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleApprove} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Autorizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
