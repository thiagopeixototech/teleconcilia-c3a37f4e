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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Loader2, Search, Upload, Eye, Download, Filter, FileSpreadsheet,
  AlertCircle, Radio, Settings, Trash2
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

export default function LinhaOperadoraPage() {
  const { isAdmin } = useAuth();
  const [linhas, setLinhas] = useState<LinhaOperadora[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [mapeamentos, setMapeamentos] = useState<MapeamentoColunas[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operadoraFilter, setOperadoraFilter] = useState<string>('all');
  const [selectedLinha, setSelectedLinha] = useState<LinhaOperadora | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedOperadoraUpload, setSelectedOperadoraUpload] = useState<string>('');
  const [selectedMapeamentoId, setSelectedMapeamentoId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<LinhaAgrupada[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isManageImportsOpen, setIsManageImportsOpen] = useState(false);
  const [deleteImportTarget, setDeleteImportTarget] = useState<string | null>(null);
  const [isDeletingImport, setIsDeletingImport] = useState(false);
  const [apelidoLote, setApelidoLote] = useState('');

  useEffect(() => {
    fetchLinhas();
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

  const fetchLinhas = async () => {
    try {
      const { data, error } = await supabase
        .from('linha_operadora')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLinhas(data as LinhaOperadora[]);
    } catch (error) {
      console.error('Error fetching linhas:', error);
      toast.error('Erro ao carregar dados da operadora');
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

  const operadorasFromLinhas = [...new Set(linhas.map(l => l.operadora))];

  const handleViewDetails = (linha: LinhaOperadora) => {
    setSelectedLinha(linha);
    setIsDetailOpen(true);
  };

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
    if (!selectedFile) {
      setUploadError('Selecione um arquivo');
      return;
    }
    if (!selectedOperadoraUpload) {
      setUploadError('Selecione a operadora');
      return;
    }
    if (!selectedMapeamentoId) {
      setUploadError('Selecione ou crie um mapeamento de colunas');
      return;
    }
    if (!apelidoLote.trim()) {
      setUploadError('Defina um apelido para o lote (ex: Claro Novembro 1ª Quinzena)');
      return;
    }

    const operadora = operadoras.find(o => o.id === selectedOperadoraUpload);
    const mapeamento = mapeamentos.find(m => m.id === selectedMapeamentoId);
    
    if (!operadora || !mapeamento) {
      setUploadError('Configuração inválida');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const content = await selectedFile.text();
      const rows = parseCSV(content);

      if (rows.length === 0) {
        throw new Error('Arquivo vazio ou formato inválido');
      }

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
      fetchLinhas();
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setUploadError(error.message || 'Erro ao processar arquivo');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const exportToCSV = () => {
    const headers = ['Operadora', 'Protocolo', 'Cliente', 'CPF/CNPJ', 'Telefone', 'Plano', 'Tipo Plano', 'Valor', 'Valor LQ', 'Status', 'Data', 'Apelido'];
    const rows = filteredLinhas.map(l => [
      l.operadora,
      l.protocolo_operadora || '',
      l.cliente_nome || '',
      l.cpf_cnpj || '',
      l.telefone || '',
      l.plano || '',
      l.tipo_plano || '',
      l.valor?.toString() || '',
      l.valor_lq?.toString() || '',
      statusLabels[l.status_operadora],
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
    link.download = `linha_operadora_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredLinhas = linhas.filter(linha => {
    const matchesSearch = 
      linha.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      linha.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      linha.protocolo_operadora?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      linha.apelido?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || linha.status_operadora === statusFilter;
    const matchesOperadora = operadoraFilter === 'all' || linha.operadora === operadoraFilter;
    
    return matchesSearch && matchesStatus && matchesOperadora;
  });

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

  // Get distinct imports grouped by apelido (fallback arquivo_origem)
  const importacoes = linhas.reduce((acc, linha) => {
    const key = linha.apelido || linha.arquivo_origem || 'Sem arquivo';
    if (!acc[key]) {
      acc[key] = { count: 0, operadora: linha.operadora, createdAt: linha.created_at, arquivo: linha.arquivo_origem };
    }
    acc[key].count += 1;
    if (linha.created_at < acc[key].createdAt) {
      acc[key].createdAt = linha.created_at;
    }
    return acc;
  }, {} as Record<string, { count: number; operadora: string; createdAt: string; arquivo: string | null }>);

  const handleDeleteImport = async () => {
    if (!deleteImportTarget) return;
    setIsDeletingImport(true);
    try {
      // Try to find by apelido first, then arquivo_origem
      const { data: linhasToDelete } = await supabase
        .from('linha_operadora')
        .select('id')
        .or(`apelido.eq.${deleteImportTarget},arquivo_origem.eq.${deleteImportTarget}`);

      if (linhasToDelete && linhasToDelete.length > 0) {
        const linhaIds = linhasToDelete.map(l => l.id);
        await supabase
          .from('conciliacoes')
          .delete()
          .in('linha_operadora_id', linhaIds);
      }

      const { error } = await supabase
        .from('linha_operadora')
        .delete()
        .or(`apelido.eq.${deleteImportTarget},arquivo_origem.eq.${deleteImportTarget}`);

      if (error) throw error;

      toast.success(`Importação "${deleteImportTarget}" excluída com sucesso`);
      setDeleteImportTarget(null);
      setIsManageImportsOpen(false);
      fetchLinhas();
    } catch (error: any) {
      console.error('Error deleting import:', error);
      toast.error(error.message || 'Erro ao excluir importação');
    } finally {
      setIsDeletingImport(false);
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
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, CPF/CNPJ, protocolo ou apelido..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={operadoraFilter} onValueChange={setOperadoraFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <Radio className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Operadora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Operadoras</SelectItem>
                  {operadorasFromLinhas.map((op) => (
                    <SelectItem key={op} value={op}>{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {isAdmin && (
                <>
                  <Button onClick={handleOpenUpload}>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar CSV
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsManageImportsOpen(true)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir Importação
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/mapeamento-colunas">
                      <Settings className="h-4 w-4 mr-2" />
                      Mapeamentos
                    </Link>
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Registros da Operadora ({filteredLinhas.length})</CardTitle>
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
                    <TableHead>Tipo Plano</TableHead>
                    <TableHead>Valor LQ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Apelido</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLinhas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        Nenhum registro encontrado
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
                        <TableCell>
                          {linha.tipo_plano === 'COMBO' ? (
                            <Badge variant="secondary">COMBO</Badge>
                          ) : (
                            linha.tipo_plano || '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {linha.valor_lq 
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(linha.valor_lq)
                            : (linha.valor 
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(linha.valor)
                              : '-')
                          }
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[linha.status_operadora]}>
                            {statusLabels[linha.status_operadora]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {linha.data_status 
                            ? format(new Date(linha.data_status), 'dd/MM/yyyy', { locale: ptBR })
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {linha.apelido || linha.arquivo_origem || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleViewDetails(linha)}
                          >
                            <Eye className="h-4 w-4" />
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

        {/* Manage Imports Dialog */}
        <Dialog open={isManageImportsOpen} onOpenChange={setIsManageImportsOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Excluir Importação</DialogTitle>
              <DialogDescription>
                Selecione uma importação para excluir todos os registros associados
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {Object.keys(importacoes).length === 0 ? (
                <p className="text-center text-muted-foreground py-4">Nenhuma importação encontrada</p>
              ) : (
                Object.entries(importacoes)
                  .sort(([, a], [, b]) => b.createdAt.localeCompare(a.createdAt))
                  .map(([key, info]) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-md border">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{key}</p>
                        <p className="text-xs text-muted-foreground">
                          {info.operadora} · {info.count} registros · {format(new Date(info.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive ml-2 shrink-0"
                        onClick={() => setDeleteImportTarget(key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Import Confirmation */}
        <AlertDialog open={!!deleteImportTarget} onOpenChange={(open) => !open && setDeleteImportTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Importação</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir todos os <strong>{deleteImportTarget && importacoes[deleteImportTarget]?.count}</strong> registros 
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
