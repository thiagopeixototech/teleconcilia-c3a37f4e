import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { normalizeCpfCnpj, normalizeCpfCnpjForMatch } from '@/lib/normalizeCpfCnpj';
import { parseCSV as parseCSVLib } from '@/lib/parseCSV';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, Plus, Trash2, Upload, Database, FileSpreadsheet,
  CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface Operadora { id: string; nome: string; }
interface Empresa { id: string; nome: string; }
interface Usuario { id: string; nome: string; email: string; cpf: string | null; }
interface MapeamentoVendas {
  id: string; nome: string;
  mapeamento: Record<string, string>;
  config: {
    vendedor_mode?: 'column_cpf' | 'column_email' | 'fixed';
    vendedor_column?: string; fixed_vendedor_id?: string;
    operadora_mode?: 'fixed' | 'column';
    operadora_id?: string; operadora_column?: string;
    empresa_id?: string;
  };
}

interface ErrorRow {
  rowIndex: number;
  row: Record<string, string>;
  reason: 'vendedor' | 'operadora' | 'data';
  idMake: string;
  // For correction
  correctedVendedorId?: string;
  correctedOperadoraId?: string;
  correctedDate?: string;
}

interface FonteConfig {
  id: string;
  tipo: 'sistema' | 'arquivo';
  nome: string;
  // Sistema
  filtroDataInicio?: string;
  filtroDataFim?: string;
  // Arquivo
  arquivo?: File | null;
  csvHeaders?: string[];
  csvRows?: Record<string, string>[];
  mapeamentoId?: string;
  // Comum - multi-select
  vendedorMode: 'column_cpf' | 'column_email' | 'fixed';
  vendedorColumn: string;
  fixedVendedorId: string;
  operadoraMode: 'fixed' | 'column';
  operadoraId: string;
  operadoraColumn: string;
  // Multi-select for sistema
  selectedEmpresaIds: string[];
  selectedOperadoraIds: string[];
  selectedVendedorIds: string[];
  allEmpresas: boolean;
  allOperadoras: boolean;
  allVendedores: boolean;
  // Legacy single for arquivo
  empresaId: string;
  // State
  imported: boolean;
  importResult?: { total: number; success: number; errors: number };
  errorRows?: ErrorRow[];
  showErrors?: boolean;
}

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
  { key: 'observacoes', label: 'Observações', required: false },
];

interface Props {
  comissionamentoId: string;
}

const ERROR_ROWS_PREVIEW_LIMIT = 200;

export function StepVendasInternas({ comissionamentoId }: Props) {
  const { user } = useAuth();
  const [fontes, setFontes] = useState<FonteConfig[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [mapeamentos, setMapeamentos] = useState<MapeamentoVendas[]>([]);
  const [existingFontes, setExistingFontes] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{ phase: string; current: number; total: number } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const load = async () => {
      const [opRes, empRes, usrRes, mapRes, fontesRes] = await Promise.all([
        supabase.from('operadoras').select('id, nome').eq('ativa', true).order('nome'),
        supabase.from('empresas').select('id, nome').eq('ativa', true).order('nome'),
        supabase.from('usuarios').select('id, nome, email, cpf').eq('ativo', true).order('nome'),
        supabase.from('mapeamento_vendas').select('*').order('nome'),
        supabase.from('comissionamento_fontes').select('*').eq('comissionamento_id', comissionamentoId),
      ]);
      if (opRes.data) setOperadoras(opRes.data);
      if (empRes.data) setEmpresas(empRes.data);
      if (usrRes.data) setUsuarios(usrRes.data as Usuario[]);
      if (mapRes.data) setMapeamentos(mapRes.data as unknown as MapeamentoVendas[]);
      if (fontesRes.data) setExistingFontes(fontesRes.data);
    };
    load();
  }, [comissionamentoId]);

  const addFonte = (tipo: 'sistema' | 'arquivo') => {
    const id = crypto.randomUUID();
    setFontes(prev => [...prev, {
      id, tipo,
      nome: tipo === 'sistema' ? 'Vendas do Sistema' : `Arquivo ${prev.filter(f => f.tipo === 'arquivo').length + 1}`,
      vendedorMode: 'column_cpf', vendedorColumn: '', fixedVendedorId: '',
      operadoraMode: 'fixed', operadoraId: '', operadoraColumn: '',
      empresaId: '',
      selectedEmpresaIds: [],
      selectedOperadoraIds: [],
      selectedVendedorIds: [],
      allEmpresas: true,
      allOperadoras: true,
      allVendedores: true,
      imported: false,
    }]);
  };

  const removeFonte = (id: string) => {
    setFontes(prev => prev.filter(f => f.id !== id));
  };

  const updateFonte = (id: string, updates: Partial<FonteConfig>) => {
    setFontes(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const parseCSV = parseCSVLib;

  const handleFileSelect = async (fonteId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const content = await f.text();
      const { headers, rows } = parseCSV(content);

      if (headers.length === 0) {
        toast.error('Arquivo vazio ou formato inválido');
        return;
      }

      // Sanitiza cabeçalhos para evitar crash no Select (valor vazio/duplicado/BOM)
      const normalizedHeaders = headers.map((h) => h.replace(/^\uFEFF/, '').trim());
      const selectedColumns: Array<{ original: string; normalized: string }> = [];
      const seen = new Set<string>();

      normalizedHeaders.forEach((normalized, index) => {
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        selectedColumns.push({ original: headers[index], normalized });
      });

      if (selectedColumns.length === 0) {
        toast.error('O CSV não possui colunas válidas no cabeçalho.');
        return;
      }

      const sanitizedHeaders = selectedColumns.map((c) => c.normalized);
      const sanitizedRows = rows.map((row) => {
        const next: Record<string, string> = {};
        selectedColumns.forEach(({ original, normalized }) => {
          next[normalized] = row[original] ?? '';
        });
        return next;
      });

      updateFonte(fonteId, {
        arquivo: f,
        csvHeaders: sanitizedHeaders,
        csvRows: sanitizedRows,
        nome: f.name,
      });

      toast.success(`${sanitizedRows.length} linhas encontradas`);
    } catch (err: any) {
      console.error('Erro ao ler CSV:', err);
      toast.error('Erro ao processar o arquivo CSV: ' + (err.message || 'formato inválido'));
    }
  };

  const loadMapeamento = (fonteId: string, mapId: string) => {
    updateFonte(fonteId, { mapeamentoId: mapId });
  };

  const parseDate = (v: string): string | null => {
    if (!v) return null;
    const dateOnly = v.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '').trim();
    const expandYear = (y: string) => {
      if (y.length === 4) return y;
      const num = parseInt(y, 10);
      return num >= 0 && num <= 49 ? `20${y.padStart(2, '0')}` : `19${y.padStart(2, '0')}`;
    };
    const isoMatch = dateOnly.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    const slashMatch = dateOnly.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (slashMatch) {
      const [, p1, p2, p3] = slashMatch;
      const year = expandYear(p3);
      const n1 = parseInt(p1, 10);
      if (n1 > 12) return `${year}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      return `${year}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    }
    return null;
  };

  // normalizeCpfCnpj imported from lib

  // Recursive fetch to get ALL records beyond 1000 limit
  const fetchAllRecords = async (query: any): Promise<any[]> => {
    const allData: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await query.range(offset, offset + batchSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }
    return allData;
  };

  const processarFonte = async (fonte: FonteConfig) => {
    setIsProcessing(true);
    setProcessingProgress(null);
    try {
      if (fonte.tipo === 'sistema') {
        await processarFonteSistema(fonte);
      } else {
        await processarFonteArquivo(fonte);
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const processarFonteSistema = async (fonte: FonteConfig) => {
    // Fetch ALL vendas from the system with filters - using recursive fetch
    let allVendas: any[] = [];
    
    // Build base filters
    const buildQuery = (offset: number, limit: number) => {
      let query = supabase.from('vendas_internas').select('id, valor').range(offset, offset + limit - 1);
      if (fonte.filtroDataInicio) query = query.gte('data_venda', fonte.filtroDataInicio);
      if (fonte.filtroDataFim) query = query.lte('data_venda', fonte.filtroDataFim);
      
      // Multi-select empresa filter
      if (!fonte.allEmpresas && fonte.selectedEmpresaIds.length > 0) {
        query = query.in('empresa_id', fonte.selectedEmpresaIds);
      }
      
      // Multi-select operadora filter
      if (!fonte.allOperadoras && fonte.selectedOperadoraIds.length > 0) {
        query = query.in('operadora_id', fonte.selectedOperadoraIds);
      }
      
      // Multi-select vendedor filter
      if (!fonte.allVendedores && fonte.selectedVendedorIds.length > 0) {
        query = query.in('usuario_id', fonte.selectedVendedorIds);
      }
      
      return query;
    };

    // Fetch all records in batches
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const query = buildQuery(offset, batchSize);
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      allVendas.push(...data);
      setProcessingProgress({ phase: 'Carregando vendas do sistema...', current: allVendas.length, total: allVendas.length });
      if (data.length < batchSize) break;
      offset += batchSize;
      await new Promise(r => setTimeout(r, 10));
    }

    if (allVendas.length === 0) {
      toast.info('Nenhuma venda encontrada com os filtros selecionados');
      return;
    }

    // Save fonte record
    const { data: fonteData, error: fonteErr } = await supabase
      .from('comissionamento_fontes')
      .insert({
        comissionamento_id: comissionamentoId,
        tipo: 'sistema' as any,
        nome: fonte.nome,
        filtros: {
          data_inicio: fonte.filtroDataInicio,
          data_fim: fonte.filtroDataFim,
          empresa_ids: fonte.allEmpresas ? 'all' : fonte.selectedEmpresaIds,
          operadora_ids: fonte.allOperadoras ? 'all' : fonte.selectedOperadoraIds,
          vendedor_ids: fonte.allVendedores ? 'all' : fonte.selectedVendedorIds,
        },
      })
      .select('id')
      .single();
    if (fonteErr) throw fonteErr;

    // Link vendas to comissionamento
    const rows = allVendas.map(v => ({
      comissionamento_id: comissionamentoId,
      venda_interna_id: v.id,
      fonte_id: fonteData.id,
      receita_interna: v.valor,
    }));

    setProcessingProgress({ phase: 'Vinculando vendas...', current: 0, total: rows.length });
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error: insertErr } = await supabase.from('comissionamento_vendas').insert(batch);
      if (insertErr) throw insertErr;
      setProcessingProgress({ phase: 'Vinculando vendas...', current: Math.min(i + 500, rows.length), total: rows.length });
      await new Promise(r => setTimeout(r, 30));
    }

    updateFonte(fonte.id, {
      imported: true,
      importResult: { total: allVendas.length, success: allVendas.length, errors: 0 },
    });
    toast.success(`${allVendas.length} vendas vinculadas ao comissionamento`);
  };

  const processarFonteArquivo = async (fonte: FonteConfig) => {
    if (!fonte.csvRows || !fonte.mapeamentoId) {
      toast.error('Selecione um arquivo e um mapeamento');
      return;
    }

    const mapeamento = mapeamentos.find(m => m.id === fonte.mapeamentoId);
    if (!mapeamento) { toast.error('Mapeamento não encontrado'); return; }
    const map = mapeamento.mapeamento;

    const vMode = fonte.vendedorMode || mapeamento.config?.vendedor_mode || 'column_cpf';
    const oMode = fonte.operadoraMode || mapeamento.config?.operadora_mode || 'fixed';
    const vCol = fonte.vendedorColumn || mapeamento.config?.vendedor_column || '';
    const fixedVId = fonte.fixedVendedorId || mapeamento.config?.fixed_vendedor_id || '';
    const fixedOId = fonte.operadoraId || mapeamento.config?.operadora_id || '';
    const oCol = fonte.operadoraColumn || mapeamento.config?.operadora_column || '';

    const usuariosByCpf = new Map<string, string>();
    const usuariosByEmail = new Map<string, string>();
    for (const u of usuarios) {
      if (u.cpf) {
        const normalizedCpf = normalizeCpfCnpjForMatch(u.cpf);
        if (normalizedCpf) usuariosByCpf.set(normalizedCpf, u.id);
      }
      if (u.email) usuariosByEmail.set(u.email.trim().toLowerCase(), u.id);
    }

    const operadorasByNome = new Map<string, string>();
    for (const o of operadoras) {
      operadorasByNome.set(o.nome.trim().toLowerCase(), o.id);
    }

    const { data: fonteData, error: fonteErr } = await supabase
      .from('comissionamento_fontes')
      .insert({
        comissionamento_id: comissionamentoId,
        tipo: 'arquivo' as any,
        nome: fonte.nome,
        mapeamento_id: fonte.mapeamentoId,
        arquivo_nome: fonte.arquivo?.name || null,
        vendedor_fixo_id: vMode === 'fixed' ? fixedVId : null,
        operadora_fixa_id: oMode === 'fixed' ? fixedOId : null,
        empresa_id: fonte.empresaId || null,
      })
      .select('id')
      .single();
    if (fonteErr) throw fonteErr;

    let successCount = 0;
    let errorCount = 0;
    const vendaRows: any[] = [];
    const errorRows: ErrorRow[] = [];

    const deduped = new Map<string, Record<string, string>>();
    let rowIdx = 0;
    let withIdCount = 0;
    let missingIdCount = 0;
    const rowIndexMap = new Map<string, number>();
    for (const row of fonte.csvRows!) {
      const idMake = row[map.identificador_make]?.trim();
      if (idMake) {
        withIdCount++;
        deduped.set(idMake, row);
        rowIndexMap.set(idMake, rowIdx);
      } else {
        missingIdCount++;
      }
      rowIdx++;
    }
    const duplicateIdCount = Math.max(0, withIdCount - deduped.size);

    setProcessingProgress({ phase: 'Validando arquivo...', current: 0, total: deduped.size });
    let validatedCount = 0;

    for (const [idMake, row] of deduped) {
      const dataVenda = parseDate(row[map.data_venda]?.trim() || '');
      if (!dataVenda) {
        errorCount++;
        errorRows.push({ rowIndex: rowIndexMap.get(idMake) || 0, row, reason: 'data', idMake });
      } else {
        let vendedorId: string | null = null;
        if (vMode === 'fixed') {
          vendedorId = fixedVId;
        } else {
          const val = row[vCol]?.trim();
          if (val) {
            vendedorId = vMode === 'column_cpf'
              ? usuariosByCpf.get(normalizeCpfCnpjForMatch(val)) || null
              : usuariosByEmail.get(val.toLowerCase()) || null;
          }
        }

        if (!vendedorId) {
          errorCount++;
          errorRows.push({ rowIndex: rowIndexMap.get(idMake) || 0, row, reason: 'vendedor', idMake });
        } else {
          let operadoraId: string | null = null;
          if (oMode === 'fixed') {
            operadoraId = fixedOId;
          } else {
            const val = row[oCol]?.trim()?.toLowerCase();
            operadoraId = val ? operadorasByNome.get(val) || null : null;
          }

          if (!operadoraId) {
            errorCount++;
            errorRows.push({ rowIndex: rowIndexMap.get(idMake) || 0, row, reason: 'operadora', idMake });
          } else {
            const cpf = map.cpf_cnpj ? normalizeCpfCnpj(row[map.cpf_cnpj] || '') : null;
            const valorStr = map.valor ? row[map.valor]?.replace(',', '.').replace(/[^\d.-]/g, '') : null;
            const valor = valorStr ? parseFloat(valorStr) : null;
            const dataInstalacao = map.data_instalacao ? parseDate(row[map.data_instalacao]?.trim() || '') : null;

            vendaRows.push({
              identificador_make: idMake,
              status_make: row[map.status_make]?.trim() || null,
              data_venda: dataVenda,
              data_instalacao: dataInstalacao,
              cliente_nome: row[map.cliente_nome]?.trim() || 'N/A',
              cpf_cnpj: cpf || null,
              telefone: map.telefone ? row[map.telefone]?.trim() : null,
              protocolo_interno: map.protocolo_interno ? row[map.protocolo_interno]?.trim() : null,
              valor,
              plano: map.plano ? row[map.plano]?.trim() : null,
              observacoes: map.observacoes ? row[map.observacoes]?.trim() : null,
              usuario_id: vendedorId,
              operadora_id: operadoraId,
              empresa_id: fonte.empresaId || null,
            });
            successCount++;
          }
        }
      }

      validatedCount++;
      if (validatedCount % 200 === 0 || validatedCount === deduped.size) {
        setProcessingProgress({ phase: 'Validando arquivo...', current: validatedCount, total: deduped.size });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Check existing vendas
    const idsToCheck = vendaRows.map(r => r.identificador_make).filter(Boolean);
    setProcessingProgress({ phase: 'Verificando duplicatas...', current: 0, total: idsToCheck.length });
    const existingIds = new Map<string, string>();
    for (let i = 0; i < idsToCheck.length; i += 200) {
      const batch = idsToCheck.slice(i, i + 200);
      const { data } = await supabase
        .from('vendas_internas')
        .select('id, identificador_make')
        .in('identificador_make', batch);
      data?.forEach(d => { if (d.identificador_make) existingIds.set(d.identificador_make, d.id); });
      setProcessingProgress({ phase: 'Verificando duplicatas...', current: Math.min(i + 200, idsToCheck.length), total: idsToCheck.length });
      await new Promise(r => setTimeout(r, 10));
    }

    const newVendas = vendaRows.filter(r => !existingIds.has(r.identificador_make));
    const existingVendas = vendaRows.filter(r => existingIds.has(r.identificador_make));

    setProcessingProgress({ phase: 'Inserindo vendas...', current: 0, total: newVendas.length });
    const INSERT_BATCH = 500;
    for (let i = 0; i < newVendas.length; i += INSERT_BATCH) {
      const batch = newVendas.slice(i, i + INSERT_BATCH);
      const { error: batchErr } = await supabase.from('vendas_internas').insert(batch);
      if (batchErr) {
        // Fallback: smaller sub-batches of 50
        for (let j = 0; j < batch.length; j += 50) {
          const sub = batch.slice(j, j + 50);
          await supabase.from('vendas_internas').insert(sub).catch(() => {
            // Last resort: one by one
            return Promise.all(sub.map(row => supabase.from('vendas_internas').insert(row)));
          });
          setProcessingProgress({ phase: 'Inserindo vendas (retry)...', current: Math.min(i + j + 50, newVendas.length), total: newVendas.length });
          await new Promise(r => setTimeout(r, 5));
        }
      }
      setProcessingProgress({ phase: 'Inserindo vendas...', current: Math.min(i + INSERT_BATCH, newVendas.length), total: newVendas.length });
      await new Promise(r => setTimeout(r, 10));
    }

    // Build valor lookup map (O(n) instead of O(n²))
    const valorMap = new Map<string, number | null>();
    for (const r of vendaRows) {
      valorMap.set(r.identificador_make, r.valor);
    }

    const allIdMakes = vendaRows.map(r => r.identificador_make);
    const vendaIdMap = new Map<string, string>();

    setProcessingProgress({ phase: 'Vinculando ao comissionamento...', current: 0, total: allIdMakes.length });
    for (let i = 0; i < allIdMakes.length; i += 200) {
      const batch = allIdMakes.slice(i, i + 200);
      const { data } = await supabase
        .from('vendas_internas')
        .select('id, identificador_make, valor')
        .in('identificador_make', batch);
      data?.forEach(d => {
        if (d.identificador_make) vendaIdMap.set(d.identificador_make, d.id);
      });
      setProcessingProgress({ phase: 'Vinculando ao comissionamento...', current: Math.min(i + 200, allIdMakes.length), total: allIdMakes.length });
      await new Promise(r => setTimeout(r, 10));
    }

    const comRows = allIdMakes
      .filter(idm => vendaIdMap.has(idm))
      .map(idm => ({
        comissionamento_id: comissionamentoId,
        venda_interna_id: vendaIdMap.get(idm)!,
        fonte_id: fonteData.id,
        receita_interna: valorMap.get(idm) || null,
      }));

    setProcessingProgress({ phase: 'Inserindo vínculos no comissionamento...', current: 0, total: comRows.length });
    for (let i = 0; i < comRows.length; i += 200) {
      const batch = comRows.slice(i, i + 200);
      const { error: linkErr } = await supabase.from('comissionamento_vendas').insert(batch);
      if (linkErr) throw linkErr;
      setProcessingProgress({ phase: 'Inserindo vínculos no comissionamento...', current: Math.min(i + 200, comRows.length), total: comRows.length });
      await new Promise(r => setTimeout(r, 20));
    }

    // Register in audit_log so it appears in import history
    try {
      const insertedVendaIds = Array.from(vendaIdMap.values());
      await supabase.from('audit_log' as any).insert({
        tabela: 'vendas_internas',
        registro_id: '00000000-0000-0000-0000-000000000000',
        acao: 'IMPORTACAO_MASSA',
        usuario_id: user?.id || null,
        dados_novos: {
          arquivo: fonte.arquivo?.name || fonte.nome,
          total: deduped.size,
          novos: newVendas.length,
          atualizados: existingVendas.length,
          erros: errorCount,
          duplicados_id_make: duplicateIdCount,
          sem_identificador_make: missingIdCount,
          origem: 'comissionamento',
          comissionamento_id: comissionamentoId,
          venda_ids: insertedVendaIds,
        },
      });
    } catch {}

    setProcessingProgress(null);
    updateFonte(fonte.id, {
      imported: true,
      importResult: { total: deduped.size, success: successCount, errors: errorCount },
      errorRows: errorRows.length > 0 ? errorRows : undefined,
      showErrors: false,
    });
    toast.success(`${successCount} vendas válidas processadas (${newVendas.length} novas, ${existingVendas.length} existentes), ${errorCount} erros de validação, ${duplicateIdCount} IDs duplicados e ${missingIdCount} linhas sem identificador.`);
  };

  // Check if fonte is valid for processing (P1 fix)
  const isFonteValid = (fonte: FonteConfig): boolean => {
    if (fonte.tipo === 'arquivo') {
      return !!(fonte.csvRows && fonte.csvRows.length > 0 && fonte.mapeamentoId);
    }
    return true; // sistema fontes are always processable (filters optional)
  };

  // Multi-select toggle helpers
  const toggleMultiSelect = (fonteId: string, field: 'selectedEmpresaIds' | 'selectedOperadoraIds' | 'selectedVendedorIds', itemId: string) => {
    setFontes(prev => prev.map(f => {
      if (f.id !== fonteId) return f;
      const current = f[field];
      const next = current.includes(itemId)
        ? current.filter(id => id !== itemId)
        : [...current, itemId];
      return { ...f, [field]: next };
    }));
  };

  const updateErrorRow = (fonteId: string, rowIndex: number, updates: Partial<ErrorRow>) => {
    setFontes(prev => prev.map(f => {
      if (f.id !== fonteId || !f.errorRows) return f;
      return {
        ...f,
        errorRows: f.errorRows.map(er =>
          er.rowIndex === rowIndex ? { ...er, ...updates } : er
        ),
      };
    }));
  };

  const reprocessErrorRows = async (fonte: FonteConfig) => {
    if (!fonte.errorRows || !fonte.mapeamentoId) return;
    setIsProcessing(true);
    try {
      const mapeamento = mapeamentos.find(m => m.id === fonte.mapeamentoId);
      if (!mapeamento) return;
      const map = mapeamento.mapeamento;

      // Find the fonteData id from existing fontes
      const existingFonte = existingFontes.find(ef => ef.nome === fonte.nome && ef.comissionamento_id === comissionamentoId);
      const fonteDbId = existingFonte?.id;

      const correctedRows = fonte.errorRows.filter(er => {
        if (er.reason === 'vendedor' && er.correctedVendedorId) return true;
        if (er.reason === 'operadora' && er.correctedOperadoraId) return true;
        if (er.reason === 'data' && er.correctedDate) return true;
        return false;
      });

      if (correctedRows.length === 0) {
        toast.info('Nenhuma correção para processar. Preencha os campos de correção.');
        setIsProcessing(false);
        return;
      }

      const vendaRows: any[] = [];
      const stillErrorRows: ErrorRow[] = [];
      const oMode = fonte.operadoraMode || mapeamento.config?.operadora_mode || 'fixed';
      const fixedOId = fonte.operadoraId || mapeamento.config?.operadora_id || '';
      const oCol = fonte.operadoraColumn || mapeamento.config?.operadora_column || '';
      const vMode = fonte.vendedorMode || mapeamento.config?.vendedor_mode || 'column_cpf';
      const fixedVId = fonte.fixedVendedorId || mapeamento.config?.fixed_vendedor_id || '';
      const vCol = fonte.vendedorColumn || mapeamento.config?.vendedor_column || '';

      for (const er of fonte.errorRows) {
        const row = er.row;
        const idMake = er.idMake;

        let dataVenda = parseDate(row[map.data_venda]?.trim() || '');
        if (er.reason === 'data' && er.correctedDate) {
          dataVenda = er.correctedDate;
        }
        if (!dataVenda) { stillErrorRows.push(er); continue; }

        let vendedorId: string | null = null;
        if (er.reason === 'vendedor' && er.correctedVendedorId) {
          vendedorId = er.correctedVendedorId;
        } else if (vMode === 'fixed') {
          vendedorId = fixedVId;
        } else {
          const val = row[vCol]?.trim();
          if (val) {
            const normalized = normalizeCpfCnpjForMatch(val);
            const found = vMode === 'column_cpf'
              ? usuarios.find(u => u.cpf && normalizeCpfCnpjForMatch(u.cpf) === normalized)
              : usuarios.find(u => u.email.toLowerCase() === val.toLowerCase());
            vendedorId = found?.id || null;
          }
        }
        if (!vendedorId) { stillErrorRows.push(er); continue; }

        let operadoraId: string | null = null;
        if (er.reason === 'operadora' && er.correctedOperadoraId) {
          operadoraId = er.correctedOperadoraId;
        } else if (oMode === 'fixed') {
          operadoraId = fixedOId;
        } else {
          const val = row[oCol]?.trim()?.toLowerCase();
          const found = operadoras.find(o => o.nome.toLowerCase() === val);
          operadoraId = found?.id || null;
        }
        if (!operadoraId) { stillErrorRows.push(er); continue; }

        const cpf = map.cpf_cnpj ? normalizeCpfCnpj(row[map.cpf_cnpj] || '') : null;
        const valorStr = map.valor ? row[map.valor]?.replace(',', '.').replace(/[^\d.-]/g, '') : null;
        const valor = valorStr ? parseFloat(valorStr) : null;
        const dataInstalacao = map.data_instalacao ? parseDate(row[map.data_instalacao]?.trim() || '') : null;

        vendaRows.push({
          identificador_make: idMake,
          status_make: row[map.status_make]?.trim() || null,
          data_venda: dataVenda,
          data_instalacao: dataInstalacao,
          cliente_nome: row[map.cliente_nome]?.trim() || 'N/A',
          cpf_cnpj: cpf || null,
          telefone: map.telefone ? row[map.telefone]?.trim() : null,
          protocolo_interno: map.protocolo_interno ? row[map.protocolo_interno]?.trim() : null,
          valor,
          plano: map.plano ? row[map.plano]?.trim() : null,
          observacoes: map.observacoes ? row[map.observacoes]?.trim() : null,
          usuario_id: vendedorId,
          operadora_id: operadoraId,
          empresa_id: fonte.empresaId || null,
        });
      }

      if (vendaRows.length === 0) {
        toast.info('Nenhuma linha corrigida com sucesso');
        setIsProcessing(false);
        return;
      }

      // Check existing
      const existingIds = new Map<string, string>();
      const idsToCheck = vendaRows.map(r => r.identificador_make);
      for (let i = 0; i < idsToCheck.length; i += 200) {
        const batch = idsToCheck.slice(i, i + 200);
        const { data } = await supabase.from('vendas_internas').select('id, identificador_make').in('identificador_make', batch);
        data?.forEach(d => { if (d.identificador_make) existingIds.set(d.identificador_make, d.id); });
      }

      const newVendas = vendaRows.filter(r => !existingIds.has(r.identificador_make));
      for (let i = 0; i < newVendas.length; i += 500) {
        await supabase.from('vendas_internas').insert(newVendas.slice(i, i + 500));
      }

      // Get IDs for comissionamento_vendas
      const allIdMakes = vendaRows.map(r => r.identificador_make);
      const vendaIdMap = new Map<string, string>();
      for (let i = 0; i < allIdMakes.length; i += 200) {
        const batch = allIdMakes.slice(i, i + 200);
        const { data } = await supabase.from('vendas_internas').select('id, identificador_make, valor').in('identificador_make', batch);
        data?.forEach(d => { if (d.identificador_make) vendaIdMap.set(d.identificador_make, d.id); });
      }

      if (fonteDbId) {
        const comRows = allIdMakes.filter(idm => vendaIdMap.has(idm)).map(idm => ({
          comissionamento_id: comissionamentoId,
          venda_interna_id: vendaIdMap.get(idm)!,
          fonte_id: fonteDbId,
          receita_interna: vendaRows.find(r => r.identificador_make === idm)?.valor || null,
        }));
        for (let i = 0; i < comRows.length; i += 500) {
          await supabase.from('comissionamento_vendas').insert(comRows.slice(i, i + 500));
        }
      }

      const prevResult = fonte.importResult || { total: 0, success: 0, errors: 0 };
      updateFonte(fonte.id, {
        errorRows: stillErrorRows.length > 0 ? stillErrorRows : undefined,
        showErrors: stillErrorRows.length > 0,
        importResult: {
          total: prevResult.total,
          success: prevResult.success + vendaRows.length,
          errors: stillErrorRows.length,
        },
      });
      toast.success(`${vendaRows.length} linhas corrigidas com sucesso!`);

      // Reload existing fontes
      const { data: fontesData } = await supabase.from('comissionamento_fontes').select('*').eq('comissionamento_id', comissionamentoId);
      if (fontesData) setExistingFontes(fontesData);
    } catch (err: any) {
      toast.error('Erro ao reprocessar: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getReasonLabel = (reason: ErrorRow['reason']) => {
    switch (reason) {
      case 'vendedor': return 'Vendedor não encontrado';
      case 'operadora': return 'Operadora não encontrada';
      case 'data': return 'Data inválida';
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing fontes */}
      {existingFontes.length > 0 && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Este comissionamento já possui {existingFontes.length} fonte(s) cadastrada(s).
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => addFonte('sistema')} className="gap-1.5">
          <Database className="h-4 w-4" />
          Usar vendas do sistema
        </Button>
        <Button size="sm" variant="outline" onClick={() => addFonte('arquivo')} className="gap-1.5">
          <Upload className="h-4 w-4" />
          Importar por arquivo
        </Button>
      </div>

      {/* Fonte cards */}
      {fontes.map((fonte, idx) => (
        <Card key={fonte.id} className={fonte.imported ? 'border-success/50' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                {fonte.tipo === 'sistema' ? <Database className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                Fonte {idx + 1}: {fonte.nome}
                {fonte.imported && <Badge className="bg-success/20 text-success text-xs">Importado</Badge>}
              </CardTitle>
              {!fonte.imported && (
                <Button variant="ghost" size="icon" onClick={() => removeFonte(fonte.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fonte.imported && fonte.importResult && (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span>Total: <strong>{fonte.importResult.total}</strong></span>
                  <span className="text-success">Sucesso: <strong>{fonte.importResult.success}</strong></span>
                  {fonte.importResult.errors > 0 && (
                    <span
                      className="text-destructive cursor-pointer underline"
                      onClick={() => updateFonte(fonte.id, { showErrors: !fonte.showErrors })}
                    >
                      Erros: <strong>{fonte.importResult.errors}</strong> {fonte.showErrors ? '▲' : '▼'}
                    </span>
                  )}
                </div>

                {fonte.showErrors && fonte.errorRows && fonte.errorRows.length > 0 && (
                  <div className="space-y-3 border rounded-md p-3 bg-destructive/5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-destructive flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        Linhas com erro ({fonte.errorRows.length})
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reprocessErrorRows(fonte)}
                        disabled={isProcessing}
                        className="gap-1.5"
                      >
                        {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Reprocessar Corrigidos
                      </Button>
                    </div>
                    <div className="max-h-64 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-[60px]">Linha</TableHead>
                            <TableHead className="text-xs">ID Make</TableHead>
                            <TableHead className="text-xs">Motivo</TableHead>
                            <TableHead className="text-xs w-[200px]">Correção</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fonte.errorRows.slice(0, ERROR_ROWS_PREVIEW_LIMIT).map((er) => (
                            <TableRow key={er.rowIndex}>
                              <TableCell className="text-xs">{er.rowIndex + 2}</TableCell>
                              <TableCell className="text-xs font-mono">{er.idMake}</TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="destructive" className="text-[10px]">
                                  {getReasonLabel(er.reason)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {er.reason === 'vendedor' && (
                                  <Select
                                    value={er.correctedVendedorId || ''}
                                    onValueChange={v => updateErrorRow(fonte.id, er.rowIndex, { correctedVendedorId: v })}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Selecione vendedor" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {usuarios.map(u => (
                                        <SelectItem key={u.id} value={u.id} className="text-xs">{u.nome}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                                {er.reason === 'operadora' && (
                                  <Select
                                    value={er.correctedOperadoraId || ''}
                                    onValueChange={v => updateErrorRow(fonte.id, er.rowIndex, { correctedOperadoraId: v })}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Selecione operadora" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {operadoras.map(o => (
                                        <SelectItem key={o.id} value={o.id} className="text-xs">{o.nome}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                                {er.reason === 'data' && (
                                  <Input
                                    type="date"
                                    className="h-7 text-xs"
                                    value={er.correctedDate || ''}
                                    onChange={e => updateErrorRow(fonte.id, er.rowIndex, { correctedDate: e.target.value })}
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {fonte.errorRows.length > ERROR_ROWS_PREVIEW_LIMIT && (
                      <p className="text-xs text-muted-foreground">
                        Mostrando {ERROR_ROWS_PREVIEW_LIMIT} de {fonte.errorRows.length} erros para manter a tela responsiva.
                      </p>
                    )}

                    {/* Bulk correction for vendedor/operadora */}
                    {fonte.errorRows.filter(er => er.reason === 'vendedor').length > 1 && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-muted-foreground">Aplicar a todos erros de vendedor:</span>
                        <Select onValueChange={v => {
                          fonte.errorRows?.filter(er => er.reason === 'vendedor').forEach(er => {
                            updateErrorRow(fonte.id, er.rowIndex, { correctedVendedorId: v });
                          });
                        }}>
                          <SelectTrigger className="h-7 text-xs w-48">
                            <SelectValue placeholder="Vendedor em massa" />
                          </SelectTrigger>
                          <SelectContent>
                            {usuarios.map(u => (
                              <SelectItem key={u.id} value={u.id} className="text-xs">{u.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {fonte.errorRows.filter(er => er.reason === 'operadora').length > 1 && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-muted-foreground">Aplicar a todos erros de operadora:</span>
                        <Select onValueChange={v => {
                          fonte.errorRows?.filter(er => er.reason === 'operadora').forEach(er => {
                            updateErrorRow(fonte.id, er.rowIndex, { correctedOperadoraId: v });
                          });
                        }}>
                          <SelectTrigger className="h-7 text-xs w-48">
                            <SelectValue placeholder="Operadora em massa" />
                          </SelectTrigger>
                          <SelectContent>
                            {operadoras.map(o => (
                              <SelectItem key={o.id} value={o.id} className="text-xs">{o.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!fonte.imported && (
              <>
                {/* Nome da fonte */}
                <div className="space-y-1">
                  <Label className="text-xs">Nome da Fonte</Label>
                  <Input
                    value={fonte.nome}
                    onChange={e => updateFonte(fonte.id, { nome: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>

                {fonte.tipo === 'sistema' && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Data Início</Label>
                        <Input type="date" value={fonte.filtroDataInicio || ''} onChange={e => updateFonte(fonte.id, { filtroDataInicio: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Data Fim</Label>
                        <Input type="date" value={fonte.filtroDataFim || ''} onChange={e => updateFonte(fonte.id, { filtroDataFim: e.target.value })} className="h-8 text-sm" />
                      </div>
                    </div>

                    <Separator />

                    {/* Multi-select Empresas */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium">Empresas</Label>
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id={`all-emp-${fonte.id}`}
                            checked={fonte.allEmpresas}
                            onCheckedChange={(checked) => updateFonte(fonte.id, { allEmpresas: !!checked, selectedEmpresaIds: [] })}
                          />
                          <label htmlFor={`all-emp-${fonte.id}`} className="text-xs text-muted-foreground">Todas</label>
                        </div>
                      </div>
                      {!fonte.allEmpresas && (
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border rounded-md p-2">
                          {empresas.map(e => (
                            <label key={e.id} className="flex items-center gap-1 text-xs cursor-pointer">
                              <Checkbox
                                checked={fonte.selectedEmpresaIds.includes(e.id)}
                                onCheckedChange={() => toggleMultiSelect(fonte.id, 'selectedEmpresaIds', e.id)}
                              />
                              {e.nome}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Multi-select Operadoras */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium">Operadoras</Label>
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id={`all-op-${fonte.id}`}
                            checked={fonte.allOperadoras}
                            onCheckedChange={(checked) => updateFonte(fonte.id, { allOperadoras: !!checked, selectedOperadoraIds: [] })}
                          />
                          <label htmlFor={`all-op-${fonte.id}`} className="text-xs text-muted-foreground">Todas</label>
                        </div>
                      </div>
                      {!fonte.allOperadoras && (
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border rounded-md p-2">
                          {operadoras.map(o => (
                            <label key={o.id} className="flex items-center gap-1 text-xs cursor-pointer">
                              <Checkbox
                                checked={fonte.selectedOperadoraIds.includes(o.id)}
                                onCheckedChange={() => toggleMultiSelect(fonte.id, 'selectedOperadoraIds', o.id)}
                              />
                              {o.nome}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Multi-select Vendedores */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium">Vendedores</Label>
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id={`all-vend-${fonte.id}`}
                            checked={fonte.allVendedores}
                            onCheckedChange={(checked) => updateFonte(fonte.id, { allVendedores: !!checked, selectedVendedorIds: [] })}
                          />
                          <label htmlFor={`all-vend-${fonte.id}`} className="text-xs text-muted-foreground">Todos</label>
                        </div>
                      </div>
                      {!fonte.allVendedores && (
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
                          {usuarios.map(u => (
                            <label key={u.id} className="flex items-center gap-1 text-xs cursor-pointer">
                              <Checkbox
                                checked={fonte.selectedVendedorIds.includes(u.id)}
                                onCheckedChange={() => toggleMultiSelect(fonte.id, 'selectedVendedorIds', u.id)}
                              />
                              {u.nome}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {fonte.tipo === 'arquivo' && (
                  <>
                    {/* File upload */}
                    <div className="space-y-2">
                      <Label className="text-xs">Arquivo CSV</Label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => fileInputRefs.current[fonte.id]?.click()}>
                          <Upload className="h-4 w-4 mr-1" /> Selecionar
                        </Button>
                        <input
                          ref={el => { fileInputRefs.current[fonte.id] = el; }}
                          type="file" accept=".csv" className="hidden"
                          onChange={e => handleFileSelect(fonte.id, e)}
                        />
                        {fonte.arquivo && <span className="text-xs text-muted-foreground self-center">{fonte.arquivo.name} ({fonte.csvRows?.length || 0} linhas)</span>}
                      </div>
                    </div>

                    {/* Mapping select */}
                    <div className="space-y-1">
                      <Label className="text-xs">Mapeamento de Colunas</Label>
                      <Select value={fonte.mapeamentoId || ''} onValueChange={v => loadMapeamento(fonte.id, v)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione um modelo" />
                        </SelectTrigger>
                        <SelectContent>
                          {mapeamentos.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Common: empresa, operadora, vendedor for arquivo */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Empresa</Label>
                        <Select value={fonte.empresaId} onValueChange={v => updateFonte(fonte.id, { empresaId: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Empresa" /></SelectTrigger>
                          <SelectContent>
                            {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Operadora</Label>
                        <div className="space-y-1">
                          <Select value={fonte.operadoraMode} onValueChange={(v: 'fixed' | 'column') => updateFonte(fonte.id, { operadoraMode: v })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Fixa</SelectItem>
                              <SelectItem value="column">Coluna do CSV</SelectItem>
                            </SelectContent>
                          </Select>
                          {fonte.operadoraMode === 'fixed' ? (
                            <Select value={fonte.operadoraId} onValueChange={v => updateFonte(fonte.id, { operadoraId: v })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                {operadoras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select value={fonte.operadoraColumn} onValueChange={v => updateFonte(fonte.id, { operadoraColumn: v })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Coluna" /></SelectTrigger>
                              <SelectContent>
                                {(fonte.csvHeaders || []).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Vendedor</Label>
                        <div className="space-y-1">
                          <Select value={fonte.vendedorMode} onValueChange={(v: any) => updateFonte(fonte.id, { vendedorMode: v })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Fixo</SelectItem>
                              <SelectItem value="column_cpf">Coluna CPF</SelectItem>
                              <SelectItem value="column_email">Coluna E-mail</SelectItem>
                            </SelectContent>
                          </Select>
                          {fonte.vendedorMode === 'fixed' ? (
                            <Select value={fonte.fixedVendedorId} onValueChange={v => updateFonte(fonte.id, { fixedVendedorId: v })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select value={fonte.vendedorColumn} onValueChange={v => updateFonte(fonte.id, { vendedorColumn: v })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Coluna" /></SelectTrigger>
                              <SelectContent>
                                {(fonte.csvHeaders || []).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Progress indicator */}
                {isProcessing && processingProgress && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{processingProgress.phase} ({processingProgress.current}/{processingProgress.total})</p>
                    <Progress value={processingProgress.total > 0 ? (processingProgress.current / processingProgress.total) * 100 : 0} className="h-2" />
                  </div>
                )}
                {/* Process button */}
                <Button
                  onClick={() => processarFonte(fonte)}
                  disabled={isProcessing || !isFonteValid(fonte)}
                  size="sm"
                  className="w-full"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Importar Fonte
                </Button>
                {fonte.tipo === 'arquivo' && !isFonteValid(fonte) && (
                  <p className="text-xs text-muted-foreground text-center">
                    Selecione um arquivo CSV e um mapeamento para importar.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}

      {fontes.length === 0 && existingFontes.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Adicione uma fonte de vendas internas usando os botões acima.
        </div>
      )}
    </div>
  );
}
