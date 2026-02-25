import { useState, useMemo, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { VendaInterna, LinhaOperadora, TipoMatch, StatusConciliacao } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { registrarAuditoriaBatch, AuditLogEntry } from '@/services/auditService';
import { AuditLogPanel } from '@/components/audit/AuditLogPanel';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, Search, Link2, CheckCircle, XCircle, AlertTriangle,
  FileSpreadsheet, Wand2, Copy, Download, HelpCircle, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MatchResult {
  linha: LinhaOperadora;
  venda: VendaInterna & { vendedor?: { nome: string } | null };
  tipoMatch: TipoMatch;
  score: number;
}

interface AmbiguousResult {
  linha: LinhaOperadora;
  candidates: Array<{ venda: VendaInterna & { vendedor?: { nome: string } | null }; tipoMatch: TipoMatch }>;
}

interface NotFoundResult {
  linha: LinhaOperadora;
  rowIndex: number;
  matchKeysUsed: string[];
}

interface InvalidResult {
  linha: LinhaOperadora;
  rowIndex: number;
  reason: string;
}

interface DuplicateResult {
  linha: LinhaOperadora;
  rowIndex: number;
  duplicateKey: string;
}

interface ProcessingResults {
  found: MatchResult[];
  ambiguous: AmbiguousResult[];
  notFound: NotFoundResult[];
  invalid: InvalidResult[];
  duplicates: DuplicateResult[];
  alreadyConciliated: MatchResult[];
}

interface BatchProgress {
  current: number;
  total: number;
  phase: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeDoc(doc: string): string {
  return doc.replace(/\D/g, '');
}

function normalizeTelefone(tel: string): string {
  return tel.replace(/\D/g, '').slice(-9);
}

const statusColors: Record<StatusConciliacao, string> = {
  conciliado: 'bg-success text-success-foreground',
  divergente: 'bg-warning text-warning-foreground',
  nao_encontrado: 'bg-destructive text-destructive-foreground',
};

const tipoMatchLabels: Record<TipoMatch, string> = {
  protocolo: 'Protocolo',
  cpf: 'CPF/CNPJ',
  telefone: 'Telefone',
  manual: 'Manual',
};

// Fetch all rows from a table bypassing the 1000-row limit
async function fetchAllRows<T>(
  queryFn: () => any,
  selectStr: string,
  filterFn?: (q: any) => any,
  orderCol = 'created_at',
): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    let q = queryFn().select(selectStr);
    if (filterFn) q = filterFn(q);
    q = q.order(orderCol, { ascending: false }).range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (data) all = all.concat(data as T[]);
    hasMore = (data?.length ?? 0) === PAGE;
    offset += PAGE;
  }
  return all;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConciliacaoPage() {
  const { user, vendedor: currentUser } = useAuth();

  // File selection
  const [arquivosDisponiveis, setArquivosDisponiveis] = useState<string[]>([]);
  const [arquivosLoaded, setArquivosLoaded] = useState(false);
  const [loadingArquivos, setLoadingArquivos] = useState(false);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<string>('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [results, setResults] = useState<ProcessingResults | null>(null);
  const resultsCache = useRef<Map<string, ProcessingResults>>(new Map());

  // UI state
  const [activeTab, setActiveTab] = useState('found');
  const [searchTerm, setSearchTerm] = useState('');
  const [displayLimit, setDisplayLimit] = useState(100);

  // Manual match dialog
  const [isMatchOpen, setIsMatchOpen] = useState(false);
  const [selectedNotFound, setSelectedNotFound] = useState<NotFoundResult | null>(null);
  const [linhaSearch, setLinhaSearch] = useState('');
  const [selectedVendaId, setSelectedVendaId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Conciliation in progress
  const [isConciliating, setIsConciliating] = useState(false);
  const [conciliationProgress, setConciliationProgress] = useState<BatchProgress | null>(null);

  // ─── Load available files (lightweight) ──────────────────────────────────

  const loadArquivos = useCallback(async () => {
    if (arquivosLoaded) return;
    setLoadingArquivos(true);
    try {
      const { data, error } = await supabase
        .from('linha_operadora')
        .select('arquivo_origem')
        .not('arquivo_origem', 'is', null);

      if (error) throw error;
      const unique = [...new Set((data || []).map((d: any) => d.arquivo_origem).filter(Boolean))] as string[];
      setArquivosDisponiveis(unique.sort());
      setArquivosLoaded(true);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar lista de arquivos');
    } finally {
      setLoadingArquivos(false);
    }
  }, [arquivosLoaded]);

  // Load on first interaction
  const handleOpenSelect = useCallback(() => {
    if (!arquivosLoaded) loadArquivos();
  }, [arquivosLoaded, loadArquivos]);

  // ─── Process file ────────────────────────────────────────────────────────

  const processFile = useCallback(async (arquivo: string) => {
    // Check cache
    const cached = resultsCache.current.get(arquivo);
    if (cached) {
      setResults(cached);
      setActiveTab('found');
      return;
    }

    setIsProcessing(true);
    setResults(null);
    setProgress({ current: 0, total: 0, phase: 'Carregando linhas do arquivo...' });

    try {
      // 1. Load linhas from the selected file
      const linhas = await fetchAllRows<LinhaOperadora>(
        () => supabase.from('linha_operadora'),
        '*',
        (q: any) => q.eq('arquivo_origem', arquivo),
      );

      if (linhas.length === 0) {
        toast.info('Arquivo não contém registros');
        setIsProcessing(false);
        setProgress(null);
        return;
      }

      setProgress({ current: 0, total: linhas.length, phase: 'Carregando conciliações existentes...' });

      // 2. Load existing conciliacoes for these linhas
      const linhaIds = linhas.map(l => l.id);
      const existingConciliacoes = await fetchExistingConciliacoes(linhaIds);
      const conciliadoLinhaIds = new Set(existingConciliacoes.map(c => c.linha_operadora_id));

      setProgress({ current: 0, total: linhas.length, phase: 'Buscando vendas instaladas...' });

      // 3. Collect all unique keys from linhas to query vendas
      const allProtocolos = new Set<string>();
      const allCpfs = new Set<string>();
      const allTelefones = new Set<string>();

      for (const l of linhas) {
        if (l.protocolo_operadora) allProtocolos.add(l.protocolo_operadora);
        if (l.cpf_cnpj) allCpfs.add(normalizeDoc(l.cpf_cnpj));
        if (l.telefone) allTelefones.add(normalizeTelefone(l.telefone));
      }

      // 4. Fetch only vendas that could match (server-side filter for status_make)
      const vendas = await fetchAllRows<VendaInterna & { vendedor?: { nome: string } | null }>(
        () => supabase.from('vendas_internas'),
        '*, vendedor:usuarios!vendas_internas_usuario_id_fkey(nome)',
        (q: any) => q.ilike('status_make', 'instalad%'),
      );

      setProgress({ current: 0, total: linhas.length, phase: 'Processando matches...' });

      // 5. Build indexes from vendas for O(1) lookups
      const vendaByProtocolo = new Map<string, Array<VendaInterna & { vendedor?: { nome: string } | null }>>();
      const vendaByCpf = new Map<string, Array<VendaInterna & { vendedor?: { nome: string } | null }>>();
      const vendaByTelefone = new Map<string, Array<VendaInterna & { vendedor?: { nome: string } | null }>>();

      for (const v of vendas) {
        if (v.protocolo_interno) {
          const key = v.protocolo_interno;
          if (!vendaByProtocolo.has(key)) vendaByProtocolo.set(key, []);
          vendaByProtocolo.get(key)!.push(v);
        }
        if (v.cpf_cnpj) {
          const key = normalizeDoc(v.cpf_cnpj);
          if (!vendaByCpf.has(key)) vendaByCpf.set(key, []);
          vendaByCpf.get(key)!.push(v);
        }
        if (v.telefone) {
          const key = normalizeTelefone(v.telefone);
          if (!vendaByTelefone.has(key)) vendaByTelefone.set(key, []);
          vendaByTelefone.get(key)!.push(v);
        }
      }

      // 6. Process linhas in batches for UI responsiveness
      const BATCH_SIZE = 500;
      const found: MatchResult[] = [];
      const ambiguous: AmbiguousResult[] = [];
      const notFound: NotFoundResult[] = [];
      const invalid: InvalidResult[] = [];
      const duplicates: DuplicateResult[] = [];
      const alreadyConciliated: MatchResult[] = [];
      const seenKeys = new Map<string, number>(); // key -> rowIndex

      for (let i = 0; i < linhas.length; i += BATCH_SIZE) {
        const batch = linhas.slice(i, i + BATCH_SIZE);

        for (let j = 0; j < batch.length; j++) {
          const linha = batch[j];
          const rowIndex = i + j + 1;

          // Check if already conciliated
          if (conciliadoLinhaIds.has(linha.id)) {
            const conc = existingConciliacoes.find(c => c.linha_operadora_id === linha.id);
            const vendaMatch = conc ? vendas.find(v => v.id === conc.venda_interna_id) : null;
            if (vendaMatch) {
              alreadyConciliated.push({
                linha,
                venda: vendaMatch,
                tipoMatch: conc!.tipo_match as TipoMatch,
                score: 100,
              });
            }
            continue;
          }

          // Determine match keys
          const hasProtocolo = !!linha.protocolo_operadora;
          const hasCpf = !!linha.cpf_cnpj;
          const hasTelefone = !!linha.telefone;

          if (!hasProtocolo && !hasCpf && !hasTelefone) {
            invalid.push({ linha, rowIndex, reason: 'Sem chave de match (protocolo, CPF ou telefone)' });
            continue;
          }

          // Check for duplicates in file
          const dupeKey = linha.protocolo_operadora || (linha.cpf_cnpj ? normalizeDoc(linha.cpf_cnpj) : '') || (linha.telefone ? normalizeTelefone(linha.telefone) : '');
          if (dupeKey && seenKeys.has(dupeKey)) {
            duplicates.push({ linha, rowIndex, duplicateKey: `Chave "${dupeKey}" já vista na linha ${seenKeys.get(dupeKey)}` });
            continue;
          }
          if (dupeKey) seenKeys.set(dupeKey, rowIndex);

          // Find candidates
          const candidates: Array<{ venda: VendaInterna & { vendedor?: { nome: string } | null }; tipoMatch: TipoMatch }> = [];
          const matchKeysUsed: string[] = [];

          if (hasProtocolo) {
            matchKeysUsed.push('protocolo');
            const matches = vendaByProtocolo.get(linha.protocolo_operadora!) || [];
            for (const v of matches) {
              candidates.push({ venda: v, tipoMatch: 'protocolo' });
            }
          }

          if (hasCpf && candidates.length === 0) {
            matchKeysUsed.push('cpf');
            const cpfKey = normalizeDoc(linha.cpf_cnpj!);
            const matches = vendaByCpf.get(cpfKey) || [];
            for (const v of matches) {
              if (!candidates.some(c => c.venda.id === v.id)) {
                candidates.push({ venda: v, tipoMatch: 'cpf' });
              }
            }
          }

          if (hasTelefone && candidates.length === 0) {
            matchKeysUsed.push('telefone');
            const telKey = normalizeTelefone(linha.telefone!);
            const matches = vendaByTelefone.get(telKey) || [];
            for (const v of matches) {
              if (!candidates.some(c => c.venda.id === v.id)) {
                candidates.push({ venda: v, tipoMatch: 'telefone' });
              }
            }
          }

          if (candidates.length === 0) {
            notFound.push({ linha, rowIndex, matchKeysUsed });
          } else if (candidates.length === 1) {
            found.push({
              linha,
              venda: candidates[0].venda,
              tipoMatch: candidates[0].tipoMatch,
              score: candidates[0].tipoMatch === 'protocolo' ? 100 : candidates[0].tipoMatch === 'cpf' ? 90 : 70,
            });
          } else {
            ambiguous.push({ linha, candidates });
          }
        }

        // Yield to UI
        setProgress({ current: Math.min(i + BATCH_SIZE, linhas.length), total: linhas.length, phase: 'Processando matches...' });
        await new Promise(r => setTimeout(r, 10));
      }

      const finalResults: ProcessingResults = { found, ambiguous, notFound, invalid, duplicates, alreadyConciliated };
      resultsCache.current.set(arquivo, finalResults);
      setResults(finalResults);
      setActiveTab(found.length > 0 ? 'found' : 'notFound');

      // Summary toast
      toast.success(
        `Processamento concluído: ${found.length} encontrados, ${notFound.length} não encontrados, ${alreadyConciliated.length} já conciliados`
      );
    } catch (err) {
      console.error(err);
      toast.error('Erro ao processar arquivo');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }, []);

  async function fetchExistingConciliacoes(linhaIds: string[]) {
    const all: any[] = [];
    const BATCH = 200;
    for (let i = 0; i < linhaIds.length; i += BATCH) {
      const batch = linhaIds.slice(i, i + BATCH);
      const { data } = await supabase
        .from('conciliacoes')
        .select('id, venda_interna_id, linha_operadora_id, tipo_match, status_final')
        .in('linha_operadora_id', batch);
      if (data) all.push(...data);
    }
    return all;
  }

  // ─── File selection handler ──────────────────────────────────────────────

  const handleFileSelect = useCallback((value: string) => {
    setArquivoSelecionado(value);
    setSearchTerm('');
    setDisplayLimit(100);
    if (value) {
      processFile(value);
    } else {
      setResults(null);
    }
  }, [processFile]);

  // ─── Batch conciliation ──────────────────────────────────────────────────

  const handleConciliateAll = useCallback(async () => {
    if (!results || results.found.length === 0) return;

    setIsConciliating(true);
    const BATCH = 50;
    let successCount = 0;
    let errorCount = 0;
    const auditEntries: AuditLogEntry[] = [];

    try {
      const items = results.found;
      setConciliationProgress({ current: 0, total: items.length, phase: 'Conciliando...' });

      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH);

        // Insert conciliacoes in batch
        const concRows = batch.map(m => ({
          venda_interna_id: m.venda.id,
          linha_operadora_id: m.linha.id,
          tipo_match: m.tipoMatch,
          status_final: 'conciliado' as const,
          score_match: m.score,
          validado_por: user?.id,
          validado_em: new Date().toISOString(),
          observacao: `Conciliação em lote - Arquivo: ${arquivoSelecionado}`,
        }));

        const { error: insertError } = await supabase
          .from('conciliacoes')
          .insert(concRows);

        if (insertError) {
          console.error('Batch insert error:', insertError);
          errorCount += batch.length;
        } else {
          // Update vendas status + valor in parallel
          const updatePromises = batch.map(async (m) => {
            const valorLinha = m.linha.valor_lq ?? m.linha.valor ?? null;
            await supabase
              .from('vendas_internas')
              .update({
                status_interno: 'confirmada',
                ...(valorLinha !== null ? { valor: valorLinha } : {}),
              })
              .eq('id', m.venda.id);

            auditEntries.push({
              venda_id: m.venda.id,
              user_id: user?.id,
              user_nome: currentUser?.nome,
              acao: 'CONCILIAR_LOTE',
              campo: null,
              valor_anterior: null,
              valor_novo: { linha_operadora_id: m.linha.id, tipo_match: m.tipoMatch },
              metadata: { arquivo: arquivoSelecionado, operadora: m.linha.operadora },
            });

            if (valorLinha !== null && valorLinha !== m.venda.valor) {
              auditEntries.push({
                venda_id: m.venda.id,
                user_id: user?.id,
                user_nome: currentUser?.nome,
                acao: 'ALTERAR_VALOR',
                campo: 'valor',
                valor_anterior: m.venda.valor,
                valor_novo: valorLinha,
                metadata: { motivo: 'Conciliação em lote (valor_lq)' },
              });
            }
          });

          await Promise.all(updatePromises);
          successCount += batch.length;
        }

        setConciliationProgress({ current: Math.min(i + BATCH, items.length), total: items.length, phase: 'Conciliando...' });
        await new Promise(r => setTimeout(r, 30));
      }

      // Audit batch
      if (auditEntries.length > 0) {
        await registrarAuditoriaBatch(auditEntries);
      }

      // Invalidate cache and reprocess
      resultsCache.current.delete(arquivoSelecionado);

      toast.success(`${successCount} venda(s) conciliada(s) com sucesso!${errorCount > 0 ? ` ${errorCount} falha(s).` : ''}`);

      // Reprocess to update results
      await processFile(arquivoSelecionado);
    } catch (err) {
      console.error(err);
      toast.error('Erro na conciliação em lote');
    } finally {
      setIsConciliating(false);
      setConciliationProgress(null);
    }
  }, [results, user, currentUser, arquivoSelecionado, processFile]);

  // ─── Manual match (for not-found items) ──────────────────────────────────

  const handleManualMatch = async () => {
    if (!selectedNotFound || !selectedVendaId) {
      toast.error('Selecione uma venda para vincular');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from('conciliacoes').insert({
        venda_interna_id: selectedVendaId,
        linha_operadora_id: selectedNotFound.linha.id,
        tipo_match: 'manual' as TipoMatch,
        status_final: 'conciliado',
        validado_por: user?.id,
        validado_em: new Date().toISOString(),
        observacao: observacao || 'Vinculação manual',
      });

      if (error) throw error;

      await supabase.from('vendas_internas').update({ status_interno: 'confirmada' }).eq('id', selectedVendaId);

      await registrarAuditoriaBatch([{
        venda_id: selectedVendaId,
        user_id: user?.id,
        user_nome: currentUser?.nome,
        acao: 'CONCILIAR',
        campo: null,
        valor_anterior: null,
        valor_novo: { linha_operadora_id: selectedNotFound.linha.id, tipo_match: 'manual' },
        metadata: { observacao, arquivo: arquivoSelecionado },
      }]);

      toast.success('Vínculo manual realizado');
      setIsMatchOpen(false);
      resultsCache.current.delete(arquivoSelecionado);
      processFile(arquivoSelecionado);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao vincular manualmente');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Export not-found ────────────────────────────────────────────────────

  const exportNotFound = useCallback(() => {
    if (!results) return;
    const lines = ['Linha;Protocolo;CPF/CNPJ;Telefone;Cliente;Chaves Usadas'];
    for (const nf of results.notFound) {
      lines.push([
        nf.rowIndex,
        nf.linha.protocolo_operadora || '',
        nf.linha.cpf_cnpj || '',
        nf.linha.telefone || '',
        nf.linha.cliente_nome || '',
        nf.matchKeysUsed.join(', '),
      ].join(';'));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nao-encontrados-${arquivoSelecionado}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, arquivoSelecionado]);

  const copyNotFoundToClipboard = useCallback(() => {
    if (!results) return;
    const lines = results.notFound.map(nf =>
      `Linha ${nf.rowIndex}: ${nf.linha.protocolo_operadora || 'sem protocolo'} | ${nf.linha.cpf_cnpj || 'sem CPF'} | ${nf.linha.cliente_nome || ''}`
    );
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success(`${results.notFound.length} itens copiados`);
  }, [results]);

  // ─── Filtered lists ──────────────────────────────────────────────────────

  const filteredNotFound = useMemo(() => {
    if (!results || !searchTerm) return results?.notFound || [];
    const s = searchTerm.toLowerCase();
    return results.notFound.filter(nf =>
      nf.linha.protocolo_operadora?.toLowerCase().includes(s) ||
      nf.linha.cpf_cnpj?.toLowerCase().includes(s) ||
      nf.linha.cliente_nome?.toLowerCase().includes(s) ||
      nf.linha.telefone?.includes(s)
    );
  }, [results, searchTerm]);

  const filteredFound = useMemo(() => {
    if (!results || !searchTerm) return results?.found || [];
    const s = searchTerm.toLowerCase();
    return results.found.filter(m =>
      m.linha.protocolo_operadora?.toLowerCase().includes(s) ||
      m.venda.protocolo_interno?.toLowerCase().includes(s) ||
      m.venda.cliente_nome?.toLowerCase().includes(s) ||
      m.linha.cpf_cnpj?.toLowerCase().includes(s)
    );
  }, [results, searchTerm]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const formatCurrency = (val: number | null) =>
    val != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val) : '-';

  return (
    <AppLayout title="Conciliação">
      <div className="space-y-6">
        {/* File selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Conciliação de Vendas
            </CardTitle>
            <CardDescription>
              Selecione um arquivo Linha a Linha importado para iniciar o processo de conciliação.
              O sistema cruzará automaticamente os registros com as vendas instaladas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <Label className="text-sm font-medium mb-2 block">Arquivo Linha a Linha</Label>
                <Select value={arquivoSelecionado} onValueChange={handleFileSelect} onOpenChange={(open) => { if (open) handleOpenSelect(); }}>
                  <SelectTrigger className="w-full">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Selecione um arquivo para conciliar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingArquivos && (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                    {arquivosDisponiveis.map((arq) => (
                      <SelectItem key={arq} value={arq}>{arq}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {arquivoSelecionado && results && (
                <Button
                  variant="outline"
                  onClick={() => {
                    resultsCache.current.delete(arquivoSelecionado);
                    processFile(arquivoSelecionado);
                  }}
                  disabled={isProcessing}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reprocessar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Processing progress */}
        {isProcessing && progress && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="font-medium">{progress.phase}</span>
                </div>
                <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
                <p className="text-sm text-muted-foreground">
                  {progress.current} / {progress.total} registros
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No file selected - instructions */}
        {!arquivoSelecionado && !isProcessing && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <HelpCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Selecione um arquivo para começar</h3>
                  <p className="text-muted-foreground max-w-md mt-1">
                    Escolha um arquivo Linha a Linha importado acima. O sistema irá cruzar os registros
                    com as vendas instaladas e categorizar os resultados automaticamente.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {results && !isProcessing && (
          <>
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" onClick={() => setActiveTab('found')}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{results.found.length}</p>
                      <p className="text-sm text-muted-foreground">Encontrados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" onClick={() => setActiveTab('notFound')}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <XCircle className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{results.notFound.length}</p>
                      <p className="text-sm text-muted-foreground">Não Encontrados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" onClick={() => setActiveTab('ambiguous')}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{results.ambiguous.length}</p>
                      <p className="text-sm text-muted-foreground">Ambíguos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" onClick={() => setActiveTab('already')}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Link2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{results.alreadyConciliated.length}</p>
                      <p className="text-sm text-muted-foreground">Já Conciliados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" onClick={() => setActiveTab('issues')}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{results.invalid.length + results.duplicates.length}</p>
                      <p className="text-sm text-muted-foreground">Inválidos/Dupl.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Conciliation action bar */}
            {results.found.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {results.found.length} venda(s) pronta(s) para conciliação automática
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Matches confiáveis por protocolo, CPF/CNPJ ou telefone
                      </p>
                    </div>
                    <Button
                      onClick={handleConciliateAll}
                      disabled={isConciliating}
                      size="lg"
                      className="gap-2"
                    >
                      {isConciliating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      Conciliar Todas ({results.found.length})
                    </Button>
                  </div>
                  {conciliationProgress && (
                    <div className="mt-4 space-y-2">
                      <Progress value={(conciliationProgress.current / conciliationProgress.total) * 100} />
                      <p className="text-sm text-muted-foreground">
                        {conciliationProgress.current} / {conciliationProgress.total}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por protocolo, CPF, cliente..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setDisplayLimit(100); }}
                className="pl-9"
              />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setDisplayLimit(100); }}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="found">Encontrados ({results.found.length})</TabsTrigger>
                <TabsTrigger value="notFound">Não Encontrados ({results.notFound.length})</TabsTrigger>
                <TabsTrigger value="ambiguous">Ambíguos ({results.ambiguous.length})</TabsTrigger>
                <TabsTrigger value="already">Já Conciliados ({results.alreadyConciliated.length})</TabsTrigger>
                <TabsTrigger value="issues">Problemas ({results.invalid.length + results.duplicates.length})</TabsTrigger>
              </TabsList>

              {/* Found tab */}
              <TabsContent value="found">
                <Card>
                  <CardContent className="pt-6">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Protocolo Arquivo</TableHead>
                            <TableHead>Protocolo Venda</TableHead>
                            <TableHead>CPF/CNPJ</TableHead>
                            <TableHead>Cliente (Arquivo)</TableHead>
                            <TableHead>Cliente (Venda)</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Tipo Match</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Valor Arquivo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredFound.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                Nenhum registro encontrado
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredFound.slice(0, displayLimit).map((m, idx) => (
                              <TableRow key={`found-${idx}`}>
                                <TableCell className="font-mono text-sm">{m.linha.protocolo_operadora || '-'}</TableCell>
                                <TableCell className="font-mono text-sm">{m.venda.protocolo_interno || '-'}</TableCell>
                                <TableCell className="font-mono text-sm">{m.linha.cpf_cnpj || '-'}</TableCell>
                                <TableCell>{m.linha.cliente_nome || '-'}</TableCell>
                                <TableCell className="font-medium">{m.venda.cliente_nome}</TableCell>
                                <TableCell>{(m.venda as any).vendedor?.nome || '-'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{tipoMatchLabels[m.tipoMatch]}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={m.score >= 90 ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}>
                                    {m.score}%
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatCurrency(m.linha.valor)}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {filteredFound.length > displayLimit && (
                      <div className="flex justify-center pt-4">
                        <Button variant="outline" onClick={() => setDisplayLimit(p => p + 100)}>
                          Mostrar mais ({displayLimit} de {filteredFound.length})
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Not Found tab */}
              <TabsContent value="notFound">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        Registros do arquivo sem correspondência ({filteredNotFound.length})
                      </CardTitle>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={copyNotFoundToClipboard} className="gap-1">
                          <Copy className="h-3 w-3" /> Copiar
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportNotFound} className="gap-1">
                          <Download className="h-3 w-3" /> Exportar CSV
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Linha</TableHead>
                            <TableHead>Protocolo (Arquivo)</TableHead>
                            <TableHead>CPF/CNPJ</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Chaves Usadas</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredNotFound.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                {results.notFound.length === 0 ? 'Todos os registros encontraram correspondência!' : 'Nenhum resultado para a busca'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredNotFound.slice(0, displayLimit).map((nf, idx) => (
                              <TableRow key={`nf-${idx}`}>
                                <TableCell className="text-muted-foreground">#{nf.rowIndex}</TableCell>
                                <TableCell className="font-mono text-sm font-medium">
                                  {nf.linha.protocolo_operadora || <span className="text-muted-foreground italic">sem protocolo</span>}
                                </TableCell>
                                <TableCell className="font-mono text-sm">{nf.linha.cpf_cnpj || '-'}</TableCell>
                                <TableCell className="font-mono text-sm">{nf.linha.telefone || '-'}</TableCell>
                                <TableCell>{nf.linha.cliente_nome || '-'}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    {nf.matchKeysUsed.map(k => (
                                      <Badge key={k} variant="outline" className="text-xs">{k}</Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>{formatCurrency(nf.linha.valor)}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedNotFound(nf);
                                      setSelectedVendaId('');
                                      setObservacao('');
                                      setLinhaSearch('');
                                      setIsMatchOpen(true);
                                    }}
                                  >
                                    <Link2 className="h-4 w-4 mr-1" /> Vincular
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {filteredNotFound.length > displayLimit && (
                      <div className="flex justify-center pt-4">
                        <Button variant="outline" onClick={() => setDisplayLimit(p => p + 100)}>
                          Mostrar mais ({displayLimit} de {filteredNotFound.length})
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Ambiguous tab */}
              <TabsContent value="ambiguous">
                <Card>
                  <CardContent className="pt-6">
                    {results.ambiguous.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">Nenhum registro ambíguo</p>
                    ) : (
                      <div className="space-y-4">
                        {results.ambiguous.slice(0, displayLimit).map((amb, idx) => (
                          <Card key={`amb-${idx}`} className="border-warning/30">
                            <CardContent className="pt-4">
                              <p className="font-medium mb-2">
                                Arquivo: {amb.linha.protocolo_operadora || amb.linha.cpf_cnpj || 'sem chave'} — {amb.linha.cliente_nome || ''}
                              </p>
                              <p className="text-sm text-muted-foreground mb-2">
                                {amb.candidates.length} candidatos encontrados:
                              </p>
                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Protocolo</TableHead>
                                      <TableHead>Cliente</TableHead>
                                      <TableHead>CPF</TableHead>
                                      <TableHead>Tipo Match</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {amb.candidates.map((c, ci) => (
                                      <TableRow key={ci}>
                                        <TableCell className="font-mono text-sm">{c.venda.protocolo_interno || '-'}</TableCell>
                                        <TableCell>{c.venda.cliente_nome}</TableCell>
                                        <TableCell className="font-mono text-sm">{c.venda.cpf_cnpj || '-'}</TableCell>
                                        <TableCell><Badge variant="outline">{tipoMatchLabels[c.tipoMatch]}</Badge></TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Already conciliated tab */}
              <TabsContent value="already">
                <Card>
                  <CardContent className="pt-6">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Protocolo Arquivo</TableHead>
                            <TableHead>Protocolo Venda</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Tipo Match</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.alreadyConciliated.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                Nenhum registro já conciliado
                              </TableCell>
                            </TableRow>
                          ) : (
                            results.alreadyConciliated.slice(0, displayLimit).map((m, idx) => (
                              <TableRow key={`alr-${idx}`}>
                                <TableCell className="font-mono text-sm">{m.linha.protocolo_operadora || '-'}</TableCell>
                                <TableCell className="font-mono text-sm">{m.venda.protocolo_interno || '-'}</TableCell>
                                <TableCell>{m.venda.cliente_nome}</TableCell>
                                <TableCell>{(m.venda as any).vendedor?.nome || '-'}</TableCell>
                                <TableCell><Badge variant="outline">{tipoMatchLabels[m.tipoMatch]}</Badge></TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {results.alreadyConciliated.length > displayLimit && (
                      <div className="flex justify-center pt-4">
                        <Button variant="outline" onClick={() => setDisplayLimit(p => p + 100)}>
                          Mostrar mais ({displayLimit} de {results.alreadyConciliated.length})
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Issues tab */}
              <TabsContent value="issues">
                <Card>
                  <CardContent className="pt-6">
                    {results.invalid.length > 0 && (
                      <div className="mb-6">
                        <h4 className="font-medium mb-2">Registros Inválidos ({results.invalid.length})</h4>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">Linha</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Motivo</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {results.invalid.slice(0, 50).map((inv, idx) => (
                                <TableRow key={`inv-${idx}`}>
                                  <TableCell>#{inv.rowIndex}</TableCell>
                                  <TableCell>{inv.linha.cliente_nome || '-'}</TableCell>
                                  <TableCell className="text-destructive">{inv.reason}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                    {results.duplicates.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Duplicados no Arquivo ({results.duplicates.length})</h4>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">Linha</TableHead>
                                <TableHead>Protocolo</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Detalhe</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {results.duplicates.slice(0, 50).map((dup, idx) => (
                                <TableRow key={`dup-${idx}`}>
                                  <TableCell>#{dup.rowIndex}</TableCell>
                                  <TableCell className="font-mono text-sm">{dup.linha.protocolo_operadora || '-'}</TableCell>
                                  <TableCell>{dup.linha.cliente_nome || '-'}</TableCell>
                                  <TableCell className="text-warning">{dup.duplicateKey}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                    {results.invalid.length === 0 && results.duplicates.length === 0 && (
                      <p className="text-center py-8 text-muted-foreground">Nenhum problema encontrado</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Manual match dialog */}
        <Dialog open={isMatchOpen} onOpenChange={setIsMatchOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Vincular Manualmente</DialogTitle>
              <DialogDescription>
                Registro do arquivo: {selectedNotFound?.linha.protocolo_operadora || selectedNotFound?.linha.cpf_cnpj || 'sem chave'}
                {selectedNotFound?.linha.cliente_nome && ` — ${selectedNotFound.linha.cliente_nome}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>ID da Venda Interna</Label>
                <Input
                  placeholder="Cole o ID da venda interna para vincular..."
                  value={selectedVendaId}
                  onChange={(e) => setSelectedVendaId(e.target.value)}
                />
              </div>
              <div>
                <Label>Observação</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Motivo da vinculação manual..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsMatchOpen(false)}>Cancelar</Button>
              <Button onClick={handleManualMatch} disabled={isSaving || !selectedVendaId}>
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
