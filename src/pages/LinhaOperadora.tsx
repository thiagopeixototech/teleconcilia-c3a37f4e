import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { LinhaOperadora, StatusOperadora, Operadora } from '@/types/database';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Loader2, 
  Search, 
  Upload, 
  Eye, 
  Download,
  Filter,
  FileSpreadsheet,
  AlertCircle,
  Radio
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

export default function LinhaOperadoraPage() {
  const { isAdmin } = useAuth();
  const [linhas, setLinhas] = useState<LinhaOperadora[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLinhas();
    fetchOperadoras();
  }, []);

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

  // Get unique operadoras from linhas for filter
  const operadorasFromLinhas = [...new Set(linhas.map(l => l.operadora))];

  const handleViewDetails = (linha: LinhaOperadora) => {
    setSelectedLinha(linha);
    setIsDetailOpen(true);
  };

  const parseCSV = (content: string): Record<string, string>[] => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadError(null);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setUploadError('Selecione um arquivo');
      return;
    }

    if (!selectedOperadoraUpload) {
      setUploadError('Selecione a operadora');
      return;
    }

    const operadora = operadoras.find(o => o.id === selectedOperadoraUpload);
    if (!operadora) {
      setUploadError('Operadora inválida');
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

      const linhasToInsert = rows.map(row => ({
        operadora: operadora.nome,
        protocolo_operadora: row.protocolo_operadora || row.protocolo || null,
        cpf_cnpj: row.cpf_cnpj || row.cpf || row.cnpj || null,
        cliente_nome: row.cliente_nome || row.cliente || row.nome || null,
        telefone: row.telefone || row.fone || null,
        plano: row.plano || null,
        valor: row.valor ? parseFloat(row.valor.replace(',', '.')) : null,
        data_status: row.data_status || row.data || null,
        status_operadora: (row.status_operadora || row.status || 'pendente') as StatusOperadora,
        quinzena_ref: row.quinzena_ref || row.quinzena || null,
        arquivo_origem: selectedFile.name,
      }));

      const { error } = await supabase
        .from('linha_operadora')
        .insert(linhasToInsert);

      if (error) throw error;

      toast.success(`${linhasToInsert.length} registros importados com sucesso para ${operadora.nome}`);
      setIsUploadOpen(false);
      setSelectedFile(null);
      setSelectedOperadoraUpload('');
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
    const headers = ['Operadora', 'Protocolo', 'Cliente', 'CPF/CNPJ', 'Telefone', 'Plano', 'Valor', 'Status', 'Data'];
    const rows = filteredLinhas.map(l => [
      l.operadora,
      l.protocolo_operadora || '',
      l.cliente_nome || '',
      l.cpf_cnpj || '',
      l.telefone || '',
      l.plano || '',
      l.valor?.toString() || '',
      statusLabels[l.status_operadora],
      l.data_status ? format(new Date(l.data_status), 'dd/MM/yyyy') : '',
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
      linha.protocolo_operadora?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || linha.status_operadora === statusFilter;
    const matchesOperadora = operadoraFilter === 'all' || linha.operadora === operadoraFilter;
    
    return matchesSearch && matchesStatus && matchesOperadora;
  });

  const handleOpenUpload = () => {
    setSelectedFile(null);
    setSelectedOperadoraUpload('');
    setUploadError(null);
    setIsUploadOpen(true);
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
                  placeholder="Buscar por cliente, CPF/CNPJ ou protocolo..."
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
                <Button onClick={handleOpenUpload}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar CSV
                </Button>
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
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLinhas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
                        <TableCell>{linha.plano || '-'}</TableCell>
                        <TableCell>
                          {linha.valor 
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(linha.valor)
                            : '-'
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
                    <Label className="text-muted-foreground">Plano</Label>
                    <p className="font-medium">{selectedLinha.plano || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor</Label>
                    <p className="font-medium">
                      {selectedLinha.valor 
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedLinha.valor)
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Quinzena Ref.</Label>
                    <p className="font-medium">{selectedLinha.quinzena_ref || '-'}</p>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar Dados da Operadora</DialogTitle>
              <DialogDescription>
                Selecione a operadora e faça upload do arquivo CSV
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {uploadError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}
              
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
                  disabled={isUploading}
                  className="max-w-xs mx-auto"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <p className="font-medium mb-1">Colunas esperadas:</p>
                <p>protocolo_operadora, cpf_cnpj, cliente_nome, telefone, plano, valor, data_status, status_operadora, quinzena_ref</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadOpen(false)} disabled={isUploading}>
                Cancelar
              </Button>
              <Button onClick={handleFileUpload} disabled={isUploading || !selectedFile || !selectedOperadoraUpload}>
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
      </div>
    </AppLayout>
  );
}
