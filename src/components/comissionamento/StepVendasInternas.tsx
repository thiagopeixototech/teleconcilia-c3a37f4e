import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export function StepVendasInternas({ comissionamentoId }: Props) {
  const { user } = useAuth();
  const [fontes, setFontes] = useState<FonteConfig[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [mapeamentos, setMapeamentos] = useState<MapeamentoVendas[]>([]);
  const [existingFontes, setExistingFontes] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
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

  const parseCSV = (content: string) => {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { headers: [] as string[], rows: [] as Record<string, string>[] };
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/^\"|\"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/^\"|\"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ''; });
      return row;
    });
    return { headers, rows };
  };

  const handleFileSelect = async (fonteId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const content = await f.text();
    const { headers, rows } = parseCSV(content);
    if (headers.length === 0) { toast.error('Arquivo vazio'); return; }
    updateFonte(fonteId, { arquivo: f, csvHeaders: headers, csvRows: rows, nome: f.name });
    toast.success(`${rows.length} linhas encontradas`);
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

  const normalizeCpfCnpj = (v: string) => v.replace(/[^\d]/g, '');

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
      if (data.length < batchSize) break;
      offset += batchSize;
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

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error: insertErr } = await supabase.from('comissionamento_vendas').insert(batch);
      if (insertErr) throw insertErr;
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

    const deduped = new Map<string, Record<string, string>>();
    for (const row of fonte.csvRows!) {
      const idMake = row[map.identificador_make]?.trim();
      if (idMake) deduped.set(idMake, row);
    }

    for (const [idMake, row] of deduped) {
      const dataVenda = parseDate(row[map.data_venda]?.trim() || '');
      if (!dataVenda) { errorCount++; continue; }

      let vendedorId: string | null = null;
      if (vMode === 'fixed') {
        vendedorId = fixedVId;
      } else {
        const val = row[vCol]?.trim();
        if (val) {
          const normalized = normalizeCpfCnpj(val);
          const found = vMode === 'column_cpf'
            ? usuarios.find(u => u.cpf && normalizeCpfCnpj(u.cpf) === normalized)
            : usuarios.find(u => u.email.toLowerCase() === val.toLowerCase());
          vendedorId = found?.id || null;
        }
      }
      if (!vendedorId) { errorCount++; continue; }

      let operadoraId: string | null = null;
      if (oMode === 'fixed') {
        operadoraId = fixedOId;
      } else {
        const val = row[oCol]?.trim()?.toLowerCase();
        const found = operadoras.find(o => o.nome.toLowerCase() === val);
        operadoraId = found?.id || null;
      }
      if (!operadoraId) { errorCount++; continue; }

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

    // Check existing vendas
    const existingIds = new Map<string, string>();
    const idsToCheck = vendaRows.map(r => r.identificador_make).filter(Boolean);
    for (let i = 0; i < idsToCheck.length; i += 200) {
      const batch = idsToCheck.slice(i, i + 200);
      const { data } = await supabase
        .from('vendas_internas')
        .select('id, identificador_make')
        .in('identificador_make', batch);
      data?.forEach(d => { if (d.identificador_make) existingIds.set(d.identificador_make, d.id); });
    }

    const newVendas = vendaRows.filter(r => !existingIds.has(r.identificador_make));
    const existingVendas = vendaRows.filter(r => existingIds.has(r.identificador_make));

    for (let i = 0; i < newVendas.length; i += 500) {
      const batch = newVendas.slice(i, i + 500);
      await supabase.from('vendas_internas').insert(batch);
    }

    const allIdMakes = vendaRows.map(r => r.identificador_make);
    const vendaIdMap = new Map<string, string>();

    for (let i = 0; i < allIdMakes.length; i += 200) {
      const batch = allIdMakes.slice(i, i + 200);
      const { data } = await supabase
        .from('vendas_internas')
        .select('id, identificador_make, valor')
        .in('identificador_make', batch);
      data?.forEach(d => {
        if (d.identificador_make) vendaIdMap.set(d.identificador_make, d.id);
      });
    }

    const comRows = allIdMakes
      .filter(idm => vendaIdMap.has(idm))
      .map(idm => ({
        comissionamento_id: comissionamentoId,
        venda_interna_id: vendaIdMap.get(idm)!,
        fonte_id: fonteData.id,
        receita_interna: vendaRows.find(r => r.identificador_make === idm)?.valor || null,
      }));

    for (let i = 0; i < comRows.length; i += 500) {
      const batch = comRows.slice(i, i + 500);
      await supabase.from('comissionamento_vendas').insert(batch);
    }

    updateFonte(fonte.id, {
      imported: true,
      importResult: { total: deduped.size, success: successCount, errors: errorCount },
    });
    toast.success(`${successCount} vendas processadas (${newVendas.length} novas, ${existingVendas.length} existentes), ${errorCount} erros`);
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
              <div className="flex gap-4 text-sm">
                <span>Total: <strong>{fonte.importResult.total}</strong></span>
                <span className="text-success">Sucesso: <strong>{fonte.importResult.success}</strong></span>
                {fonte.importResult.errors > 0 && (
                  <span className="text-destructive">Erros: <strong>{fonte.importResult.errors}</strong></span>
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
