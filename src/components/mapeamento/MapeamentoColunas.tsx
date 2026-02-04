import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MapeamentoColunas, Operadora, CampoSistema, CAMPOS_SISTEMA_LABELS, CAMPOS_OBRIGATORIOS } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  Plus, 
  Pencil, 
  Trash2, 
  Upload, 
  Check, 
  AlertCircle,
  ArrowRight,
  FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';

interface MapeamentoColunasProps {
  operadoras: Operadora[];
  onMapeamentoChange?: () => void;
}

const CAMPOS_SISTEMA: CampoSistema[] = [
  'cliente_nome',
  'cpf_cnpj',
  'protocolo_operadora',
  'telefone',
  'plano',
  'valor',
  'data_status',
  'status_operadora',
  'quinzena_ref',
];

export function MapeamentoColunasManager({ operadoras, onMapeamentoChange }: MapeamentoColunasProps) {
  const [mapeamentos, setMapeamentos] = useState<MapeamentoColunas[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMapeamento, setSelectedMapeamento] = useState<MapeamentoColunas | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [formOperadoraId, setFormOperadoraId] = useState('');
  const [formNome, setFormNome] = useState('');
  const [formMapeamento, setFormMapeamento] = useState<Record<string, string>>({});
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewData, setCsvPreviewData] = useState<Record<string, string>[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchMapeamentos();
  }, []);

  const fetchMapeamentos = async () => {
    try {
      const { data, error } = await supabase
        .from('mapeamento_colunas')
        .select('*, operadoras(nome)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform to include operadora name
      const transformed = (data || []).map(m => ({
        ...m,
        operadora: m.operadoras ? { id: m.operadora_id, nome: m.operadoras.nome } : null
      })) as unknown as MapeamentoColunas[];
      
      setMapeamentos(transformed);
    } catch (error) {
      console.error('Error fetching mapeamentos:', error);
      toast.error('Erro ao carregar mapeamentos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilePreview = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPreviewFile(file);
    
    try {
      const content = await file.text();
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setFormError('Arquivo deve ter pelo menos cabeçalho e uma linha de dados');
        return;
      }

      const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/"/g, ''));
      setCsvHeaders(headers);
      
      // Get first 3 rows for preview
      const previewRows = lines.slice(1, 4).map(line => {
        const values = line.split(/[,;]/).map(v => v.trim().replace(/"/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });
      
      setCsvPreviewData(previewRows);
      setFormError(null);
      
      // Auto-detect common column names
      const autoMapeamento: Record<string, string> = {};
      headers.forEach(header => {
        const headerLower = header.toLowerCase();
        if (headerLower.includes('cliente') || headerLower.includes('nome')) {
          if (!autoMapeamento.cliente_nome) autoMapeamento.cliente_nome = header;
        }
        if (headerLower.includes('cpf') || headerLower.includes('cnpj') || headerLower.includes('documento')) {
          if (!autoMapeamento.cpf_cnpj) autoMapeamento.cpf_cnpj = header;
        }
        if (headerLower.includes('protocolo') || headerLower.includes('prot')) {
          if (!autoMapeamento.protocolo_operadora) autoMapeamento.protocolo_operadora = header;
        }
        if (headerLower.includes('telefone') || headerLower.includes('fone') || headerLower.includes('celular')) {
          if (!autoMapeamento.telefone) autoMapeamento.telefone = header;
        }
        if (headerLower.includes('plano') || headerLower.includes('produto')) {
          if (!autoMapeamento.plano) autoMapeamento.plano = header;
        }
        if (headerLower === 'valor' || headerLower.includes('preco') || headerLower.includes('price')) {
          if (!autoMapeamento.valor) autoMapeamento.valor = header;
        }
        if (headerLower.includes('data') || headerLower.includes('date')) {
          if (!autoMapeamento.data_status) autoMapeamento.data_status = header;
        }
        if (headerLower.includes('status')) {
          if (!autoMapeamento.status_operadora) autoMapeamento.status_operadora = header;
        }
        if (headerLower.includes('quinzena')) {
          if (!autoMapeamento.quinzena_ref) autoMapeamento.quinzena_ref = header;
        }
      });
      
      setFormMapeamento(prev => ({ ...prev, ...autoMapeamento }));
      
    } catch (error) {
      console.error('Error reading file:', error);
      setFormError('Erro ao ler arquivo');
    }
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedMapeamento(null);
    setFormOperadoraId('');
    setFormNome('');
    setFormMapeamento({});
    setCsvHeaders([]);
    setCsvPreviewData([]);
    setPreviewFile(null);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (mapeamento: MapeamentoColunas) => {
    setIsEditing(true);
    setSelectedMapeamento(mapeamento);
    setFormOperadoraId(mapeamento.operadora_id);
    setFormNome(mapeamento.nome);
    setFormMapeamento(mapeamento.mapeamento as Record<string, string>);
    setCsvHeaders(Object.values(mapeamento.mapeamento as Record<string, string>).filter(Boolean));
    setCsvPreviewData([]);
    setPreviewFile(null);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const validateForm = (): boolean => {
    if (!formOperadoraId) {
      setFormError('Selecione a operadora');
      return false;
    }
    if (!formNome.trim()) {
      setFormError('Digite um nome para o mapeamento');
      return false;
    }
    
    // Check required fields
    const missingRequired = CAMPOS_OBRIGATORIOS.filter(
      campo => !formMapeamento[campo]
    );
    
    if (missingRequired.length > 0) {
      setFormError(`Campos obrigatórios não mapeados: ${missingRequired.map(c => CAMPOS_SISTEMA_LABELS[c]).join(', ')}`);
      return false;
    }
    
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    setIsSaving(true);
    setFormError(null);
    
    try {
      const mapeamentoData = {
        operadora_id: formOperadoraId,
        nome: formNome.trim(),
        mapeamento: formMapeamento,
        ativo: false,
      };

      if (isEditing && selectedMapeamento) {
        const { error } = await supabase
          .from('mapeamento_colunas')
          .update(mapeamentoData)
          .eq('id', selectedMapeamento.id);

        if (error) throw error;
        toast.success('Mapeamento atualizado com sucesso');
      } else {
        const { error } = await supabase
          .from('mapeamento_colunas')
          .insert([mapeamentoData]);

        if (error) throw error;
        toast.success('Mapeamento criado com sucesso');
      }

      setIsDialogOpen(false);
      fetchMapeamentos();
      onMapeamentoChange?.();
    } catch (error: any) {
      console.error('Error saving mapeamento:', error);
      setFormError(error.message || 'Erro ao salvar mapeamento');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetAtivo = async (mapeamento: MapeamentoColunas) => {
    try {
      // First, deactivate all mappings for this operator
      await supabase
        .from('mapeamento_colunas')
        .update({ ativo: false })
        .eq('operadora_id', mapeamento.operadora_id);

      // Then activate the selected one
      const { error } = await supabase
        .from('mapeamento_colunas')
        .update({ ativo: true })
        .eq('id', mapeamento.id);

      if (error) throw error;
      
      toast.success(`Mapeamento "${mapeamento.nome}" definido como padrão`);
      fetchMapeamentos();
      onMapeamentoChange?.();
    } catch (error) {
      console.error('Error setting active:', error);
      toast.error('Erro ao definir mapeamento ativo');
    }
  };

  const handleDelete = async (mapeamento: MapeamentoColunas) => {
    if (!confirm(`Deseja excluir o mapeamento "${mapeamento.nome}"?`)) return;

    try {
      const { error } = await supabase
        .from('mapeamento_colunas')
        .delete()
        .eq('id', mapeamento.id);

      if (error) throw error;
      
      toast.success('Mapeamento excluído');
      fetchMapeamentos();
      onMapeamentoChange?.();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Erro ao excluir mapeamento');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Mapeamentos de Colunas</h3>
          <p className="text-sm text-muted-foreground">
            Configure como as colunas dos arquivos CSV são mapeadas para o sistema
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Mapeamento
        </Button>
      </div>

      {mapeamentos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum mapeamento configurado</p>
            <p className="text-sm">Crie um mapeamento para importar arquivos CSV</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead>Campos Mapeados</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapeamentos.map((mapeamento) => {
                const camposMapeados = Object.keys(mapeamento.mapeamento || {}).filter(
                  k => (mapeamento.mapeamento as Record<string, string>)[k]
                ).length;
                
                return (
                  <TableRow key={mapeamento.id}>
                    <TableCell className="font-medium">{mapeamento.nome}</TableCell>
                    <TableCell>{mapeamento.operadora?.nome || '-'}</TableCell>
                    <TableCell>{camposMapeados} campos</TableCell>
                    <TableCell>
                      {mapeamento.ativo ? (
                        <Badge className="bg-success text-success-foreground">Padrão</Badge>
                      ) : (
                        <Badge variant="outline">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {!mapeamento.ativo && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleSetAtivo(mapeamento)}
                          title="Definir como padrão"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleOpenEdit(mapeamento)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDelete(mapeamento)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar Mapeamento' : 'Novo Mapeamento de Colunas'}
            </DialogTitle>
            <DialogDescription>
              {isEditing 
                ? 'Atualize o mapeamento de colunas'
                : 'Faça upload de um arquivo CSV de exemplo para mapear as colunas'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operadora *</Label>
                <Select value={formOperadoraId} onValueChange={setFormOperadoraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a operadora" />
                  </SelectTrigger>
                  <SelectContent>
                    {operadoras.map((op) => (
                      <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nome do Mapeamento *</Label>
                <Input
                  placeholder="Ex: Padrão Vivo, Formato Claro..."
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                />
              </div>
            </div>

            {!isEditing && (
              <div className="space-y-2">
                <Label>Arquivo CSV de Exemplo</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFilePreview}
                    className="hidden"
                    id="csv-preview"
                  />
                  <label htmlFor="csv-preview" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {previewFile ? previewFile.name : 'Clique para selecionar um arquivo CSV'}
                    </p>
                  </label>
                </div>
              </div>
            )}

            {csvHeaders.length > 0 && (
              <>
                {csvPreviewData.length > 0 && (
                  <div className="space-y-2">
                    <Label>Prévia do Arquivo</Label>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {csvHeaders.map((header) => (
                              <TableHead key={header} className="text-xs">{header}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {csvPreviewData.map((row, i) => (
                            <TableRow key={i}>
                              {csvHeaders.map((header) => (
                                <TableCell key={header} className="text-xs">{row[header] || '-'}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Mapeamento de Campos</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Associe cada campo do sistema a uma coluna do CSV. Campos com * são obrigatórios.
                  </p>
                  <div className="grid gap-3">
                    {CAMPOS_SISTEMA.map((campo) => {
                      const isRequired = CAMPOS_OBRIGATORIOS.includes(campo);
                      return (
                        <div key={campo} className="flex items-center gap-3">
                          <div className="w-48 text-sm">
                            {CAMPOS_SISTEMA_LABELS[campo]}
                            {isRequired && <span className="text-destructive ml-1">*</span>}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <Select 
                            value={formMapeamento[campo] || ''} 
                            onValueChange={(v) => setFormMapeamento(prev => ({ ...prev, [campo]: v }))}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Selecione a coluna do CSV" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Não mapear</SelectItem>
                              {csvHeaders.map((header) => (
                                <SelectItem key={header} value={header}>{header}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {isEditing && csvHeaders.length === 0 && (
              <div className="space-y-2">
                <Label>Mapeamento de Campos</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Você pode editar as colunas manualmente ou fazer upload de um novo arquivo CSV.
                </p>
                <div className="grid gap-3">
                  {CAMPOS_SISTEMA.map((campo) => {
                    const isRequired = CAMPOS_OBRIGATORIOS.includes(campo);
                    return (
                      <div key={campo} className="flex items-center gap-3">
                        <div className="w-48 text-sm">
                          {CAMPOS_SISTEMA_LABELS[campo]}
                          {isRequired && <span className="text-destructive ml-1">*</span>}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Nome da coluna no CSV"
                          value={formMapeamento[campo] || ''}
                          onChange={(e) => setFormMapeamento(prev => ({ ...prev, [campo]: e.target.value }))}
                          className="flex-1"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar Alterações' : 'Criar Mapeamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
