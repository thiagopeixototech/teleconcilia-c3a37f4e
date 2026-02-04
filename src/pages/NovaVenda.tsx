import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Operadora, Empresa } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

const vendaSchema = z.object({
  cliente_nome: z.string().trim().min(1, 'Nome do cliente é obrigatório').max(200, 'Nome muito longo'),
  cpf_cnpj: z.string().trim().max(18, 'CPF/CNPJ inválido').optional().or(z.literal('')),
  telefone: z.string().trim().max(20, 'Telefone inválido').optional().or(z.literal('')),
  cep: z.string().trim().max(10, 'CEP inválido').optional().or(z.literal('')),
  endereco: z.string().trim().max(300, 'Endereço muito longo').optional().or(z.literal('')),
  plano: z.string().trim().max(100, 'Plano muito longo').optional().or(z.literal('')),
  valor: z.string().optional().or(z.literal('')),
  protocolo_interno: z.string().trim().max(50, 'Protocolo muito longo').optional().or(z.literal('')),
  operadora_id: z.string().uuid('Operadora inválida').optional().or(z.literal('')),
  observacoes: z.string().trim().max(1000, 'Observações muito longas').optional().or(z.literal('')),
});

type VendaFormData = z.infer<typeof vendaSchema>;

export default function NovaVenda() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vendedorId, setVendedorId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<VendaFormData>({
    cliente_nome: '',
    cpf_cnpj: '',
    telefone: '',
    cep: '',
    endereco: '',
    plano: '',
    valor: '',
    protocolo_interno: '',
    operadora_id: '',
    observacoes: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch operadoras
        const { data: opData, error: opError } = await supabase
          .from('operadoras')
          .select('*')
          .eq('ativa', true)
          .order('nome');

        if (opError) throw opError;
        setOperadoras(opData as Operadora[]);

        // Fetch empresas
        const { data: empData, error: empError } = await supabase
          .from('empresas')
          .select('*')
          .eq('ativa', true)
          .order('nome');

        if (empError) throw empError;
        setEmpresas(empData as Empresa[]);

        // Fetch usuario_id for current user
        if (user) {
          const { data: usuarioData, error: usuarioError } = await supabase
            .from('usuarios')
            .select('id, empresa_id')
            .eq('user_id', user.id)
            .single();

          if (usuarioError && usuarioError.code !== 'PGRST116') {
            console.error('Error fetching usuario:', usuarioError);
          }

          if (usuarioData) {
            setVendedorId(usuarioData.id);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Erro ao carregar dados');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleInputChange = (field: keyof VendaFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const formatCpfCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 11) {
      // CPF format: 000.000.000-00
      return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    } else {
      // CNPJ format: 00.000.000/0000-00
      return digits
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    }
  };

  const formatTelefone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    } else {
      return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .replace(/(-\d{4})\d+?$/, '$1');
    }
  };

  const formatCep = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{3})\d+?$/, '$1');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate form
    const result = vendaSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }

    if (!vendedorId) {
      toast.error('Você não está vinculado como usuário. Contate o administrador.');
      return;
    }

    if (!formData.operadora_id) {
      setErrors({ operadora_id: 'Selecione uma operadora' });
      toast.error('Selecione uma operadora');
      return;
    }

    setIsSaving(true);

    try {
      const valorNumerico = formData.valor ? parseFloat(formData.valor.replace(',', '.')) : null;

      const { error } = await supabase
        .from('vendas_internas')
        .insert({
          usuario_id: vendedorId,
          cliente_nome: formData.cliente_nome.trim(),
          cpf_cnpj: formData.cpf_cnpj?.replace(/\D/g, '') || null,
          telefone: formData.telefone?.replace(/\D/g, '') || null,
          cep: formData.cep?.replace(/\D/g, '') || null,
          endereco: formData.endereco || null,
          plano: formData.plano || null,
          valor: valorNumerico,
          protocolo_interno: formData.protocolo_interno || null,
          operadora_id: formData.operadora_id,
          observacoes: formData.observacoes || null,
          status_interno: 'nova',
        });

      if (error) throw error;

      toast.success('Venda cadastrada com sucesso!');
      navigate('/vendas');
    } catch (error) {
      console.error('Error creating venda:', error);
      toast.error('Erro ao cadastrar venda');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout title="Nova Venda">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Nova Venda">
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/vendas')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Vendas
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Cadastrar Nova Venda</CardTitle>
            <CardDescription>
              Preencha os dados da venda. Campos com * são obrigatórios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Cliente Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Dados do Cliente</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cliente_nome">Nome do Cliente *</Label>
                    <Input
                      id="cliente_nome"
                      value={formData.cliente_nome}
                      onChange={(e) => handleInputChange('cliente_nome', e.target.value)}
                      placeholder="Nome completo"
                      className={errors.cliente_nome ? 'border-destructive' : ''}
                    />
                    {errors.cliente_nome && (
                      <p className="text-sm text-destructive">{errors.cliente_nome}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
                    <Input
                      id="cpf_cnpj"
                      value={formData.cpf_cnpj}
                      onChange={(e) => handleInputChange('cpf_cnpj', formatCpfCnpj(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={18}
                      className={errors.cpf_cnpj ? 'border-destructive' : ''}
                    />
                    {errors.cpf_cnpj && (
                      <p className="text-sm text-destructive">{errors.cpf_cnpj}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone</Label>
                    <Input
                      id="telefone"
                      value={formData.telefone}
                      onChange={(e) => handleInputChange('telefone', formatTelefone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                      className={errors.telefone ? 'border-destructive' : ''}
                    />
                    {errors.telefone && (
                      <p className="text-sm text-destructive">{errors.telefone}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cep">CEP</Label>
                    <Input
                      id="cep"
                      value={formData.cep}
                      onChange={(e) => handleInputChange('cep', formatCep(e.target.value))}
                      placeholder="00000-000"
                      maxLength={9}
                      className={errors.cep ? 'border-destructive' : ''}
                    />
                    {errors.cep && (
                      <p className="text-sm text-destructive">{errors.cep}</p>
                    )}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="endereco">Endereço</Label>
                    <Input
                      id="endereco"
                      value={formData.endereco}
                      onChange={(e) => handleInputChange('endereco', e.target.value)}
                      placeholder="Rua, número, bairro, cidade"
                      className={errors.endereco ? 'border-destructive' : ''}
                    />
                    {errors.endereco && (
                      <p className="text-sm text-destructive">{errors.endereco}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Venda Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Dados da Venda</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="operadora_id">Operadora *</Label>
                    <Select
                      value={formData.operadora_id}
                      onValueChange={(value) => handleInputChange('operadora_id', value)}
                    >
                      <SelectTrigger className={errors.operadora_id ? 'border-destructive' : ''}>
                        <SelectValue placeholder="Selecione a operadora" />
                      </SelectTrigger>
                      <SelectContent>
                        {operadoras.map((op) => (
                          <SelectItem key={op.id} value={op.id}>
                            {op.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.operadora_id && (
                      <p className="text-sm text-destructive">{errors.operadora_id}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="plano">Plano</Label>
                    <Input
                      id="plano"
                      value={formData.plano}
                      onChange={(e) => handleInputChange('plano', e.target.value)}
                      placeholder="Nome do plano contratado"
                      className={errors.plano ? 'border-destructive' : ''}
                    />
                    {errors.plano && (
                      <p className="text-sm text-destructive">{errors.plano}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="valor">Valor (R$)</Label>
                    <Input
                      id="valor"
                      value={formData.valor}
                      onChange={(e) => handleInputChange('valor', e.target.value)}
                      placeholder="0,00"
                      className={errors.valor ? 'border-destructive' : ''}
                    />
                    {errors.valor && (
                      <p className="text-sm text-destructive">{errors.valor}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="protocolo_interno">Protocolo Interno</Label>
                    <Input
                      id="protocolo_interno"
                      value={formData.protocolo_interno}
                      onChange={(e) => handleInputChange('protocolo_interno', e.target.value)}
                      placeholder="Código/protocolo da venda"
                      className={errors.protocolo_interno ? 'border-destructive' : ''}
                    />
                    {errors.protocolo_interno && (
                      <p className="text-sm text-destructive">{errors.protocolo_interno}</p>
                    )}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="observacoes">Observações</Label>
                    <Textarea
                      id="observacoes"
                      value={formData.observacoes}
                      onChange={(e) => handleInputChange('observacoes', e.target.value)}
                      placeholder="Informações adicionais sobre a venda..."
                      rows={3}
                      className={errors.observacoes ? 'border-destructive' : ''}
                    />
                    {errors.observacoes && (
                      <p className="text-sm text-destructive">{errors.observacoes}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/vendas')}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Venda
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
