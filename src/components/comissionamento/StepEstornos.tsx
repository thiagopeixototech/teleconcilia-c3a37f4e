import { useState, useRef, useEffect } from 'react';
import { normalizeCpfCnpj, normalizeCpfCnpjForMatch } from '@/lib/normalizeCpfCnpj';
import { parseCurrency } from '@/lib/parseCurrency';
import { parseCSV } from '@/lib/parseCSV';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2, Upload, FileSpreadsheet, CheckCircle2, XCircle, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const CAMPOS_ESTORNO = [
  { key: 'valor_estornado', label: 'Valor do Estorno', required: true },
  { key: 'referencia_desconto', label: 'Referência Desconto', required: true },
  { key: 'identificador_make', label: 'Identificador Make', required: false },
  { key: 'protocolo', label: 'Protocolo', required: false },
  { key: 'cpf_cnpj', label: 'CPF/CNPJ', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
];

interface Props {
  comissionamentoId: string;
  comissionamentoNome: string;
}

interface ImportResult {
  total: number;
  matched: number;
  noMatch: number;
  errors: { line: number; reason: string }[];
}

interface MapeamentoEstornoModel {
  id: string;
  nome: string;
  mapeamento: Record<string, string>;
}

export function StepEstornos({ comissionamentoId, comissionamentoNome }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<'upload' | 'mapping' | 'result'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [modelos, setModelos] = useState<MapeamentoEstornoModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  useEffect(() => {
    supabase.from('mapeamento_estornos' as any).select('id, nome, mapeamento').order('nome').then(({ data }) => {
      if (data) setModelos(data as unknown as MapeamentoEstornoModel[]);
    });
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const content = await f.text();
    const { headers, rows } = parseCSV(content);
    if (headers.length === 0) { toast.error('Arquivo vazio'); return; }
    setCsvHeaders(headers);
    setCsvRows(rows);
    toast.success(`${rows.length} linhas encontradas`);
  };

  const normDoc = normalizeCpfCnpjForMatch;

  const processImport = async () => {
    // Validate
    if (!mapping.valor_estornado || !mapping.referencia_desconto) {
      toast.error('Mapeie os campos obrigatórios');
      return;
    }
    const matchFields = ['identificador_make', 'protocolo', 'cpf_cnpj', 'telefone'];
    if (!matchFields.some(f => !!mapping[f])) {
      toast.error('Mapeie pelo menos um campo de cruzamento');
      return;
    }

    setIsProcessing(true);
    const importResult: ImportResult = { total: csvRows.length, matched: 0, noMatch: 0, errors: [] };

    try {
      // Load comissionamento_vendas with venda info
      const { data: comVendas } = await supabase
        .from('comissionamento_vendas')
        .select(`
          id, venda_interna_id, receita_descontada,
          vendas_internas!comissionamento_vendas_venda_interna_id_fkey(
            identificador_make, protocolo_interno, cpf_cnpj, telefone
          )
        `)
        .eq('comissionamento_id', comissionamentoId);

      // Build lookup maps
      const byMake = new Map<string, string>();
      const byProto = new Map<string, string>();
      const byCpfTel = new Map<string, string>();

      for (const cv of (comVendas || [])) {
        const vi = cv.vendas_internas as any;
        if (!vi) continue;
        if (vi.identificador_make) byMake.set(vi.identificador_make.trim(), cv.id);
        if (vi.protocolo_interno) byProto.set(vi.protocolo_interno.trim(), cv.id);
        if (vi.cpf_cnpj && vi.telefone) {
          byCpfTel.set(`${normDoc(vi.cpf_cnpj)}_${normDoc(vi.telefone)}`, cv.id);
        }
      }

      // FIX: Accumulate estornos per comVenda instead of overwriting
      const accumulated = new Map<string, number>();
      // Pre-load existing receita_descontada
      for (const cv of (comVendas || [])) {
        accumulated.set(cv.id, Number(cv.receita_descontada || 0));
      }

      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        const valor = parseCurrency(row[mapping.valor_estornado]);
        if (valor === null || valor <= 0) {
          importResult.errors.push({ line: i + 2, reason: `Valor inválido: "${row[mapping.valor_estornado]}"` });
          continue;
        }

        const idMake = mapping.identificador_make ? row[mapping.identificador_make]?.trim() : null;
        const proto = mapping.protocolo ? row[mapping.protocolo]?.trim() : null;
        const cpf = mapping.cpf_cnpj ? normDoc(row[mapping.cpf_cnpj] || '') : null;
        const tel = mapping.telefone ? normDoc(row[mapping.telefone] || '') : null;

        let comVendaId: string | null = null;
        if (idMake && byMake.has(idMake)) comVendaId = byMake.get(idMake)!;
        else if (proto && byProto.has(proto)) comVendaId = byProto.get(proto)!;
        else if (cpf && tel && byCpfTel.has(`${cpf}_${tel}`)) comVendaId = byCpfTel.get(`${cpf}_${tel}`)!;

        if (comVendaId) {
          // Accumulate value
          accumulated.set(comVendaId, (accumulated.get(comVendaId) || 0) + valor);
          importResult.matched++;
        } else {
          importResult.noMatch++;
        }
      }

      // CC-06: Also insert into estornos table with comissionamento_id for traceability
      const estornoRecords: any[] = [];
      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        const valor = parseCurrency(row[mapping.valor_estornado]);
        if (valor === null || valor <= 0) continue;

        const idMake = mapping.identificador_make ? row[mapping.identificador_make]?.trim() : null;
        const proto = mapping.protocolo ? row[mapping.protocolo]?.trim() : null;
        const cpf = mapping.cpf_cnpj ? row[mapping.cpf_cnpj]?.trim() : null;
        const tel = mapping.telefone ? row[mapping.telefone]?.trim() : null;
        const ref = row[mapping.referencia_desconto]?.trim() || comissionamentoNome;

        // Find linked venda
        let vendaId: string | null = null;
        let comVendaId: string | null = null;
        if (idMake && byMake.has(idMake)) comVendaId = byMake.get(idMake)!;
        else if (proto && byProto.has(proto)) comVendaId = byProto.get(proto)!;
        else if (cpf && tel && byCpfTel.has(`${normDoc(cpf)}_${normDoc(tel)}`)) comVendaId = byCpfTel.get(`${normDoc(cpf)}_${normDoc(tel)}`)!;

        if (comVendaId) {
          const cv = (comVendas || []).find(c => c.id === comVendaId);
          vendaId = cv?.venda_interna_id || null;
        }

        estornoRecords.push({
          valor_estornado: valor,
          referencia_desconto: ref,
          identificador_make: idMake || null,
          protocolo: proto || null,
          cpf_cnpj: cpf || null,
          telefone: tel || null,
          venda_id: vendaId,
          comissionamento_id: comissionamentoId,
          match_status: comVendaId ? 'MATCHED' : 'NO_MATCH',
          created_by: user?.id,
        });
      }

      // Insert estornos in batches
      for (let i = 0; i < estornoRecords.length; i += 200) {
        const batch = estornoRecords.slice(i, i + 200);
        await supabase.from('estornos').insert(batch as any);
      }

      // Apply accumulated updates to comissionamento_vendas
      const updates = Array.from(accumulated.entries())
        .filter(([id]) => {
          const original = (comVendas || []).find(cv => cv.id === id);
          return accumulated.get(id)! !== Number(original?.receita_descontada || 0);
        })
        .map(([id, total]) => ({ comVendaId: id, receita_descontada: total }));

      for (let i = 0; i < updates.length; i += 50) {
        const batch = updates.slice(i, i + 50);
        await Promise.all(
          batch.map(u =>
            supabase.from('comissionamento_vendas').update({
              status_pag: 'DESCONTADA' as any,
              receita_descontada: u.receita_descontada,
              comissionamento_desconto: comissionamentoNome,
            }).eq('id', u.comVendaId)
          )
        );
      }

      setResult(importResult);
      setStep('result');
      toast.success(`${importResult.matched} estornos vinculados, ${importResult.noMatch} sem vínculo`);
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setResult(null);
  };

  return (
    <div className="space-y-4">
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Upload de Estornos
            </CardTitle>
            <CardDescription className="text-xs">
              Importe o arquivo CSV com os estornos/descontos deste comissionamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                Selecionar CSV
              </Button>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              {file && <p className="text-xs text-muted-foreground mt-2">{file.name} — {csvRows.length} linhas</p>}
            </div>
            {csvRows.length > 0 && (
              <Button size="sm" onClick={() => setStep('mapping')}>Avançar para Mapeamento</Button>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'mapping' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mapeamento de Colunas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {modelos.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">Modelo Salvo</Label>
                <Select
                  value={selectedModelId}
                  onValueChange={v => {
                    setSelectedModelId(v);
                    const model = modelos.find(m => m.id === v);
                    if (model) setMapping({ ...model.mapeamento });
                  }}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Modelo (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Manual —</SelectItem>
                    {modelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_ESTORNO.map(campo => (
                <div key={campo.key} className="space-y-1">
                  <Label className="text-xs">
                    {campo.label} {campo.required && <span className="text-destructive">*</span>}
                  </Label>
                  <Select
                    value={mapping[campo.key] || ''}
                    onValueChange={v => setMapping(prev => ({ ...prev, [campo.key]: v === '__none__' ? '' : v }))}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Não mapear —</SelectItem>
                      {csvHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
              <Button size="sm" onClick={processImport} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Processar Estornos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'result' && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Resultado da Importação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded bg-muted">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{result.total}</p>
              </div>
              <div className="p-3 rounded bg-success/10">
                <p className="text-xs text-muted-foreground">Vinculados</p>
                <p className="text-lg font-bold text-success">{result.matched}</p>
              </div>
              <div className="p-3 rounded bg-destructive/10">
                <p className="text-xs text-muted-foreground">Sem Vínculo</p>
                <p className="text-lg font-bold text-destructive">{result.noMatch}</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  {result.errors.length} erro(s) de processamento
                </AlertDescription>
              </Alert>
            )}
            <Button size="sm" variant="outline" onClick={reset}>Importar outro arquivo</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
