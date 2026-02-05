import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { VendaInterna, LinhaOperadora, Conciliacao, TipoMatch, StatusConciliacao } from '@/types/database';
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
import { Textarea } from '@/components/ui/textarea';
import { 
  Loader2, 
  Search, 
  Link2, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Filter,
  FileSpreadsheet,
  Wand2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const statusColors: Record<StatusConciliacao, string> = {
  conciliado: 'bg-success text-success-foreground',
  divergente: 'bg-warning text-warning-foreground',
  nao_encontrado: 'bg-destructive text-destructive-foreground',
};

const statusLabels: Record<StatusConciliacao, string> = {
  conciliado: 'Conciliado',
  divergente: 'Divergente',
  nao_encontrado: 'Não Encontrado',
};

const tipoMatchLabels: Record<TipoMatch, string> = {
  protocolo: 'Protocolo',
  cpf: 'CPF/CNPJ',
  telefone: 'Telefone',
  manual: 'Manual',
};

interface VendaWithConciliacao extends VendaInterna {
  conciliacao?: Conciliacao | null;
  linhaOperadoraVinculada?: LinhaOperadora | null;
}

export default function ConciliacaoPage() {
  const { user, isAdmin } = useAuth();
  const [vendas, setVendas] = useState<VendaWithConciliacao[]>([]);
  const [linhasOperadora, setLinhasOperadora] = useState<LinhaOperadora[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isMatchOpen, setIsMatchOpen] = useState(false);
  const [selectedVenda, setSelectedVenda] = useState<VendaWithConciliacao | null>(null);
  const [selectedLinha, setSelectedLinha] = useState<string>('');
  const [tipoMatch, setTipoMatch] = useState<TipoMatch>('manual');
  const [observacao, setObservacao] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [linhaSearch, setLinhaSearch] = useState('');
  const [arquivoFilter, setArquivoFilter] = useState<string>('all');
  const [arquivosDisponiveis, setArquivosDisponiveis] = useState<string[]>([]);
  const [isAutoMatchRunning, setIsAutoMatchRunning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch vendas with conciliacao
      const { data: vendasData, error: vendasError } = await supabase
        .from('vendas_internas')
        .select(`
          *,
          vendedor:usuarios!vendas_internas_usuario_id_fkey(nome)
        `)
        .order('created_at', { ascending: false });

      if (vendasError) throw vendasError;

      // Fetch conciliacoes
      const { data: conciliacoesData, error: conciliacoesError } = await supabase
        .from('conciliacoes')
        .select('*');

      if (conciliacoesError) throw conciliacoesError;

      // Fetch linhas operadora
      const { data: linhasData, error: linhasError } = await supabase
        .from('linha_operadora')
        .select('*')
        .order('created_at', { ascending: false });

      if (linhasError) throw linhasError;

      // Map conciliacoes to vendas
      const vendasWithConciliacao = vendasData.map(venda => {
        const conciliacao = conciliacoesData?.find(c => c.venda_interna_id === venda.id);
        const linhaOperadoraVinculada = conciliacao 
          ? linhasData?.find(l => l.id === conciliacao.linha_operadora_id) 
          : null;
        return { ...venda, conciliacao, linhaOperadoraVinculada } as VendaWithConciliacao;
      });

      setVendas(vendasWithConciliacao);
      setLinhasOperadora(linhasData as LinhaOperadora[]);
      
      // Extract unique arquivo_origem values
      const arquivos = [...new Set(
        linhasData
          .map(l => l.arquivo_origem)
          .filter((a): a is string => a !== null && a !== undefined)
      )];
      setArquivosDisponiveis(arquivos);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenMatch = (venda: VendaWithConciliacao) => {
    setSelectedVenda(venda);
    setSelectedLinha('');
    setTipoMatch('manual');
    setObservacao('');
    setLinhaSearch('');
    setIsMatchOpen(true);
  };

  const handleSaveMatch = async () => {
    if (!selectedVenda || !selectedLinha) {
      toast.error('Selecione um registro da operadora');
      return;
    }

    setIsSaving(true);

    try {
      // Check if conciliacao already exists
      if (selectedVenda.conciliacao) {
        // Update existing
        const { error } = await supabase
          .from('conciliacoes')
          .update({
            linha_operadora_id: selectedLinha,
            tipo_match: tipoMatch,
            status_final: 'conciliado',
            validado_por: user?.id,
            validado_em: new Date().toISOString(),
            observacao,
          })
          .eq('id', selectedVenda.conciliacao.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('conciliacoes')
          .insert({
            venda_interna_id: selectedVenda.id,
            linha_operadora_id: selectedLinha,
            tipo_match: tipoMatch,
            status_final: 'conciliado',
            validado_por: user?.id,
            validado_em: new Date().toISOString(),
            observacao,
          });

        if (error) throw error;
      }

      // Update venda status to confirmada
      await supabase
        .from('vendas_internas')
        .update({ status_interno: 'confirmada' })
        .eq('id', selectedVenda.id);

      toast.success('Conciliação realizada com sucesso');
      setIsMatchOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving match:', error);
      toast.error(error.message || 'Erro ao salvar conciliação');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (venda: VendaWithConciliacao) => {
    if (!venda.conciliacao) {
      return (
        <Badge variant="outline" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Pendente
        </Badge>
      );
    }
    return (
      <Badge className={statusColors[venda.conciliacao.status_final]}>
        {statusLabels[venda.conciliacao.status_final]}
      </Badge>
    );
  };

  // Get linhas filtered by arquivo
  const linhasDoArquivo = arquivoFilter !== 'all' 
    ? linhasOperadora.filter(l => l.arquivo_origem === arquivoFilter)
    : linhasOperadora;

  const filteredVendas = vendas.filter(venda => {
    const matchesSearch = 
      venda.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.protocolo_interno?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filter by arquivo - show only vendas that have a match in the selected arquivo
    let matchesArquivo = true;
    if (arquivoFilter !== 'all') {
      // Show vendas that either:
      // 1. Are already linked to a linha from this arquivo
      // 2. Have potential matches (CPF or protocolo) in this arquivo
      const hasLinkInArquivo = venda.linhaOperadoraVinculada?.arquivo_origem === arquivoFilter;
      const hasPotentialMatch = linhasDoArquivo.some(linha => 
        (venda.cpf_cnpj && linha.cpf_cnpj && normalizeDoc(venda.cpf_cnpj) === normalizeDoc(linha.cpf_cnpj)) ||
        (venda.protocolo_interno && linha.protocolo_operadora && venda.protocolo_interno === linha.protocolo_operadora) ||
        (venda.telefone && linha.telefone && normalizeTelefone(venda.telefone) === normalizeTelefone(linha.telefone))
      );
      matchesArquivo = hasLinkInArquivo || hasPotentialMatch;
    }
    
    if (statusFilter === 'all') return matchesSearch && matchesArquivo;
    if (statusFilter === 'pendente') return matchesSearch && matchesArquivo && !venda.conciliacao;
    return matchesSearch && matchesArquivo && venda.conciliacao?.status_final === statusFilter;
  });

  // Helper functions for matching
  function normalizeDoc(doc: string): string {
    return doc.replace(/\D/g, '');
  }

  function normalizeTelefone(tel: string): string {
    return tel.replace(/\D/g, '').slice(-9);
  }

  // Find potential matches for a venda
  const findMatchingLinha = (venda: VendaInterna): { linha: LinhaOperadora; tipoMatch: TipoMatch } | null => {
    for (const linha of linhasDoArquivo) {
      // Match by protocolo
      if (venda.protocolo_interno && linha.protocolo_operadora && 
          venda.protocolo_interno === linha.protocolo_operadora) {
        return { linha, tipoMatch: 'protocolo' };
      }
      // Match by CPF/CNPJ
      if (venda.cpf_cnpj && linha.cpf_cnpj && 
          normalizeDoc(venda.cpf_cnpj) === normalizeDoc(linha.cpf_cnpj)) {
        return { linha, tipoMatch: 'cpf' };
      }
      // Match by telefone
      if (venda.telefone && linha.telefone && 
          normalizeTelefone(venda.telefone) === normalizeTelefone(linha.telefone)) {
        return { linha, tipoMatch: 'telefone' };
      }
    }
    return null;
  };

  // Get vendas that can be auto-matched
  const vendasParaAutoMatch = filteredVendas.filter(v => !v.conciliacao && findMatchingLinha(v));

  // Auto-match all vendas
  const handleAutoMatchAll = async () => {
    if (arquivoFilter === 'all') {
      toast.error('Selecione um arquivo Linha a Linha para vincular');
      return;
    }

    const vendasToMatch = vendasParaAutoMatch;
    if (vendasToMatch.length === 0) {
      toast.info('Nenhuma venda pendente encontrada para vincular automaticamente');
      return;
    }

    setIsAutoMatchRunning(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const venda of vendasToMatch) {
        const match = findMatchingLinha(venda);
        if (match) {
          const { error } = await supabase
            .from('conciliacoes')
            .insert({
              venda_interna_id: venda.id,
              linha_operadora_id: match.linha.id,
              tipo_match: match.tipoMatch,
              status_final: 'conciliado',
              validado_por: user?.id,
              validado_em: new Date().toISOString(),
              observacao: `Vinculação automática - Arquivo: ${arquivoFilter}`,
            });

          if (error) {
            console.error('Error matching venda:', venda.id, error);
            errorCount++;
          } else {
            // Update venda status to confirmada
            await supabase
              .from('vendas_internas')
              .update({ status_interno: 'confirmada' })
              .eq('id', venda.id);
            successCount++;
          }
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} venda(s) vinculada(s) com sucesso!`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} venda(s) não puderam ser vinculadas`);
      }
      
      fetchData();
    } catch (error) {
      console.error('Error in auto-match:', error);
      toast.error('Erro ao vincular vendas automaticamente');
    } finally {
      setIsAutoMatchRunning(false);
    }
  };

  const filteredLinhas = linhasOperadora.filter(linha => {
    if (!linhaSearch) return true;
    return (
      linha.cliente_nome?.toLowerCase().includes(linhaSearch.toLowerCase()) ||
      linha.cpf_cnpj?.toLowerCase().includes(linhaSearch.toLowerCase()) ||
      linha.protocolo_operadora?.toLowerCase().includes(linhaSearch.toLowerCase())
    );
  });

  if (isLoading) {
    return (
      <AppLayout title="Conciliação">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Conciliação">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {vendas.filter(v => v.conciliacao?.status_final === 'conciliado').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Conciliados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {vendas.filter(v => v.conciliacao?.status_final === 'divergente').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Divergentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {vendas.filter(v => !v.conciliacao).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Link2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{vendas.length}</p>
                  <p className="text-sm text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendente">Pendentes</SelectItem>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Arquivo filter and auto-match */}
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1">
                  <Label className="text-sm font-medium mb-2 block">Filtrar por Linha a Linha</Label>
                  <Select value={arquivoFilter} onValueChange={setArquivoFilter}>
                    <SelectTrigger className="w-full">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Selecione um arquivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os arquivos</SelectItem>
                      {arquivosDisponiveis.map((arquivo) => (
                        <SelectItem key={arquivo} value={arquivo}>{arquivo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {arquivoFilter !== 'all' && (
                  <Button 
                    onClick={handleAutoMatchAll}
                    disabled={isAutoMatchRunning || vendasParaAutoMatch.length === 0}
                    className="gap-2"
                  >
                    {isAutoMatchRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Vincular Todas ({vendasParaAutoMatch.length})
                  </Button>
                )}
              </div>

              {arquivoFilter !== 'all' && (
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                  <strong>{filteredVendas.length}</strong> venda(s) encontrada(s) no arquivo "{arquivoFilter}" 
                  {vendasParaAutoMatch.length > 0 && (
                    <span className="ml-2">
                      • <strong>{vendasParaAutoMatch.length}</strong> pendente(s) para vincular automaticamente
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Vendas para Conciliar ({filteredVendas.length})</CardTitle>
            <CardDescription>
              Vincule vendas internas aos registros da operadora
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Linha a Linha</TableHead>
                    <TableHead>Tipo Match</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        Nenhuma venda encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendas.map((venda) => (
                      <TableRow key={venda.id}>
                        <TableCell className="font-mono text-sm">
                          {venda.protocolo_interno || '-'}
                        </TableCell>
                        <TableCell className="font-medium">{venda.cliente_nome}</TableCell>
                        <TableCell className="font-mono text-sm">{venda.cpf_cnpj || '-'}</TableCell>
                        <TableCell>{venda.plano || '-'}</TableCell>
                        <TableCell>
                          {venda.valor 
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)
                            : '-'
                          }
                        </TableCell>
                        <TableCell>{getStatusBadge(venda)}</TableCell>
                        <TableCell>
                          {venda.linhaOperadoraVinculada ? (
                            <div className="text-sm">
                              <span className="font-medium">{venda.linhaOperadoraVinculada.operadora}</span>
                              {venda.linhaOperadoraVinculada.protocolo_operadora && (
                                <span className="text-muted-foreground ml-1">
                                  ({venda.linhaOperadoraVinculada.protocolo_operadora})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {venda.conciliacao 
                            ? tipoMatchLabels[venda.conciliacao.tipo_match]
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant={venda.conciliacao ? "ghost" : "default"}
                            size="sm"
                            onClick={() => handleOpenMatch(venda)}
                          >
                            <Link2 className="h-4 w-4 mr-2" />
                            {venda.conciliacao ? 'Editar' : 'Vincular'}
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

        {/* Match Dialog */}
        <Dialog open={isMatchOpen} onOpenChange={setIsMatchOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Vincular com Registro da Operadora</DialogTitle>
              <DialogDescription>
                Venda: {selectedVenda?.cliente_nome} - {selectedVenda?.cpf_cnpj}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Match</Label>
                  <Select value={tipoMatch} onValueChange={(v) => setTipoMatch(v as TipoMatch)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(tipoMatchLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Buscar Linha Operadora</Label>
                  <Input
                    placeholder="Buscar por cliente, CPF ou protocolo..."
                    value={linhaSearch}
                    onChange={(e) => setLinhaSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Selecione o registro da operadora</Label>
                <div className="border rounded-md max-h-60 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Operadora</TableHead>
                        <TableHead>Protocolo</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>CPF/CNPJ</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLinhas.slice(0, 50).map((linha) => (
                        <TableRow 
                          key={linha.id}
                          className={`cursor-pointer ${selectedLinha === linha.id ? 'bg-accent' : ''}`}
                          onClick={() => setSelectedLinha(linha.id)}
                        >
                          <TableCell>
                            <input
                              type="radio"
                              checked={selectedLinha === linha.id}
                              onChange={() => setSelectedLinha(linha.id)}
                              className="h-4 w-4"
                            />
                          </TableCell>
                          <TableCell>{linha.operadora}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {linha.protocolo_operadora || '-'}
                          </TableCell>
                          <TableCell>{linha.cliente_nome || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{linha.cpf_cnpj || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{linha.status_operadora}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredLinhas.length > 50 && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando 50 de {filteredLinhas.length} registros. Use a busca para filtrar.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Adicione uma observação sobre esta conciliação..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsMatchOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveMatch} disabled={isSaving || !selectedLinha}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar Vínculo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
