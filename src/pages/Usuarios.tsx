import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Vendedor, Empresa, AppRole } from '@/types/database';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Loader2, 
  Search, 
  Plus, 
  Edit,
  Users,
  UserPlus,
  KeyRound
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface VendedorWithRelations {
  id: string;
  user_id: string | null;
  nome: string;
  email: string;
  cpf: string | null;
  empresa_id: string | null;
  supervisor_id: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  empresa?: Empresa | null;
  supervisor?: { nome: string }[] | null;
  role?: AppRole;
}

// Normalize CPF (remove non-digits)
const normalizeCPF = (cpf: string): string => cpf.replace(/\D/g, '');

// Format CPF for display
const formatCPF = (cpf: string): string => {
  const digits = normalizeCPF(cpf);
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

// Validate CPF mathematically
const isValidCPF = (cpf: string): boolean => {
  const digits = normalizeCPF(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === parseInt(digits[10]);
};

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<VendedorWithRelations[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedVendedor, setSelectedVendedor] = useState<VendedorWithRelations | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    empresa_id: '',
    supervisor_id: '',
    ativo: true,
    role: 'vendedor' as AppRole,
    password: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch usuarios with empresa relation only (supervisor fetched separately)
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('usuarios')
        .select(`
          *,
          empresa:empresas(*)
        `)
        .order('nome');

      if (usuariosError) throw usuariosError;

      // Fetch user roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role');

      // Map roles and supervisor names to usuarios
      const usuariosWithRoles = (usuariosData as any[]).map(v => {
        const roleData = rolesData?.find(r => r.user_id === v.user_id);
        const supervisorData = v.supervisor_id 
          ? (usuariosData as any[]).find(s => s.id === v.supervisor_id)
          : null;
        return {
          ...v,
          role: roleData?.role as AppRole || undefined,
          supervisor: supervisorData ? [{ nome: supervisorData.nome }] : null,
        };
      });

      // Fetch empresas
      const { data: empresasData, error: empresasError } = await supabase
        .from('empresas')
        .select('*')
        .eq('ativa', true)
        .order('nome');

      if (empresasError) throw empresasError;

      setVendedores(usuariosWithRoles as VendedorWithRelations[]);
      setEmpresas(empresasData as Empresa[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (vendedor?: VendedorWithRelations) => {
    if (vendedor) {
      setSelectedVendedor(vendedor);
      setFormData({
        nome: vendedor.nome,
        email: vendedor.email,
        cpf: vendedor.cpf ? formatCPF(vendedor.cpf) : '',
        empresa_id: vendedor.empresa_id || '',
        supervisor_id: vendedor.supervisor_id || '',
        ativo: vendedor.ativo,
        role: vendedor.role || 'vendedor',
        password: '',
      });
    } else {
      setSelectedVendedor(null);
      setFormData({
        nome: '',
        email: '',
        cpf: '',
        empresa_id: '',
        supervisor_id: '',
        ativo: true,
        role: 'vendedor',
        password: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim() || !formData.email.trim()) {
      toast.error('Nome e email são obrigatórios');
      return;
    }

    if (!formData.cpf.trim()) {
      toast.error('CPF é obrigatório');
      return;
    }

    const normalizedCPF = normalizeCPF(formData.cpf);
    if (!isValidCPF(normalizedCPF)) {
      toast.error('CPF inválido');
      return;
    }

    if (!selectedVendedor && !formData.password) {
      toast.error('Senha é obrigatória para novos usuários');
      return;
    }

    setIsSaving(true);

    try {
      // Check CPF uniqueness before saving
      const { data: existingCPF } = await supabase
        .from('usuarios')
        .select('id')
        .eq('cpf', normalizedCPF)
        .maybeSingle();

      if (existingCPF && (!selectedVendedor || existingCPF.id !== selectedVendedor.id)) {
        toast.error('Já existe um usuário cadastrado com este CPF');
        setIsSaving(false);
        return;
      }

      if (selectedVendedor) {
        // Update usuario
        const { error: usuarioError } = await supabase
          .from('usuarios')
          .update({
            nome: formData.nome,
            email: formData.email,
            cpf: normalizedCPF,
            empresa_id: formData.empresa_id || null,
            supervisor_id: formData.supervisor_id || null,
            ativo: formData.ativo,
          })
          .eq('id', selectedVendedor.id);

        if (usuarioError) throw usuarioError;

        // Update role if user_id exists - delete old roles and insert new one
        if (selectedVendedor.user_id) {
          // First delete all existing roles for this user
          await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', selectedVendedor.user_id);

          // Then insert the new role
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({
              user_id: selectedVendedor.user_id,
              role: formData.role,
            });

          if (roleError) console.error('Error updating role:', roleError);
        }

        toast.success('Usuário atualizado com sucesso');
      } else {
        // Create new user in auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: window.location.origin,
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          // O trigger handle_new_user cria o registro básico em usuarios
          // Aqui fazemos UPDATE para adicionar os dados completos (CPF, empresa, etc)
          const { error: usuarioError } = await supabase
            .from('usuarios')
            .update({
              nome: formData.nome,
              cpf: normalizedCPF,
              empresa_id: formData.empresa_id || null,
              supervisor_id: formData.supervisor_id || null,
              ativo: formData.ativo,
            })
            .eq('user_id', authData.user.id);

          if (usuarioError) throw usuarioError;

          // Create user role
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({
              user_id: authData.user.id,
              role: formData.role,
            });

          if (roleError) console.error('Error creating role:', roleError);

          toast.success('Usuário criado com sucesso. Um email de confirmação foi enviado.');
        }
      }

      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving vendedor:', error);
      toast.error(error.message || 'Erro ao salvar vendedor');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedVendedor?.user_id || !newPassword) {
      toast.error('Digite a nova senha');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    
    setIsResettingPassword(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            userId: selectedVendedor.user_id,
            newPassword: newPassword,
          }),
        }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao redefinir senha');
      }
      
      toast.success('Senha redefinida com sucesso');
      setNewPassword('');
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error(error.message || 'Erro ao redefinir senha');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const getRoleBadge = (role?: AppRole) => {
    switch (role) {
      case 'admin':
        return <Badge>Admin</Badge>;
      case 'supervisor':
        return <Badge variant="secondary">Supervisor</Badge>;
      default:
        return <Badge variant="outline">Vendedor</Badge>;
    }
  };

  const filteredVendedores = vendedores.filter(vendedor =>
    vendedor.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vendedor.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const supervisores = vendedores.filter(v => v.role === 'supervisor' || v.role === 'admin');
  const vendedoresDisponiveis = vendedores.filter(v => v.role === 'vendedor' || !v.role);

  if (isLoading) {
    return (
      <AppLayout title="Usuários">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Usuários">
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={() => handleOpenDialog()}>
                <UserPlus className="h-4 w-4 mr-2" />
                Novo Usuário
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuários Cadastrados ({filteredVendedores.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Supervisor</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendedores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendedores.map((vendedor) => (
                      <TableRow key={vendedor.id}>
                        <TableCell className="font-medium">{vendedor.nome}</TableCell>
                        <TableCell>{vendedor.email}</TableCell>
                        <TableCell>{vendedor.empresa?.nome || '-'}</TableCell>
                        <TableCell>{vendedor.supervisor?.[0]?.nome || '-'}</TableCell>
                        <TableCell>{getRoleBadge(vendedor.role)}</TableCell>
                        <TableCell>
                          <Badge variant={vendedor.ativo ? 'default' : 'secondary'}>
                            {vendedor.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleOpenDialog(vendedor)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedVendedor ? 'Editar Usuário' : 'Novo Usuário'}
              </DialogTitle>
              <DialogDescription>
                {selectedVendedor 
                  ? 'Atualize os dados do usuário' 
                  : 'Preencha os dados para cadastrar um novo usuário'
                }
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  disabled={!!selectedVendedor}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>
              {!selectedVendedor && (
                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="empresa">Empresa</Label>
                <Select 
                  value={formData.empresa_id || "none"} 
                  onValueChange={(v) => setFormData({ ...formData, empresa_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {empresas.map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
              </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Perfil *</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(v) => setFormData({ 
                    ...formData, 
                    role: v as AppRole,
                    // Limpa supervisor_id se não for vendedor
                    supervisor_id: v === 'vendedor' ? formData.supervisor_id : ''
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Se for Vendedor, mostra seleção de supervisor */}
              {formData.role === 'vendedor' && (
                <div className="space-y-2">
                  <Label htmlFor="supervisor">Qual supervisor supervisiona este vendedor?</Label>
                  <Select 
                    value={formData.supervisor_id || "none"} 
                    onValueChange={(v) => setFormData({ ...formData, supervisor_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {supervisores
                        .filter(s => s.id !== selectedVendedor?.id)
                        .map((supervisor) => (
                          <SelectItem key={supervisor.id} value={supervisor.id}>
                            {supervisor.nome}
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Se for Supervisor, mostra quais vendedores ele supervisiona (apenas leitura) */}
              {formData.role === 'supervisor' && selectedVendedor && (
                <div className="space-y-2">
                  <Label>Vendedores sob supervisão</Label>
                  <div className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/50">
                    {vendedoresDisponiveis.filter(v => v.supervisor_id === selectedVendedor.id).length > 0 ? (
                      <ul className="space-y-1">
                        {vendedoresDisponiveis
                          .filter(v => v.supervisor_id === selectedVendedor.id)
                          .map(v => (
                            <li key={v.id}>• {v.nome}</li>
                          ))
                        }
                      </ul>
                    ) : (
                      <span>Nenhum vendedor vinculado a este supervisor</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Para vincular vendedores, edite cada vendedor e selecione este supervisor.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="ativo">Usuário Ativo</Label>
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                />
              </div>
              
              {selectedVendedor && selectedVendedor.user_id && (
                <div className="pt-2 border-t space-y-3">
                  <Label htmlFor="newPassword">Redefinir Senha</Label>
                  <div className="flex gap-2">
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="Nova senha (mín. 6 caracteres)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetPassword}
                      disabled={isResettingPassword || !newPassword}
                    >
                      {isResettingPassword ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedVendedor ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
