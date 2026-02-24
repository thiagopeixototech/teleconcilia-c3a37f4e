import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { VendaInterna, LinhaOperadora, Conciliacao, TipoMatch, StatusConciliacao } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { registrarAuditoriaBatch, AuditLogEntry } from '@/services/auditService';
import { AuditLogPanel } from '@/components/audit/AuditLogPanel';
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
  vendedor?: { nome: string } | null;
}

export default function ConciliacaoPage() {
  const { user, vendedor: currentUser, isAdmin } = useAuth();
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
  const [matchCriteria, setMatchCriteria] = useState<'protocolo' | 'cpf' | 'todos'>('todos');
  const [vendedorFilter, setVendedorFilter] = useState<string>('all');
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
        .ilike('status_make', 'instalad%')
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

      // Update venda status to confirmada and set valor from linha operadora
      const linhaMatch = linhasOperadora.find(l => l.id === selectedLinha);
      const valorLinha = linhaMatch?.valor_lq ?? linhaMatch?.valor ?? null;
      const oldValor = selectedVenda.valor;
      const oldStatus = selectedVenda.status_interno;
      
      await supabase
        .from('vendas_internas')
        .update({ 
          status_interno: 'confirmada',
          ...(valorLinha !== null ? { valor: valorLinha } : {})
        })
        .eq('id', selectedVenda.id);

      // Registrar auditoria
      const auditEntries: AuditLogEntry[] = [
        {
          venda_id: selectedVenda.id,
          user_id: user?.id,
          user_nome: currentUser?.nome,
          acao: 'CONCILIAR',
          campo: null,
          valor_anterior: null,
          valor_novo: { linha_operadora_id: selectedLinha, tipo_match: tipoMatch },
          metadata: { observacao, operadora: linhaMatch?.operadora },
        },
      ];

      if (oldStatus !== 'confirmada') {
        auditEntries.push({
          venda_id: selectedVenda.id,
          user_id: user?.id,
          user_nome: currentUser?.nome,
          acao: 'MUDAR_STATUS_INTERNO',
          campo: 'status_interno',
          valor_anterior: oldStatus,
          valor_novo: 'confirmada',
          metadata: { motivo: 'Conciliação' },
        });
      }

      if (valorLinha !== null && valorLinha !== oldValor) {
        auditEntries.push({
          venda_id: selectedVenda.id,
          user_id: user?.id,
          user_nome: currentUser?.nome,
          acao: 'ALTERAR_VALOR',
          campo: 'valor',
          valor_anterior: oldValor,
          valor_novo: valorLinha,
          metadata: { motivo: 'Valor atualizado pela conciliação (valor_lq)' },
        });
      }

      await registrarAuditoriaBatch(auditEntries as any);

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
          Aguardando
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

  // Extract unique vendedores from vendas
  const vendedoresUnicos = useMemo(() => {
    const map = new Map<string, string>();
    vendas.forEach(v => {
      const nome = (v as any).vendedor?.nome;
      if (nome) map.set(nome, nome);
    });
    return [...map.values()].sort();
  }, [vendas]);

  const filteredVendas = vendas.filter(venda => {
    const matchesSearch = 
      venda.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venda.protocolo_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (venda as any).vendedor?.nome?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filter by vendedor
    const matchesVendedor = vendedorFilter === 'all' || 
      (venda as any).vendedor?.nome === vendedorFilter;

    // Filter by arquivo - show only vendas that have a match in the selected arquivo
    let matchesArquivo = true;
    if (arquivoFilter !== 'all') {
      const hasLinkInArquivo = venda.linhaOperadoraVinculada?.arquivo_origem === arquivoFilter;
      const hasPotentialMatch = linhasDoArquivo.some(linha => 
        (venda.cpf_cnpj && linha.cpf_cnpj && normalizeDoc(venda.cpf_cnpj) === normalizeDoc(linha.cpf_cnpj)) ||
        (venda.protocolo_interno && linha.protocolo_operadora && venda.protocolo_interno === linha.protocolo_operadora) ||
        (venda.telefone && linha.telefone && normalizeTelefone(venda.telefone) === normalizeTelefone(linha.telefone))
      );
      matchesArquivo = hasLinkInArquivo || hasPotentialMatch;
    }
    
    if (statusFilter === 'all') return matchesSearch && matchesArquivo && matchesVendedor;
    if (statusFilter === 'pendente') return matchesSearch && matchesArquivo && matchesVendedor && !venda.conciliacao;
    return matchesSearch && matchesArquivo && matchesVendedor && venda.conciliacao?.status_final === statusFilter;
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
      if ((matchCriteria === 'protocolo' || matchCriteria === 'todos') &&
          venda.protocolo_interno && linha.protocolo_operadora && 
          venda.protocolo_interno === linha.protocolo_operadora) {
        return { linha, tipoMatch: 'protocolo' };
      }
      // Match by CPF/CNPJ
      if ((matchCriteria === 'cpf' || matchCriteria === 'todos') &&
          venda.cpf_cnpj && linha.cpf_cnpj && 
          normalizeDoc(venda.cpf_cnpj) === normalizeDoc(linha.cpf_cnpj)) {
        return { linha, tipoMatch: 'cpf' };
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
    const auditEntries: any[] = [];

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
            // Update venda status to confirmada and set valor from linha operadora
            const valorLinha = match.linha.valor_lq ?? match.linha.valor ?? null;
            await supabase
              .from('vendas_internas')
              .update({ 
                status_interno: 'confirmada',
                ...(valorLinha !== null ? { valor: valorLinha } : {})
              })
              .eq('id', venda.id);
            successCount++;

            auditEntries.push({
              venda_id: venda.id,
              user_id: user?.id,
              user_nome: currentUser?.nome,
              acao: 'CONCILIAR_LOTE',
              campo: null,
              valor_anterior: null,
              valor_novo: { linha_operadora_id: match.linha.id, tipo_match: match.tipoMatch },
              metadata: { arquivo: arquivoFilter, operadora: match.linha.operadora },
            });

            if (valorLinha !== null && valorLinha !== venda.valor) {
              auditEntries.push({
                venda_id: venda.id,
                user_id: user?.id,
                user_nome: currentUser?.nome,
                acao: 'ALTERAR_VALOR',
                campo: 'valor',
                valor_anterior: venda.valor,
                valor_novo: valorLinha,
                metadata: { motivo: 'Conciliação em lote (valor_lq)' },
              });
            }
          }
        }
      }

      // Registrar todos os logs de auditoria em batch
      if (auditEntries.length > 0) {
        await registrarAuditoriaBatch(auditEntries);
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
                  <p className="text-sm text-muted-foreground">Aguardando</p>
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
                    placeholder="Buscar por cliente, CPF/CNPJ, protocolo ou vendedor..."
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
                    <SelectItem value="pendente">Aguardando</SelectItem>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Vendedores</SelectItem>
                    {vendedoresUnicos.map((nome) => (
                      <SelectItem key={nome} value={nome}>{nome}</SelectItem>
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
                <div className="w-full md:w-52">
                  <Label className="text-sm font-medium mb-2 block">Critério de Match</Label>
                  <Select value={matchCriteria} onValueChange={(v) => setMatchCriteria(v as 'protocolo' | 'cpf' | 'todos')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Protocolo + CPF</SelectItem>
                      <SelectItem value="protocolo">Apenas Protocolo</SelectItem>
                      <SelectItem value="cpf">Apenas CPF/CNPJ</SelectItem>
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
                    <TableHead>Vendedor</TableHead>
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
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        Nenhuma venda encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendas.map((venda) => (
                      <TableRow key={venda.id}>
                        <TableCell className="text-sm">
                          {(venda as any).vendedor?.nome || '-'}
                        </TableCell>
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

              {/* Histórico de Auditoria da venda selecionada */}
              {selectedVenda && (
                <div className="border-t pt-4">
                  <AuditLogPanel vendaId={selectedVenda.id} isOpen={isMatchOpen} />
                </div>
              )}
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
