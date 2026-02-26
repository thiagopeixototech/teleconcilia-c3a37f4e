import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { LinhaOperadora, StatusOperadora, Operadora, MapeamentoColunas, CampoSistema } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Loader2, Upload, Download, FileSpreadsheet,
  AlertCircle, Settings, Trash2, Edit2, ChevronDown, ChevronUp, Eye, RefreshCw
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';

const statusColors: Record<StatusOperadora, string> = {
  aprovado: 'bg-success text-success-foreground',
  instalado: 'bg-primary text-primary-foreground',
  cancelado: 'bg-destructive text-destructive-foreground',
  pendente: 'bg-warning text-warning-foreground',
};

const statusLabels: Record<StatusOperadora, string> = {
  aprovado: 'Aprovado',
  instalado: 'Instalado',
  cancelado: 'Cancelado',
  pendente: 'Pendente',
};

interface LinhaAgrupada {
  key: string;
  cliente_nome: string | null;
  cpf_cnpj: string | null;
  protocolo_operadora: string | null;
  telefone: string | null;
  planos: string[];
  valor_total: number;
  data_status: string | null;
  status_operadora: StatusOperadora;
  quinzena_ref: string | null;
  linhas_originais: Record<string, string>[];
}

interface ImportacaoInfo {
  label: string;
  apelido: string | null;
  arquivo_origem: string | null;
  operadora: string;
  count: number;
  createdAt: string;
  conciliacoes: number;
}

export default function LinhaOperadoraPage() {
  const { isAdmin } = useAuth();
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [mapeamentos, setMapeamentos] = useState<MapeamentoColunas[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Import history
  const [importacoes, setImportacoes] = useState<ImportacaoInfo[]>([]);
  const [expandedImport, setExpandedImport] = useState<string | null>(null);
  const [expandedLinhas, setExpandedLinhas] = useState<LinhaOperadora[]>([]);
  const [isLoadingLinhas, setIsLoadingLinhas] = useState(false);

  // Upload state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedOperadoraUpload, setSelectedOperadoraUpload] = useState<string>('');
  const [selectedMapeamentoId, setSelectedMapeamentoId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<LinhaAgrupada[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apelidoLote, setApelidoLote] = useState('');

  // Delete state
  const [deleteImportTarget, setDeleteImportTarget] = useState<string | null>(null);
  const [isDeletingImport, setIsDeletingImport] = useState(false);

  // Edit apelido state
  const [editApelidoTarget, setEditApelidoTarget] = useState<ImportacaoInfo | null>(null);
  const [newApelido, setNewApelido] = useState('');
  const [isSavingApelido, setIsSavingApelido] = useState(false);

  // Detail
  const [selectedLinha, setSelectedLinha] = useState<LinhaOperadora | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    fetchImportacoes();
    fetchOperadoras();
    fetchMapeamentos();
  }, []);

  const mapeamentosDisponiveis = mapeamentos.filter(
    m => m.operadora_id === selectedOperadoraUpload
  );

  useEffect(() => {
    if (selectedOperadoraUpload) {
      const activeMapeamento = mapeamentosDisponiveis.find(m => m.ativo);
      if (activeMapeamento) {
        setSelectedMapeamentoId(activeMapeamento.id);
      } else if (mapeamentosDisponiveis.length > 0) {
        setSelectedMapeamentoId(mapeamentosDisponiveis[0].id);
      } else {
        setSelectedMapeamentoId('');
      }
    }
  }, [selectedOperadoraUpload, mapeamentos]);

  const fetchImportacoes = async () => {
    setIsLoading(true);
    try {
      // Fetch all linhas grouped by apelido/arquivo_origem
      const allLinhas: any[] = [];
      const batchSize = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('linha_operadora')
          .select('id, apelido, arquivo_origem, operadora, created_at')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allLinhas.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      // Fetch all conciliacoes to count per linha
      const allConcIds = new Set<string>();
      from = 0;
      hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('conciliacoes')
          .select('linha_operadora_id')
          .eq('status_final', 'conciliado')
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          data.forEach(c => allConcIds.add(c.linha_operadora_id));
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      // Group by label
      const groups: Record<string, ImportacaoInfo> = {};
      for (const linha of allLinhas) {
        const label = linha.apelido || linha.arquivo_origem || 'Sem identificação';
        if (!groups[label]) {
          groups[label] = {
            label,
            apelido: linha.apelido,
            arquivo_origem: linha.arquivo_origem,
            operadora: linha.operadora,
            count: 0,
            createdAt: linha.created_at,
            conciliacoes: 0,
          };
        }
        groups[label].count += 1;
        if (allConcIds.has(linha.id)) {
          groups[label].conciliacoes += 1;
        }
        if (linha.created_at > groups[label].createdAt) {
          groups[label].createdAt = linha.created_at;
        }
      }

      const sorted = Object.values(groups).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setImportacoes(sorted);
    } catch (error) {
      console.error('Error fetching importacoes:', error);
      toast.error('Erro ao carregar importações');
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

  const fetchMapeamentos = async () => {
    try {
      const { data, error } = await supabase
        .from('mapeamento_colunas')
        .select('*')
        .order('nome');
      if (error) throw error;
      setMapeamentos(data as MapeamentoColunas[]);
    } catch (error) {
      console.error('Error fetching mapeamentos:', error);
    }
  };

  const handleExpandImport = async (label: string) => {
    if (expandedImport === label) {
      setExpandedImport(null);
      setExpandedLinhas([]);
      return;
    }
    setExpandedImport(label);
    setIsLoadingLinhas(true);
    try {
      const imp = importacoes.find(i => i.label === label);
      if (!imp) return;

      let query = supabase
        .from('linha_operadora')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (imp.apelido) {
        query = query.eq('apelido', imp.apelido);
      } else if (imp.arquivo_origem) {
        query = query.eq('arquivo_origem', imp.arquivo_origem);
      }

      const { data, error } = await query;
      if (error) throw error;
      setExpandedLinhas(data as LinhaOperadora[]);
    } catch (error) {
      console.error('Error fetching linhas:', error);
    } finally {
      setIsLoadingLinhas(false);
    }
  };

  // CSV parsing & grouping
  const parseCSV = (content: string): Record<string, string>[] => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    const separator = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const values = line.split(separator).map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });
  };

  const normalizeCpfCnpj = (value: string | null): string => {
    if (!value) return '';
    return value.replace(/[^\d]/g, '');
  };

  const agruparLinhas = (
    rows: Record<string, string>[], 
    mapeamento: Record<CampoSistema, string>
  ): LinhaAgrupada[] => {
    const grupos: Map<string, LinhaAgrupada> = new Map();

    for (const row of rows) {
      const cpf_cnpj = row[mapeamento.cpf_cnpj] || null;
      const protocolo = row[mapeamento.protocolo_operadora] || null;
      const key = normalizeCpfCnpj(cpf_cnpj) || protocolo || `row-${Math.random()}`;
      const valor = row[mapeamento.valor] 
        ? parseFloat(row[mapeamento.valor].replace(',', '.').replace(/[^\d.-]/g, '')) 
        : 0;
      const plano = row[mapeamento.plano] || null;

      if (grupos.has(key)) {
        const grupo = grupos.get(key)!;
        grupo.valor_total += valor;
        if (plano && !grupo.planos.includes(plano)) {
          grupo.planos.push(plano);
        }
        grupo.linhas_originais.push(row);
      } else {
        grupos.set(key, {
          key,
          cliente_nome: row[mapeamento.cliente_nome] || null,
          cpf_cnpj,
          protocolo_operadora: protocolo,
          telefone: row[mapeamento.telefone] || null,
          planos: plano ? [plano] : [],
          valor_total: valor,
          data_status: row[mapeamento.data_status] || null,
          status_operadora: (row[mapeamento.status_operadora] as StatusOperadora) || 'pendente',
          quinzena_ref: row[mapeamento.quinzena_ref] || null,
          linhas_originais: [row],
        });
      }
    }

    return Array.from(grupos.values());
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadError(null);
    setShowPreview(false);
    setPreviewData([]);
    if (selectedMapeamentoId) {
      await generatePreview(file);
    }
  };

  const generatePreview = async (file: File) => {
    const mapeamento = mapeamentos.find(m => m.id === selectedMapeamentoId);
    if (!mapeamento) return;
    try {
      const content = await file.text();
      const rows = parseCSV(content);
      if (rows.length === 0) {
        setUploadError('Arquivo vazio ou formato inválido');
        return;
      }
      const agrupadas = agruparLinhas(rows, mapeamento.mapeamento as Record<CampoSistema, string>);
      setPreviewData(agrupadas.slice(0, 10));
      setShowPreview(true);
    } catch (error) {
      console.error('Error generating preview:', error);
      setUploadError('Erro ao ler arquivo');
    }
  };

  useEffect(() => {
    if (selectedFile && selectedMapeamentoId) {
      generatePreview(selectedFile);
    }
  }, [selectedMapeamentoId]);

  const handleFileUpload = async () => {
    if (!selectedFile) { setUploadError('Selecione um arquivo'); return; }
    if (!selectedOperadoraUpload) { setUploadError('Selecione a operadora'); return; }
    if (!selectedMapeamentoId) { setUploadError('Selecione ou crie um mapeamento de colunas'); return; }
    if (!apelidoLote.trim()) { setUploadError('Defina um apelido para o lote (ex: Claro Novembro 1ª Quinzena)'); return; }

    const operadora = operadoras.find(o => o.id === selectedOperadoraUpload);
    const mapeamento = mapeamentos.find(m => m.id === selectedMapeamentoId);
    if (!operadora || !mapeamento) { setUploadError('Configuração inválida'); return; }

    setIsUploading(true);
    setUploadError(null);

    try {
      const content = await selectedFile.text();
      const rows = parseCSV(content);
      if (rows.length === 0) throw new Error('Arquivo vazio ou formato inválido');

      const map = mapeamento.mapeamento as Record<CampoSistema, string>;
      const agrupadas = agruparLinhas(rows, map);

      const linhasToInsert = agrupadas.map(grupo => {
        const isCombo = grupo.planos.length > 1;
        return {
          operadora: operadora.nome,
          protocolo_operadora: grupo.protocolo_operadora,
          cpf_cnpj: grupo.cpf_cnpj,
          cliente_nome: grupo.cliente_nome,
          telefone: grupo.telefone,
          plano: isCombo ? grupo.planos.join(' + ') : grupo.planos[0] || null,
          valor: grupo.linhas_originais.length === 1 
            ? (grupo.linhas_originais[0][map.valor] 
              ? parseFloat(grupo.linhas_originais[0][map.valor].replace(',', '.').replace(/[^\d.-]/g, '')) 
              : null)
            : null,
          valor_lq: grupo.valor_total,
          valor_make: null,
          tipo_plano: isCombo ? 'COMBO' : (grupo.planos[0] || null),
          data_status: grupo.data_status,
          status_operadora: grupo.status_operadora,
          quinzena_ref: grupo.quinzena_ref,
          arquivo_origem: selectedFile.name,
          apelido: apelidoLote.trim(),
        };
      });

      const { error } = await supabase
        .from('linha_operadora')
        .insert(linhasToInsert);
      if (error) throw error;

      const linhasOriginais = agrupadas.reduce((acc, g) => acc + g.linhas_originais.length, 0);
      const combos = agrupadas.filter(g => g.planos.length > 1).length;
      
      toast.success(
        `Importação concluída! ${linhasOriginais} linhas → ${agrupadas.length} registros (${combos} COMBOs)`
      );
      
      setIsUploadOpen(false);
      setSelectedFile(null);
      setSelectedOperadoraUpload('');
      setSelectedMapeamentoId('');
      setApelidoLote('');
      setPreviewData([]);
      setShowPreview(false);
      fetchImportacoes();
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setUploadError(error.message || 'Erro ao processar arquivo');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenUpload = () => {
    setSelectedFile(null);
    setSelectedOperadoraUpload('');
    setSelectedMapeamentoId('');
    setApelidoLote('');
    setUploadError(null);
    setPreviewData([]);
    setShowPreview(false);
    setIsUploadOpen(true);
  };

  const handleDeleteImport = async () => {
    if (!deleteImportTarget) return;
    setIsDeletingImport(true);
    try {
      const { data: linhasToDelete } = await supabase
        .from('linha_operadora')
        .select('id')
        .or(`apelido.eq.${deleteImportTarget},arquivo_origem.eq.${deleteImportTarget}`);

      if (linhasToDelete && linhasToDelete.length > 0) {
        const linhaIds = linhasToDelete.map(l => l.id);
        // Delete conciliacoes in batches
        for (let i = 0; i < linhaIds.length; i += 500) {
          const batch = linhaIds.slice(i, i + 500);
          await supabase.from('conciliacoes').delete().in('linha_operadora_id', batch);
        }
      }

      const { error } = await supabase
        .from('linha_operadora')
        .delete()
        .or(`apelido.eq.${deleteImportTarget},arquivo_origem.eq.${deleteImportTarget}`);
      if (error) throw error;

      toast.success(`Importação "${deleteImportTarget}" excluída com sucesso`);
      setDeleteImportTarget(null);
      if (expandedImport === deleteImportTarget) {
        setExpandedImport(null);
        setExpandedLinhas([]);
      }
      fetchImportacoes();
    } catch (error: any) {
      console.error('Error deleting import:', error);
      toast.error(error.message || 'Erro ao excluir importação');
    } finally {
      setIsDeletingImport(false);
    }
  };

  const handleEditApelido = (imp: ImportacaoInfo) => {
    setEditApelidoTarget(imp);
    setNewApelido(imp.apelido || imp.arquivo_origem || '');
  };

  const handleSaveApelido = async () => {
    if (!editApelidoTarget || !newApelido.trim()) return;
    setIsSavingApelido(true);
    try {
      // Find all records for this import
      let query = supabase.from('linha_operadora').update({ apelido: newApelido.trim() });
      
      if (editApelidoTarget.apelido) {
        query = query.eq('apelido', editApelidoTarget.apelido);
      } else if (editApelidoTarget.arquivo_origem) {
        query = query.eq('arquivo_origem', editApelidoTarget.arquivo_origem).is('apelido', null);
      }

      const { error } = await query;
      if (error) throw error;

      toast.success(`Apelido alterado para "${newApelido.trim()}"`);
      setEditApelidoTarget(null);
      setNewApelido('');
      fetchImportacoes();
    } catch (error: any) {
      console.error('Error updating apelido:', error);
      toast.error(error.message || 'Erro ao atualizar apelido');
    } finally {
      setIsSavingApelido(false);
    }
  };

  const handleViewDetails = (linha: LinhaOperadora) => {
    setSelectedLinha(linha);
    setIsDetailOpen(true);
  };

  const exportImportCSV = async (imp: ImportacaoInfo) => {
    try {
      let query = supabase.from('linha_operadora').select('*').order('created_at', { ascending: false });
      if (imp.apelido) {
        query = query.eq('apelido', imp.apelido);
      } else if (imp.arquivo_origem) {
        query = query.eq('arquivo_origem', imp.arquivo_origem);
      }

      const { data, error } = await query;
      if (error) throw error;

      const headers = ['Operadora', 'Protocolo', 'Cliente', 'CPF/CNPJ', 'Telefone', 'Plano', 'Tipo Plano', 'Valor', 'Valor LQ', 'Status', 'Data', 'Apelido'];
      const rows = (data || []).map((l: any) => [
        l.operadora,
        l.protocolo_operadora || '',
        l.cliente_nome || '',
        l.cpf_cnpj || '',
        l.telefone || '',
        l.plano || '',
        l.tipo_plano || '',
        l.valor?.toString() || '',
        l.valor_lq?.toString() || '',
        statusLabels[l.status_operadora as StatusOperadora] || l.status_operadora,
        l.data_status ? format(new Date(l.data_status), 'dd/MM/yyyy') : '',
        l.apelido || '',
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `linha_operadora_${imp.label.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Erro ao exportar CSV');
    }
  };

  if (isLoading) {
    return (
      <AppLayout title="Linha a Linha Operadora">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Linha a Linha Operadora">
      <div className="space-y-6">
        {/* Header actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div>
            <h2 className="text-lg font-semibold">Importações de Linha a Linha</h2>
            <p className="text-sm text-muted-foreground">
              {importacoes.length} lote(s) importado(s) · {importacoes.reduce((s, i) => s + i.count, 0)} registros totais
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isAdmin && (
              <>
                <Button onClick={handleOpenUpload}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar CSV
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/mapeamento-colunas">
                    <Settings className="h-4 w-4 mr-2" />
                    Mapeamentos
                  </Link>
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={fetchImportacoes}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Import list */}
        {importacoes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma importação realizada ainda.</p>
              {isAdmin && (
                <Button className="mt-4" onClick={handleOpenUpload}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar primeiro lote
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {importacoes.map((imp) => (
              <Card key={imp.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                      onClick={() => handleExpandImport(imp.label)}
                    >
                      {expandedImport === imp.label ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{imp.label}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{imp.operadora}</span>
                          <span>{imp.count} registros</span>
                          <span>{imp.conciliacoes} conciliado(s)</span>
                          <span>{format(new Date(imp.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                          {imp.arquivo_origem && imp.apelido && imp.arquivo_origem !== imp.apelido && (
                            <span className="italic">Arquivo: {imp.arquivo_origem}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEditApelido(imp)} title="Editar apelido">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => exportImportCSV(imp)} title="Exportar CSV">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteImportTarget(imp.label)}
                            title="Excluir importação"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {!isAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => exportImportCSV(imp)} title="Exportar CSV">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedImport === imp.label && (
                    <div className="mt-4 border-t pt-4">
                      {isLoadingLinhas ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : expandedLinhas.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">Nenhum registro encontrado</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground mb-2">
                            Mostrando {Math.min(100, expandedLinhas.length)} de {imp.count} registros
                          </p>
                          <div className="rounded-md border overflow-x-auto max-h-96">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Protocolo</TableHead>
                                  <TableHead className="text-xs">Cliente</TableHead>
                                  <TableHead className="text-xs">CPF/CNPJ</TableHead>
                                  <TableHead className="text-xs">Tipo Plano</TableHead>
                                  <TableHead className="text-xs">Valor LQ</TableHead>
                                  <TableHead className="text-xs">Status</TableHead>
                                  <TableHead className="text-xs text-right">Ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {expandedLinhas.map((linha) => (
                                  <TableRow key={linha.id}>
                                    <TableCell className="text-xs font-mono">{linha.protocolo_operadora || '-'}</TableCell>
                                    <TableCell className="text-xs">{linha.cliente_nome || '-'}</TableCell>
                                    <TableCell className="text-xs font-mono">{linha.cpf_cnpj || '-'}</TableCell>
                                    <TableCell className="text-xs">
                                      {linha.tipo_plano === 'COMBO' ? (
                                        <Badge variant="secondary" className="text-[10px]">COMBO</Badge>
                                      ) : (
                                        linha.tipo_plano || '-'
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {(linha.valor_lq || linha.valor)
                                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(linha.valor_lq || linha.valor || 0)
                                        : '-'
                                      }
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={`text-[10px] ${statusColors[linha.status_operadora]}`}>
                                        {statusLabels[linha.status_operadora]}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewDetails(linha)}>
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes do Registro</DialogTitle>
              <DialogDescription>
                Protocolo: {selectedLinha?.protocolo_operadora || 'N/A'}
              </DialogDescription>
            </DialogHeader>
            {selectedLinha && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Operadora</Label>
                    <p className="font-medium">{selectedLinha.operadora}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge className={statusColors[selectedLinha.status_operadora]}>
                      {statusLabels[selectedLinha.status_operadora]}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Cliente</Label>
                    <p className="font-medium">{selectedLinha.cliente_nome || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">CPF/CNPJ</Label>
                    <p className="font-medium font-mono">{selectedLinha.cpf_cnpj || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Telefone</Label>
                    <p className="font-medium">{selectedLinha.telefone || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Tipo Plano</Label>
                    <p className="font-medium">
                      {selectedLinha.tipo_plano === 'COMBO' ? (
                        <Badge variant="secondary">COMBO</Badge>
                      ) : (
                        selectedLinha.tipo_plano || '-'
                      )}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Plano</Label>
                    <p className="font-medium">{selectedLinha.plano || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor Original</Label>
                    <p className="font-medium">
                      {selectedLinha.valor 
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedLinha.valor)
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor LQ (Somado)</Label>
                    <p className="font-medium text-lg">
                      {selectedLinha.valor_lq 
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedLinha.valor_lq)
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor Make</Label>
                    <p className="font-medium">
                      {selectedLinha.valor_make 
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedLinha.valor_make)
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Quinzena Ref.</Label>
                    <p className="font-medium">{selectedLinha.quinzena_ref || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Apelido do Lote</Label>
                    <p className="font-medium">{selectedLinha.apelido || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Arquivo Origem</Label>
                    <p className="font-medium">{selectedLinha.arquivo_origem || '-'}</p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Upload Dialog */}
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Importar Dados da Operadora</DialogTitle>
              <DialogDescription>
                Selecione a operadora, defina o apelido do lote e faça upload do arquivo CSV
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {uploadError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="operadora">Operadora *</Label>
                  <Select value={selectedOperadoraUpload} onValueChange={setSelectedOperadoraUpload}>
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
                  <Label htmlFor="mapeamento">Mapeamento de Colunas *</Label>
                  <Select 
                    value={selectedMapeamentoId} 
                    onValueChange={setSelectedMapeamentoId}
                    disabled={!selectedOperadoraUpload || mapeamentosDisponiveis.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        !selectedOperadoraUpload 
                          ? "Selecione uma operadora primeiro" 
                          : mapeamentosDisponiveis.length === 0 
                            ? "Nenhum mapeamento disponível"
                            : "Selecione o mapeamento"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {mapeamentosDisponiveis.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome} {m.ativo && '(Padrão)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedOperadoraUpload && mapeamentosDisponiveis.length === 0 && (
                    <p className="text-xs text-destructive">
                      <Link to="/mapeamento-colunas" className="underline">
                        Crie um mapeamento
                      </Link> para esta operadora antes de importar.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apelido">Apelido do Lote *</Label>
                <Input
                  id="apelido"
                  placeholder="Ex: Claro Novembro 1ª Quinzena, TIM Dezembro Lote 2..."
                  value={apelidoLote}
                  onChange={(e) => setApelidoLote(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O apelido identifica este lote e será usado como referência de rastreabilidade nas conciliações.
                </p>
              </div>

              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  {selectedFile ? (
                    <span className="font-medium text-foreground">{selectedFile.name}</span>
                  ) : (
                    'Selecione um arquivo CSV'
                  )}
                </p>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  disabled={isUploading || !selectedMapeamentoId}
                  className="max-w-xs mx-auto"
                />
              </div>

              {showPreview && previewData.length > 0 && (
                <div className="space-y-2">
                  <Label>Prévia da Importação (primeiros 10 registros)</Label>
                  <div className="rounded-md border overflow-x-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>CPF/CNPJ</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Planos</TableHead>
                          <TableHead>Valor Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.map((grupo, i) => (
                          <TableRow key={i}>
                            <TableCell>{grupo.cliente_nome || '-'}</TableCell>
                            <TableCell className="font-mono text-xs">{grupo.cpf_cnpj || '-'}</TableCell>
                            <TableCell>
                              {grupo.planos.length > 1 ? (
                                <Badge variant="secondary">COMBO</Badge>
                              ) : (
                                <Badge variant="outline">Único</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs max-w-32 truncate">{grupo.planos.join(', ') || '-'}</TableCell>
                            <TableCell className="font-medium">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(grupo.valor_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {previewData.filter(g => g.planos.length > 1).length} registros serão importados como COMBO
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadOpen(false)} disabled={isUploading}>
                Cancelar
              </Button>
              <Button 
                onClick={handleFileUpload} 
                disabled={isUploading || !selectedFile || !selectedOperadoraUpload || !selectedMapeamentoId || !apelidoLote.trim()}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Importar
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Apelido Dialog */}
        <Dialog open={!!editApelidoTarget} onOpenChange={(open) => !open && setEditApelidoTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Apelido do Lote</DialogTitle>
              <DialogDescription>
                Altere o apelido de identificação deste lote. Todos os registros serão atualizados.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Apelido atual</Label>
                <p className="text-sm text-muted-foreground">{editApelidoTarget?.label}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-apelido">Novo apelido *</Label>
                <Input
                  id="new-apelido"
                  placeholder="Ex: Claro Novembro 1ª Quinzena"
                  value={newApelido}
                  onChange={(e) => setNewApelido(e.target.value)}
                />
              </div>
              {editApelidoTarget?.arquivo_origem && (
                <p className="text-xs text-muted-foreground">
                  Arquivo de origem: {editApelidoTarget.arquivo_origem}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditApelidoTarget(null)} disabled={isSavingApelido}>
                Cancelar
              </Button>
              <Button onClick={handleSaveApelido} disabled={isSavingApelido || !newApelido.trim()}>
                {isSavingApelido ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                ) : (
                  'Salvar'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Import Confirmation */}
        <AlertDialog open={!!deleteImportTarget} onOpenChange={(open) => !open && setDeleteImportTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Importação</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir todos os <strong>{deleteImportTarget && importacoes.find(i => i.label === deleteImportTarget)?.count}</strong> registros 
                da importação <strong>"{deleteImportTarget}"</strong>? As conciliações vinculadas também serão removidas. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingImport}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteImport}
                disabled={isDeletingImport}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletingImport && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
