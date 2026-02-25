import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  ArrowLeft,
  ArrowRight,
  Save,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Types
interface Operadora { id: string; nome: string; }
interface Empresa { id: string; nome: string; }
interface Usuario { id: string; nome: string; email: string; cpf: string | null; }
interface MapeamentoVendas {
  id: string;
  nome: string;
  mapeamento: Record<string, string>;
  config: {
    vendedor_mode?: 'column_cpf' | 'column_email' | 'fixed';
    vendedor_column?: string;
    fixed_vendedor_id?: string;
    operadora_mode?: 'fixed' | 'column';
    operadora_id?: string;
    operadora_column?: string;
    empresa_id?: string;
  };
  ativo: boolean;
}

// Campos mapeáveis para vendas internas
const CAMPOS_VENDAS: { key: string; label: string; required: boolean }[] = [
  { key: 'identificador_make', label: 'Identificador Make (chave única)', required: true },
  { key: 'status_make', label: 'Status Make', required: true },
  { key: 'data_venda', label: 'Data da Venda', required: true },
  { key: 'cliente_nome', label: 'Nome do Cliente', required: false },
  { key: 'cpf_cnpj', label: 'CPF/CNPJ', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
  { key: 'protocolo_interno', label: 'Protocolo Interno', required: false },
  { key: 'valor', label: 'Valor', required: false },
  { key: 'data_instalacao', label: 'Data Instalação', required: false },
  { key: 'plano', label: 'Plano', required: false },
  { key: 'cep', label: 'CEP', required: false },
  { key: 'endereco', label: 'Endereço', required: false },
  { key: 'observacoes', label: 'Observações', required: false },
];

type Step = 'upload' | 'mapping' | 'preview' | 'result';

interface ImportResult {
  total: number;
  success: number;
  updated: number;
  errors: { line: number; reason: string; data: Record<string, string> }[];
}

export default function ImportacaoVendas() {
  const { user } = useAuth();

  // Step state
  const [step, setStep] = useState<Step>('upload');

  // Upload step
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mapping step
  const [mapeamentos, setMapeamentos] = useState<MapeamentoVendas[]>([]);
  const [selectedMapeamentoId, setSelectedMapeamentoId] = useState<string>('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [vendedorMode, setVendedorMode] = useState<'column_cpf' | 'column_email' | 'fixed'>('column_cpf');
  const [vendedorColumn, setVendedorColumn] = useState('');
  const [fixedVendedorId, setFixedVendedorId] = useState('');
  const [operadoraMode, setOperadoraMode] = useState<'fixed' | 'column'>('fixed');
  const [operadoraId, setOperadoraId] = useState('');
  const [operadoraColumn, setOperadoraColumn] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [modelName, setModelName] = useState('');

  // Reference data
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  // Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Error correction state
  const [errorCorrections, setErrorCorrections] = useState<Record<number, { vendedor_id?: string; operadora_id?: string }>>({});
  const [selectedErrorIndices, setSelectedErrorIndices] = useState<Set<number>>(new Set());
  const [bulkVendedorId, setBulkVendedorId] = useState('');
  const [bulkOperadoraId, setBulkOperadoraId] = useState('');
  const [isSavingCorrections, setIsSavingCorrections] = useState(false);

  // Load reference data
  useEffect(() => {
    const load = async () => {
      const [opRes, empRes, usrRes, mapRes] = await Promise.all([
        supabase.from('operadoras').select('id, nome').eq('ativa', true).order('nome'),
        supabase.from('empresas').select('id, nome').eq('ativa', true).order('nome'),
        supabase.from('usuarios').select('id, nome, email, cpf').eq('ativo', true).order('nome'),
        supabase.from('mapeamento_vendas' as any).select('*').order('nome'),
      ]);
      if (opRes.data) setOperadoras(opRes.data);
      if (empRes.data) setEmpresas(empRes.data);
      if (usrRes.data) setUsuarios(usrRes.data as Usuario[]);
      if (mapRes.data) setMapeamentos(mapRes.data as unknown as MapeamentoVendas[]);
    };
    load();
  }, []);

  // CSV parser
  const parseCSV = (content: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ''; });
      return row;
    });
    return { headers, rows };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const content = await f.text();
    const { headers, rows } = parseCSV(content);
    if (headers.length === 0) {
      toast.error('Arquivo vazio ou formato inválido');
      return;
    }
    setCsvHeaders(headers);
    setCsvRows(rows);
    toast.success(`${rows.length} linhas encontradas`);
  };

  const goToMapping = () => {
    if (!file || csvRows.length === 0) {
      toast.error('Selecione um arquivo válido primeiro');
      return;
    }
    setStep('mapping');
  };

  // Load a saved mapping template
  const loadMapeamento = (id: string) => {
    setSelectedMapeamentoId(id);
    const m = mapeamentos.find(x => x.id === id);
    if (!m) return;
    setMapping(m.mapeamento || {});
    setVendedorMode(m.config?.vendedor_mode || 'column_cpf');
    setVendedorColumn(m.config?.vendedor_column || '');
    setFixedVendedorId(m.config?.fixed_vendedor_id || '');
    setOperadoraMode(m.config?.operadora_mode || 'fixed');
    if (m.config?.operadora_id) setOperadoraId(m.config.operadora_id);
    if (m.config?.operadora_column) setOperadoraColumn(m.config.operadora_column);
    if (m.config?.empresa_id) setEmpresaId(m.config.empresa_id);
    setModelName(m.nome);
  };

  // Save current mapping as template
  const saveMapeamento = async () => {
    if (!modelName.trim()) {
      toast.error('Informe um nome para o modelo');
      return;
    }
    const payload = {
      nome: modelName.trim(),
      mapeamento: mapping,
      config: {
        vendedor_mode: vendedorMode,
        vendedor_column: vendedorColumn,
        fixed_vendedor_id: fixedVendedorId,
        operadora_mode: operadoraMode,
        operadora_id: operadoraId,
        operadora_column: operadoraColumn,
        empresa_id: empresaId,
      },
      ativo: true,
    };

    if (selectedMapeamentoId) {
      const { error } = await supabase
        .from('mapeamento_vendas' as any)
        .update(payload)
        .eq('id', selectedMapeamentoId);
      if (error) { toast.error('Erro ao atualizar modelo'); return; }
      toast.success('Modelo atualizado');
    } else {
      const { data, error } = await supabase
        .from('mapeamento_vendas' as any)
        .insert(payload)
        .select()
        .single();
      if (error) { toast.error('Erro ao salvar modelo'); return; }
      setSelectedMapeamentoId((data as any).id);
      setMapeamentos(prev => [...prev, data as unknown as MapeamentoVendas]);
      toast.success('Modelo salvo');
    }
  };

  // Validate mapping before preview
  const validateMapping = (): string | null => {
    const required = CAMPOS_VENDAS.filter(c => c.required);
    for (const campo of required) {
      if (!mapping[campo.key]) return `Campo obrigatório não mapeado: ${campo.label}`;
    }
    if (operadoraMode === 'fixed' && !operadoraId) return 'Selecione a operadora';
    if (operadoraMode === 'column' && !operadoraColumn) return 'Selecione a coluna da operadora';
    if (!empresaId) return 'Selecione a empresa';
    if (vendedorMode === 'fixed' && !fixedVendedorId) return 'Selecione o vendedor fixo';
    if ((vendedorMode === 'column_cpf' || vendedorMode === 'column_email') && !vendedorColumn) {
      return 'Selecione a coluna do vendedor';
    }
    return null;
  };

  const goToPreview = () => {
    const err = validateMapping();
    if (err) { toast.error(err); return; }
    setStep('preview');
  };

  // Normalize helpers
  const normalizeCpfCnpj = (v: string) => v.replace(/[^\d]/g, '');
  const normalizeTelefone = (v: string) => v.replace(/[^\d]/g, '');

  const parseDate = (v: string): string | null => {
    if (!v) return null;
    const brMatch = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (brMatch) return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
    const isoMatch = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    const usMatch = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
    return null;
  };

  // Find operadora by name from row
  const findOperadora = (row: Record<string, string>): Operadora | null => {
    if (operadoraMode === 'fixed') {
      return operadoras.find(o => o.id === operadoraId) || null;
    }
    const value = row[operadoraColumn]?.trim();
    if (!value) return null;
    const normalized = value.toLowerCase();
    return operadoras.find(o => o.nome.toLowerCase() === normalized) || null;
  };

  // Find vendedor by CPF or email
  const findVendedor = (row: Record<string, string>): Usuario | null => {
    if (vendedorMode === 'fixed') {
      return usuarios.find(u => u.id === fixedVendedorId) || null;
    }
    const value = row[vendedorColumn]?.trim();
    if (!value) return null;
    if (vendedorMode === 'column_cpf') {
      const normalized = normalizeCpfCnpj(value);
      return usuarios.find(u => u.cpf && normalizeCpfCnpj(u.cpf) === normalized) || null;
    }
    if (vendedorMode === 'column_email') {
      return usuarios.find(u => u.email.toLowerCase() === value.toLowerCase()) || null;
    }
    return null;
  };

  // Pre-computed preview rows (only first 100) to avoid freezing render
  const previewRows = useMemo(() => {
    if (step !== 'preview') return [];
    return csvRows.slice(0, 100).map((row, i) => {
      const vendedor = findVendedor(row);
      const operadora = findOperadora(row);
      const vendedorRawValue = vendedorMode === 'fixed' ? '' : (row[vendedorColumn]?.trim() || '');
      const operadoraRawValue = operadoraMode === 'fixed' ? '' : (row[operadoraColumn]?.trim() || '');
      return { row, vendedor, operadora, vendedorRawValue, operadoraRawValue, index: i };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, csvRows, mapping, vendedorMode, vendedorColumn, fixedVendedorId, operadoraMode, operadoraId, operadoraColumn, operadoras, usuarios]);

  // Process import
  const processImport = async () => {
    setIsProcessing(true);
    const totalRows = csvRows.length;
    setImportProgress({ current: 0, total: totalRows, percent: 0 });
    const importResult: ImportResult = { total: totalRows, success: 0, updated: 0, errors: [] };

    try {
      // === Phase 1: Check existing IDs (show progress as "preparing") ===
      const idsToCheck = csvRows
        .map(r => r[mapping.identificador_make]?.trim())
        .filter(Boolean);

      const existingMap = new Map<string, string>();
      const CHECK_BATCH = 200;
      for (let i = 0; i < idsToCheck.length; i += CHECK_BATCH) {
        const batch = idsToCheck.slice(i, i + CHECK_BATCH);
        const { data } = await supabase
          .from('vendas_internas')
          .select('id, identificador_make')
          .in('identificador_make', batch);
        data?.forEach(d => { if (d.identificador_make) existingMap.set(d.identificador_make, d.id); });
        // Show preparation progress (0-10% range)
        const prepPercent = Math.round(((i + batch.length) / idsToCheck.length) * 10);
        setImportProgress({ current: 0, total: totalRows, percent: prepPercent });
        await new Promise(r => setTimeout(r, 10));
      }

      // === Phase 2: Build insert/update arrays (runs synchronously, fast) ===
      const rowsToInsert: any[] = [];
      const rowsToUpdate: { id: string; data: any }[] = [];
      const seenIds = new Set<string>();

      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        const lineNum = i + 2;

        const identificador = row[mapping.identificador_make]?.trim();
        if (!identificador) {
          importResult.errors.push({ line: lineNum, reason: 'identificador_make vazio', data: row });
          continue;
        }

        if (seenIds.has(identificador)) {
          importResult.errors.push({ line: lineNum, reason: `Duplicado dentro do próprio arquivo: "${identificador}"`, data: row });
          continue;
        }
        seenIds.add(identificador);

        const dataVenda = parseDate(row[mapping.data_venda]?.trim() || '');
        if (!dataVenda) {
          importResult.errors.push({ line: lineNum, reason: `data_venda inválida: "${row[mapping.data_venda]}"`, data: row });
          continue;
        }

        const vendedor = findVendedor(row);
        if (!vendedor) {
          const vendedorValue = vendedorMode === 'fixed' ? fixedVendedorId : row[vendedorColumn];
          importResult.errors.push({ line: lineNum, reason: `Vendedor não encontrado: "${vendedorValue}"`, data: row });
          continue;
        }

        const operadora = findOperadora(row);
        if (!operadora) {
          const opValue = operadoraMode === 'fixed' ? operadoraId : row[operadoraColumn];
          importResult.errors.push({ line: lineNum, reason: `Operadora não encontrada: "${opValue}"`, data: row });
          continue;
        }

        const cpf = mapping.cpf_cnpj ? normalizeCpfCnpj(row[mapping.cpf_cnpj] || '') : null;
        const telefone = mapping.telefone ? normalizeTelefone(row[mapping.telefone] || '') : null;
        const valorStr = mapping.valor ? row[mapping.valor]?.replace(',', '.').replace(/[^\d.-]/g, '') : null;
        const valor = valorStr ? parseFloat(valorStr) : null;
        const dataInstalacao = mapping.data_instalacao ? parseDate(row[mapping.data_instalacao]?.trim() || '') : null;

        const rowData = {
          identificador_make: identificador,
          status_make: row[mapping.status_make]?.trim() || null,
          data_venda: dataVenda,
          data_instalacao: dataInstalacao,
          cliente_nome: row[mapping.cliente_nome]?.trim() || 'Não informado',
          cpf_cnpj: cpf || null,
          telefone: telefone || null,
          protocolo_interno: mapping.protocolo_interno ? row[mapping.protocolo_interno]?.trim() || null : null,
          valor: valor,
          plano: mapping.plano ? row[mapping.plano]?.trim() || null : null,
          cep: mapping.cep ? row[mapping.cep]?.trim() || null : null,
          endereco: mapping.endereco ? row[mapping.endereco]?.trim() || null : null,
          observacoes: mapping.observacoes ? row[mapping.observacoes]?.trim() || null : null,
          operadora_id: operadora.id,
          empresa_id: empresaId,
          usuario_id: vendedor.id,
        };

        if (existingMap.has(identificador)) {
          const existingId = existingMap.get(identificador)!;
          rowsToUpdate.push({ id: existingId, data: rowData });
        } else {
          rowsToInsert.push({ ...rowData, status_interno: 'aguardando' });
        }
      }

      // === Phase 3: Insert in batches of 500 (progress 10-80%) ===
      let processed = 0;
      const totalToProcess = rowsToInsert.length + rowsToUpdate.length;
      const INSERT_BATCH = 500;
      for (let i = 0; i < rowsToInsert.length; i += INSERT_BATCH) {
        const batch = rowsToInsert.slice(i, i + INSERT_BATCH);
        const { error } = await supabase.from('vendas_internas').insert(batch);
        if (error) {
          // Fallback: try one by one
          for (const row of batch) {
            const { error: singleError } = await supabase.from('vendas_internas').insert(row);
            if (singleError) {
              importResult.errors.push({ line: 0, reason: singleError.message, data: row });
            } else {
              importResult.success++;
            }
          }
        } else {
          importResult.success += batch.length;
        }
        processed += batch.length;
        const pct = 10 + Math.round((processed / Math.max(totalToProcess, 1)) * 70);
        setImportProgress({ current: processed, total: totalToProcess, percent: pct });
        await new Promise(r => setTimeout(r, 30));
      }

      // === Phase 4: Update in batches of 50 via Promise.all (progress 80-100%) ===
      const UPDATE_BATCH = 50;
      for (let i = 0; i < rowsToUpdate.length; i += UPDATE_BATCH) {
        const batch = rowsToUpdate.slice(i, i + UPDATE_BATCH);
        const results = await Promise.all(
          batch.map(item =>
            supabase.from('vendas_internas').update(item.data).eq('id', item.id)
          )
        );
        results.forEach((res, idx) => {
          if (res.error) {
            importResult.errors.push({ line: 0, reason: `Erro ao atualizar: ${res.error.message}`, data: batch[idx].data });
          } else {
            importResult.updated++;
          }
        });
        processed += batch.length;
        const pct = 10 + Math.round((processed / Math.max(totalToProcess, 1)) * 70);
        setImportProgress({ current: processed, total: totalToProcess, percent: Math.min(pct, 95) });
        await new Promise(r => setTimeout(r, 30));
      }

      // Audit log
      try {
        await supabase.from('audit_log' as any).insert({
          tabela: 'vendas_internas',
          registro_id: '00000000-0000-0000-0000-000000000000',
          acao: 'IMPORTACAO_MASSA',
          usuario_id: user?.id || null,
          dados_novos: {
            arquivo: file?.name,
            total: importResult.total,
            novos: importResult.success,
            atualizados: importResult.updated,
            erros: importResult.errors.length,
            operadora_id: operadoraId,
            empresa_id: empresaId,
          },
        });
      } catch {}

      setResult(importResult);
      setStep('result');
      toast.success(`Importação concluída: ${importResult.success} novas, ${importResult.updated} atualizadas`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar importação');
    } finally {
      setIsProcessing(false);
      setImportProgress(null);
    }
  };

  const exportErrors = () => {
    if (!result || result.errors.length === 0) return;
    const headers = ['Linha', 'Motivo', ...csvHeaders];
    const rows = result.errors.map(e => [
      e.line.toString(),
      e.reason,
      ...csvHeaders.map(h => e.data[h] || ''),
    ]);
    const csvContent = [headers, ...rows]
      .map(r => r.map(c => `"${c}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `erros_importacao_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setResult(null);
    setSelectedMapeamentoId('');
    setErrorCorrections({});
    setSelectedErrorIndices(new Set());
    setBulkVendedorId('');
    setBulkOperadoraId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Toggle selection of a single error for bulk actions
  const toggleErrorSelection = (idx: number) => {
    setSelectedErrorIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAllErrors = () => {
    if (!result) return;
    if (selectedErrorIndices.size === result.errors.length) {
      setSelectedErrorIndices(new Set());
    } else {
      setSelectedErrorIndices(new Set(result.errors.map((_, i) => i)));
    }
  };

  // Apply bulk correction to selected errors
  const applyBulkCorrection = () => {
    if (selectedErrorIndices.size === 0) { toast.error('Selecione ao menos uma linha'); return; }
    if (!bulkVendedorId && !bulkOperadoraId) { toast.error('Selecione vendedor ou operadora para aplicar'); return; }
    setErrorCorrections(prev => {
      const next = { ...prev };
      selectedErrorIndices.forEach(idx => {
        next[idx] = {
          ...next[idx],
          ...(bulkVendedorId ? { vendedor_id: bulkVendedorId } : {}),
          ...(bulkOperadoraId ? { operadora_id: bulkOperadoraId } : {}),
        };
      });
      return next;
    });
    toast.success(`Correção aplicada a ${selectedErrorIndices.size} linhas`);
  };

  // Save corrected error rows to the database
  const saveCorrections = async () => {
    if (!result) return;
    const correctedIndices = Object.keys(errorCorrections).map(Number);
    if (correctedIndices.length === 0) { toast.error('Nenhuma correção para salvar'); return; }

    setIsSavingCorrections(true);
    let saved = 0;
    let failed = 0;
    const remainingErrors: ImportResult['errors'] = [];

    for (let i = 0; i < result.errors.length; i++) {
      const correction = errorCorrections[i];
      if (!correction) {
        remainingErrors.push(result.errors[i]);
        continue;
      }

      const errRow = result.errors[i];
      const row = errRow.data;

      // Determine vendedor
      let vendedorId = correction.vendedor_id;
      if (!vendedorId) {
        // Try original logic
        const v = findVendedor(row);
        if (v) vendedorId = v.id;
      }
      if (!vendedorId) {
        remainingErrors.push({ ...errRow, reason: 'Vendedor ainda não definido' });
        failed++;
        continue;
      }

      // Determine operadora
      let opId = correction.operadora_id;
      if (!opId) {
        const op = findOperadora(row);
        if (op) opId = op.id;
      }
      if (!opId) {
        remainingErrors.push({ ...errRow, reason: 'Operadora ainda não definida' });
        failed++;
        continue;
      }

      const dataVenda = parseDate(row[mapping.data_venda]?.trim() || '');
      if (!dataVenda) {
        remainingErrors.push(errRow);
        failed++;
        continue;
      }

      const identificador = row[mapping.identificador_make]?.trim();
      const cpf = mapping.cpf_cnpj ? normalizeCpfCnpj(row[mapping.cpf_cnpj] || '') : null;
      const telefone = mapping.telefone ? normalizeTelefone(row[mapping.telefone] || '') : null;
      const valorStr = mapping.valor ? row[mapping.valor]?.replace(',', '.').replace(/[^\d.-]/g, '') : null;
      const valor = valorStr ? parseFloat(valorStr) : null;
      const dataInstalacao = mapping.data_instalacao ? parseDate(row[mapping.data_instalacao]?.trim() || '') : null;

      const rowData: any = {
        identificador_make: identificador,
        status_make: row[mapping.status_make]?.trim() || null,
        data_venda: dataVenda,
        data_instalacao: dataInstalacao,
        cliente_nome: row[mapping.cliente_nome]?.trim() || 'Não informado',
        cpf_cnpj: cpf || null,
        telefone: telefone || null,
        protocolo_interno: mapping.protocolo_interno ? row[mapping.protocolo_interno]?.trim() || null : null,
        valor: valor,
        plano: mapping.plano ? row[mapping.plano]?.trim() || null : null,
        cep: mapping.cep ? row[mapping.cep]?.trim() || null : null,
        endereco: mapping.endereco ? row[mapping.endereco]?.trim() || null : null,
        observacoes: mapping.observacoes ? row[mapping.observacoes]?.trim() || null : null,
        operadora_id: opId,
        empresa_id: empresaId,
        usuario_id: vendedorId,
        status_interno: 'aguardando',
      };

      // Check if it already exists (upsert logic)
      if (identificador) {
        const { data: existing } = await supabase
          .from('vendas_internas')
          .select('id')
          .eq('identificador_make', identificador)
          .maybeSingle();

        if (existing) {
          const { status_interno, ...updateData } = rowData;
          const { error } = await supabase.from('vendas_internas').update(updateData).eq('id', existing.id);
          if (error) { remainingErrors.push({ ...errRow, reason: error.message }); failed++; }
          else saved++;
        } else {
          const { error } = await supabase.from('vendas_internas').insert(rowData);
          if (error) { remainingErrors.push({ ...errRow, reason: error.message }); failed++; }
          else saved++;
        }
      } else {
        remainingErrors.push(errRow);
        failed++;
      }
    }

    setResult(prev => prev ? { ...prev, success: prev.success + saved, errors: remainingErrors } : prev);
    setErrorCorrections({});
    setSelectedErrorIndices(new Set());
    setIsSavingCorrections(false);
    toast.success(`${saved} linhas salvas com sucesso${failed > 0 ? `, ${failed} ainda com erro` : ''}`);
  };

  // Check if an error is about vendedor or operadora
  const errorNeedsVendedor = (reason: string) => reason.toLowerCase().includes('vendedor');
  const errorNeedsOperadora = (reason: string) => reason.toLowerCase().includes('operadora');
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Mapeamento' },
    { key: 'preview', label: 'Pré-visualização' },
    { key: 'result', label: 'Resultado' },
  ];
  const stepIndex = steps.findIndex(s => s.key === step);

  return (
    <AppLayout title="Importação de Vendas">
      <div className="space-y-6">
        {/* Stepper */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                i === stepIndex ? 'bg-primary text-primary-foreground' :
                i < stepIndex ? 'bg-primary/20 text-primary' :
                'bg-muted text-muted-foreground'
              }`}>
                <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs bg-background/20">
                  {i + 1}
                </span>
                {s.label}
              </div>
              {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload do Arquivo
              </CardTitle>
              <CardDescription>
                Selecione um arquivo CSV com as vendas a serem importadas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="max-w-xs mx-auto"
                />
                <p className="text-sm text-muted-foreground mt-2">Formatos aceitos: CSV (separado por vírgula ou ponto-e-vírgula)</p>
              </div>

              {file && csvRows.length > 0 && (
                <>
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{file.name}</strong> — {csvRows.length} linhas encontradas, {csvHeaders.length} colunas
                    </AlertDescription>
                  </Alert>

                  <div className="overflow-x-auto max-h-64 border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {csvHeaders.slice(0, 8).map(h => (
                            <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                          ))}
                          {csvHeaders.length > 8 && <TableHead className="text-xs">...</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvRows.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {csvHeaders.slice(0, 8).map(h => (
                              <TableCell key={h} className="text-xs whitespace-nowrap max-w-[150px] truncate">
                                {row[h]}
                              </TableCell>
                            ))}
                            {csvHeaders.length > 8 && <TableCell className="text-xs">...</TableCell>}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={goToMapping}>
                      Próximo: Mapeamento
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Mapping */}
        {step === 'mapping' && (
          <div className="space-y-6">
            {/* Load/Save template */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Modelo de Mapeamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Label>Carregar modelo salvo</Label>
                    <Select value={selectedMapeamentoId} onValueChange={loadMapeamento}>
                      <SelectTrigger><SelectValue placeholder="Selecione um modelo..." /></SelectTrigger>
                      <SelectContent>
                        {mapeamentos.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label>Nome do modelo</Label>
                    <Input value={modelName} onChange={e => setModelName(e.target.value)} placeholder="Ex: Relatório Make" />
                  </div>
                  <Button variant="outline" onClick={saveMapeamento} disabled={!modelName.trim()}>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Context selectors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração da Importação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold">Operadora *</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <Button
                      variant={operadoraMode === 'column' ? 'default' : 'outline'}
                      className="justify-start h-auto py-3"
                      onClick={() => setOperadoraMode('column')}
                    >
                      <div className="text-left">
                        <div className="font-medium">Da planilha (por nome)</div>
                        <div className="text-xs opacity-70">Coluna com nome da operadora</div>
                      </div>
                    </Button>
                    <Button
                      variant={operadoraMode === 'fixed' ? 'default' : 'outline'}
                      className="justify-start h-auto py-3"
                      onClick={() => setOperadoraMode('fixed')}
                    >
                      <div className="text-left">
                        <div className="font-medium">Operadora fixa</div>
                        <div className="text-xs opacity-70">Todas as linhas = 1 operadora</div>
                      </div>
                    </Button>
                  </div>

                  {operadoraMode === 'column' && (
                    <div className="mt-3">
                      <Label>Coluna da Operadora</Label>
                      <Select value={operadoraColumn} onValueChange={setOperadoraColumn}>
                        <SelectTrigger><SelectValue placeholder="Selecione a coluna..." /></SelectTrigger>
                        <SelectContent>
                          {csvHeaders.map(h => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">O nome na planilha deve ser igual ao cadastrado no sistema</p>
                    </div>
                  )}
                  {operadoraMode === 'fixed' && (
                    <div className="mt-3">
                      <Label>Operadora</Label>
                      <Select value={operadoraId} onValueChange={setOperadoraId}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {operadoras.map(o => (
                            <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Empresa *</Label>
                  <Select value={empresaId} onValueChange={setEmpresaId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {empresas.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Vendedor config */}
                <div>
                  <Label className="text-sm font-semibold">Identificação do Vendedor *</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                    <Button
                      variant={vendedorMode === 'column_cpf' ? 'default' : 'outline'}
                      className="justify-start h-auto py-3"
                      onClick={() => setVendedorMode('column_cpf')}
                    >
                      <div className="text-left">
                        <div className="font-medium">Por CPF do vendedor</div>
                        <div className="text-xs opacity-70">Coluna com CPF do consultor</div>
                      </div>
                    </Button>
                    <Button
                      variant={vendedorMode === 'column_email' ? 'default' : 'outline'}
                      className="justify-start h-auto py-3"
                      onClick={() => setVendedorMode('column_email')}
                    >
                      <div className="text-left">
                        <div className="font-medium">Por e-mail do vendedor</div>
                        <div className="text-xs opacity-70">Coluna com e-mail do consultor</div>
                      </div>
                    </Button>
                    <Button
                      variant={vendedorMode === 'fixed' ? 'default' : 'outline'}
                      className="justify-start h-auto py-3"
                      onClick={() => setVendedorMode('fixed')}
                    >
                      <div className="text-left">
                        <div className="font-medium">Vendedor fixo</div>
                        <div className="text-xs opacity-70">Todas as linhas = 1 vendedor</div>
                      </div>
                    </Button>
                  </div>

                  {(vendedorMode === 'column_cpf' || vendedorMode === 'column_email') && (
                    <div className="mt-3">
                      <Label>Coluna do {vendedorMode === 'column_cpf' ? 'CPF' : 'E-mail'} do vendedor</Label>
                      <Select value={vendedorColumn} onValueChange={setVendedorColumn}>
                        <SelectTrigger><SelectValue placeholder="Selecione a coluna..." /></SelectTrigger>
                        <SelectContent>
                          {csvHeaders.map(h => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {vendedorMode === 'fixed' && (
                    <div className="mt-3">
                      <Label>Vendedor</Label>
                      <Select value={fixedVendedorId} onValueChange={setFixedVendedorId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o vendedor..." /></SelectTrigger>
                        <SelectContent>
                          {usuarios.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.nome} ({u.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Column mapping */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mapeamento de Colunas</CardTitle>
                <CardDescription>Associe as colunas do arquivo aos campos do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CAMPOS_VENDAS.map(campo => (
                    <div key={campo.key}>
                      <Label className="flex items-center gap-1">
                        {campo.label}
                        {campo.required && <span className="text-destructive">*</span>}
                      </Label>
                      <Select
                        value={mapping[campo.key] || ''}
                        onValueChange={v => setMapping(prev => ({ ...prev, [campo.key]: v === '__none__' ? '' : v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="— Não mapear —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Não mapear —</SelectItem>
                          {csvHeaders.map(h => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={goToPreview}>
                Próximo: Pré-visualização
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Pré-visualização e Importação
              </CardTitle>
              <CardDescription>
                Confira os dados mapeados antes de importar. Serão processadas {csvRows.length} linhas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{csvRows.length}</div>
                  <div className="text-xs text-muted-foreground">Total de linhas</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">
                    {operadoraMode === 'fixed'
                      ? operadoras.find(o => o.id === operadoraId)?.nome || '-'
                      : `Coluna: ${operadoraColumn}`}
                  </div>
                  <div className="text-xs text-muted-foreground">Operadora</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{empresas.find(e => e.id === empresaId)?.nome || '-'}</div>
                  <div className="text-xs text-muted-foreground">Empresa</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">
                    {vendedorMode === 'fixed'
                      ? usuarios.find(u => u.id === fixedVendedorId)?.nome || '-'
                      : vendedorMode === 'column_cpf' ? 'CPF' : 'E-mail'}
                  </div>
                  <div className="text-xs text-muted-foreground">Vendedor</div>
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto max-h-[500px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      {CAMPOS_VENDAS.filter(c => mapping[c.key]).map(c => (
                        <TableHead key={c.key} className="text-xs whitespace-nowrap">{c.label}</TableHead>
                      ))}
                      <TableHead className="text-xs">Operadora</TableHead>
                      <TableHead className="text-xs">Vendedor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((pr) => (
                      <TableRow key={pr.index}>
                        <TableCell className="text-xs">{pr.index + 1}</TableCell>
                        {CAMPOS_VENDAS.filter(c => mapping[c.key]).map(c => (
                          <TableCell key={c.key} className="text-xs whitespace-nowrap max-w-[150px] truncate">
                            {pr.row[mapping[c.key]] || '-'}
                          </TableCell>
                        ))}
                        <TableCell className="text-xs">
                          {pr.operadora ? (
                            <Badge variant="outline" className="text-xs">{pr.operadora.nome}</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Não encontrada{pr.operadoraRawValue ? ` ("${pr.operadoraRawValue}")` : ''}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {pr.vendedor ? (
                            <Badge variant="outline" className="text-xs">{pr.vendedor.nome}</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Não encontrado{pr.vendedorRawValue ? ` ("${pr.vendedorRawValue}")` : ''}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {csvRows.length > 100 && (
                <p className="text-xs text-muted-foreground text-center">
                  Mostrando 100 de {csvRows.length} linhas
                </p>
              )}

              {/* Import progress */}
              {isProcessing && importProgress && (
                <div className="space-y-2">
                  <Progress value={importProgress.percent} className="h-3" />
                  <p className="text-xs text-muted-foreground text-center">
                    Processando {importProgress.current} de {importProgress.total} ({importProgress.percent}%)
                  </p>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('mapping')} disabled={isProcessing}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button onClick={processImport} disabled={isProcessing}>
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Importar {csvRows.length} vendas
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Result */}
        {step === 'result' && result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Resultado da Importação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{result.total}</div>
                  <div className="text-sm text-muted-foreground">Total de linhas</div>
                </div>
                <div className="bg-primary/10 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-primary">{result.success}</div>
                  <div className="text-sm text-muted-foreground">Novas</div>
                </div>
                <div className="bg-accent rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-accent-foreground">{result.updated}</div>
                  <div className="text-sm text-muted-foreground">Atualizadas</div>
                </div>
                <div className="bg-destructive/10 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-destructive">{result.errors.length}</div>
                  <div className="text-sm text-muted-foreground">Erros</div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <>
                  <Separator />

                  {/* Header with actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-medium text-sm">
                      {result.errors.length} linha(s) com erro — corrija abaixo ou exporte
                    </h4>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={exportErrors}>
                        <Download className="mr-2 h-4 w-4" />
                        Exportar CSV
                      </Button>
                      {Object.keys(errorCorrections).length > 0 && (
                        <Button size="sm" onClick={saveCorrections} disabled={isSavingCorrections}>
                          {isSavingCorrections ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Salvar {Object.keys(errorCorrections).length} correção(ões)
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Bulk correction panel */}
                  <Card className="border-dashed">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="text-xs font-medium text-muted-foreground whitespace-nowrap pt-2">
                          Ajuste em massa ({selectedErrorIndices.size} selecionadas):
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <Label className="text-xs">Vendedor</Label>
                          <Select value={bulkVendedorId} onValueChange={setBulkVendedorId}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Selecionar vendedor" />
                            </SelectTrigger>
                            <SelectContent>
                              {usuarios.map(u => (
                                <SelectItem key={u.id} value={u.id} className="text-xs">{u.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <Label className="text-xs">Operadora</Label>
                          <Select value={bulkOperadoraId} onValueChange={setBulkOperadoraId}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Selecionar operadora" />
                            </SelectTrigger>
                            <SelectContent>
                              {operadoras.map(o => (
                                <SelectItem key={o.id} value={o.id} className="text-xs">{o.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" variant="secondary" onClick={applyBulkCorrection} disabled={selectedErrorIndices.size === 0}>
                          Aplicar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Error rows table with inline correction */}
                  <div className="overflow-x-auto max-h-[400px] border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-8">
                            <Checkbox
                              checked={selectedErrorIndices.size === result.errors.length && result.errors.length > 0}
                              onCheckedChange={toggleAllErrors}
                            />
                          </TableHead>
                          <TableHead className="text-xs">Linha</TableHead>
                          <TableHead className="text-xs">Identificador</TableHead>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-xs">Motivo</TableHead>
                          <TableHead className="text-xs min-w-[180px]">Vendedor</TableHead>
                          <TableHead className="text-xs min-w-[180px]">Operadora</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((err, i) => {
                          const correction = errorCorrections[i];
                          const correctedVendedor = correction?.vendedor_id
                            ? usuarios.find(u => u.id === correction.vendedor_id)?.nome
                            : null;
                          const correctedOperadora = correction?.operadora_id
                            ? operadoras.find(o => o.id === correction.operadora_id)?.nome
                            : null;
                          const isCorrected = !!correctedVendedor || !!correctedOperadora;

                          return (
                            <TableRow key={i} className={isCorrected ? 'bg-primary/5' : ''}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedErrorIndices.has(i)}
                                  onCheckedChange={() => toggleErrorSelection(i)}
                                />
                              </TableCell>
                              <TableCell className="text-xs">{err.line}</TableCell>
                              <TableCell className="text-xs font-mono">{err.data[mapping.identificador_make] || '-'}</TableCell>
                              <TableCell className="text-xs">{err.data[mapping.cliente_nome] || '-'}</TableCell>
                              <TableCell className="text-xs text-destructive">{err.reason}</TableCell>
                              <TableCell className="text-xs">
                                {errorNeedsVendedor(err.reason) || !findVendedor(err.data) ? (
                                  <Select
                                    value={correction?.vendedor_id || ''}
                                    onValueChange={(val) =>
                                      setErrorCorrections(prev => ({
                                        ...prev,
                                        [i]: { ...prev[i], vendedor_id: val },
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Selecionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {usuarios.map(u => (
                                        <SelectItem key={u.id} value={u.id} className="text-xs">
                                          {u.nome}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-muted-foreground">OK</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {errorNeedsOperadora(err.reason) || !findOperadora(err.data) ? (
                                  <Select
                                    value={correction?.operadora_id || ''}
                                    onValueChange={(val) =>
                                      setErrorCorrections(prev => ({
                                        ...prev,
                                        [i]: { ...prev[i], operadora_id: val },
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Selecionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {operadoras.map(o => (
                                        <SelectItem key={o.id} value={o.id} className="text-xs">
                                          {o.nome}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-muted-foreground">OK</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button onClick={reset}>
                  Nova Importação
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
