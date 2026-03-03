import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Pencil, Trash2, Upload, Check, AlertCircle, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

const CAMPOS_VENDAS = [
  { key: 'identificador_make', label: 'Identificador Make', required: true },
  { key: 'status_make', label: 'Status Make', required: true },
  { key: 'data_venda', label: 'Data da Venda', required: true },
  { key: 'cliente_nome', label: 'Nome do Cliente', required: false },
  { key: 'cpf_cnpj', label: 'CPF/CNPJ', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
  { key: 'protocolo_interno', label: 'Protocolo', required: false },
  { key: 'valor', label: 'Valor', required: false },
  { key: 'data_instalacao', label: 'Data Instalação', required: false },
  { key: 'plano', label: 'Plano', required: false },
  { key: 'operadora', label: 'Operadora', required: false },
  { key: 'cep', label: 'CEP', required: false },
  { key: 'endereco', label: 'Endereço', required: false },
  { key: 'observacoes', label: 'Observações', required: false },
];

interface MapeamentoVenda {
  id: string;
  nome: string;
  mapeamento: Record<string, string>;
  config: Record<string, any>;
  ativo: boolean;
  created_at: string;
}

export function MapeamentoVendasManager() {
  const [mapeamentos, setMapeamentos] = useState<MapeamentoVenda[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMapeamento, setSelectedMapeamento] = useState<MapeamentoVenda | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formNome, setFormNome] = useState('');
  const [formMapeamento, setFormMapeamento] = useState<Record<string, string>>({});
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewData, setCsvPreviewData] = useState<Record<string, string>[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => { fetchMapeamentos(); }, []);

  const fetchMapeamentos = async () => {
    try {
      const { data, error } = await supabase
        .from('mapeamento_vendas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMapeamentos((data || []) as MapeamentoVenda[]);
    } catch {
      toast.error('Erro ao carregar modelos de vendas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilePreview = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewFile(file);
    const content = await file.text();
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) { setFormError('Arquivo deve ter pelo menos 2 linhas'); return; }
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, '')).filter(h => h);
    setCsvHeaders(headers);
    const previewRows = lines.slice(1, 4).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ''; });
      return row;
    });
    setCsvPreviewData(previewRows);
    setFormError(null);
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedMapeamento(null);
    setFormNome('');
    setFormMapeamento({});
    setCsvHeaders([]);
    setCsvPreviewData([]);
    setPreviewFile(null);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (m: MapeamentoVenda) => {
    setIsEditing(true);
    setSelectedMapeamento(m);
    setFormNome(m.nome);
    setFormMapeamento(m.mapeamento || {});
    setCsvHeaders(Object.values(m.mapeamento || {}).filter(Boolean));
    setCsvPreviewData([]);
    setPreviewFile(null);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formNome.trim()) { setFormError('Digite um nome'); return; }
    const requiredMissing = CAMPOS_VENDAS.filter(c => c.required && !formMapeamento[c.key]);
    if (requiredMissing.length > 0) {
      setFormError(`Campos obrigatórios: ${requiredMissing.map(c => c.label).join(', ')}`);
      return;
    }
    setIsSaving(true);
    try {
      const payload = { nome: formNome.trim(), mapeamento: formMapeamento as any, config: {} as any, ativo: false };
      if (isEditing && selectedMapeamento) {
        const { error } = await supabase.from('mapeamento_vendas').update(payload).eq('id', selectedMapeamento.id);
        if (error) throw error;
        toast.success('Modelo atualizado');
      } else {
        const { error } = await supabase.from('mapeamento_vendas').insert([payload]);
        if (error) throw error;
        toast.success('Modelo criado');
      }
      setIsDialogOpen(false);
      fetchMapeamentos();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (m: MapeamentoVenda) => {
    if (!confirm(`Excluir "${m.nome}"?`)) return;
    const { error } = await supabase.from('mapeamento_vendas').delete().eq('id', m.id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Modelo excluído');
    fetchMapeamentos();
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Modelos para Vendas Internas</h3>
          <p className="text-sm text-muted-foreground">Mapeamento de colunas para importação de vendas via CSV</p>
        </div>
        <Button onClick={handleOpenCreate}><Plus className="h-4 w-4 mr-2" />Novo Modelo</Button>
      </div>

      {mapeamentos.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum modelo configurado para vendas internas</p>
        </CardContent></Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Campos Mapeados</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapeamentos.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell>{Object.values(m.mapeamento || {}).filter(Boolean).length} campos</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar Modelo' : 'Novo Modelo de Vendas'}</DialogTitle>
            <DialogDescription>Mapeie as colunas do CSV para os campos de vendas internas</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {formError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{formError}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label>Nome do Modelo *</Label>
              <Input placeholder="Ex: Relatório CRM" value={formNome} onChange={e => setFormNome(e.target.value)} />
            </div>
            {!isEditing && (
              <div className="space-y-2">
                <Label>Arquivo CSV de Exemplo</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  <input type="file" accept=".csv" onChange={handleFilePreview} className="hidden" id="csv-vendas-preview" />
                  <label htmlFor="csv-vendas-preview" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{previewFile ? previewFile.name : 'Clique para selecionar'}</p>
                  </label>
                </div>
              </div>
            )}
            {csvHeaders.length > 0 && (
              <div className="space-y-2">
                <Label>Mapeamento de Campos</Label>
                <div className="grid gap-3">
                  {CAMPOS_VENDAS.map(campo => (
                    <div key={campo.key} className="flex items-center gap-3">
                      <div className="w-44 text-sm">{campo.label}{campo.required && <span className="text-destructive ml-1">*</span>}</div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      {csvPreviewData.length > 0 ? (
                        <Select value={formMapeamento[campo.key] || '__none__'} onValueChange={v => setFormMapeamento(prev => ({ ...prev, [campo.key]: v === '__none__' ? '' : v }))}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Não mapear</SelectItem>
                            {csvHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input placeholder="Nome da coluna" value={formMapeamento[campo.key] || ''} onChange={e => setFormMapeamento(prev => ({ ...prev, [campo.key]: e.target.value }))} className="flex-1" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isEditing && csvHeaders.length === 0 && (
              <div className="space-y-2">
                <Label>Mapeamento de Campos</Label>
                <div className="grid gap-3">
                  {CAMPOS_VENDAS.map(campo => (
                    <div key={campo.key} className="flex items-center gap-3">
                      <div className="w-44 text-sm">{campo.label}{campo.required && <span className="text-destructive ml-1">*</span>}</div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Nome da coluna" value={formMapeamento[campo.key] || ''} onChange={e => setFormMapeamento(prev => ({ ...prev, [campo.key]: e.target.value }))} className="flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar' : 'Criar Modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
