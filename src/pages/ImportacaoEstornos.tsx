import { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Campos mapeáveis
const CAMPOS_ESTORNO: { key: string; label: string; required: boolean }[] = [
  { key: 'valor_estornado', label: 'Valor do Estorno', required: true },
  { key: 'referencia_desconto', label: 'Referência de Desconto (YYYY-MM)', required: true },
  { key: 'identificador_make', label: 'Identificador Make', required: false },
  { key: 'protocolo', label: 'Protocolo', required: false },
  { key: 'cpf_cnpj', label: 'CPF/CNPJ', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
];

type Step = 'upload' | 'mapping' | 'preview' | 'result';

interface ImportResult {
  total: number;
  matched: number;
  noMatch: number;
  errors: { line: number; reason: string; data: Record<string, string> }[];
}

export default function ImportacaoEstornos() {
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const parseCSV = (content: string) => {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { headers: [] as string[], rows: [] as Record<string, string>[] };
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
    if (headers.length === 0) { toast.error('Arquivo vazio ou formato inválido'); return; }
    setCsvHeaders(headers);
    setCsvRows(rows);
    toast.success(`${rows.length} linhas encontradas`);
  };

  const normalizeCpfCnpj = (v: string) => v.replace(/[^\d]/g, '');
  const normalizeTelefone = (v: string) => v.replace(/[^\d]/g, '');

  const validateMapping = (): string | null => {
    for (const campo of CAMPOS_ESTORNO.filter(c => c.required)) {
      if (!mapping[campo.key]) return `Campo obrigatório não mapeado: ${campo.label}`;
    }
    // At least one match field
    const matchFields = ['identificador_make', 'protocolo', 'cpf_cnpj', 'telefone'];
    const hasSome = matchFields.some(f => !!mapping[f]);
    if (!hasSome) return 'Mapeie pelo menos um campo de cruzamento (ID Make, Protocolo, CPF ou Telefone)';
    return null;
  };

  const processImport = async () => {
    setIsProcessing(true);
    const importResult: ImportResult = { total: csvRows.length, matched: 0, noMatch: 0, errors: [] };
    const importacaoId = crypto.randomUUID();

    try {
      // Pre-fetch vendas for matching
      const allVendas: { id: string; identificador_make: string | null; protocolo_interno: string | null; cpf_cnpj: string | null; telefone: string | null }[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('vendas_internas')
          .select('id, identificador_make, protocolo_interno, cpf_cnpj, telefone')
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        allVendas.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }

      // Build lookup maps
      const byMake = new Map<string, string>();
      const byProtocolo = new Map<string, string>();
      const byCpfTel = new Map<string, string>();
      allVendas.forEach(v => {
        if (v.identificador_make) byMake.set(v.identificador_make.trim(), v.id);
        if (v.protocolo_interno) byProtocolo.set(v.protocolo_interno.trim(), v.id);
        if (v.cpf_cnpj && v.telefone) {
          byCpfTel.set(`${normalizeCpfCnpj(v.cpf_cnpj)}_${normalizeTelefone(v.telefone)}`, v.id);
        }
      });

      const rowsToInsert: any[] = [];

      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        const lineNum = i + 2;

        const valorStr = row[mapping.valor_estornado]?.replace(',', '.').replace(/[^\d.-]/g, '');
        const valor = valorStr ? parseFloat(valorStr) : NaN;
        if (isNaN(valor) || valor <= 0) {
          importResult.errors.push({ line: lineNum, reason: `Valor inválido: "${row[mapping.valor_estornado]}"`, data: row });
          continue;
        }

        const refDesconto = row[mapping.referencia_desconto]?.trim();
        if (!refDesconto) {
          importResult.errors.push({ line: lineNum, reason: 'Referência de desconto vazia', data: row });
          continue;
        }

        const idMake = mapping.identificador_make ? row[mapping.identificador_make]?.trim() : null;
        const protocolo = mapping.protocolo ? row[mapping.protocolo]?.trim() : null;
        const cpf = mapping.cpf_cnpj ? normalizeCpfCnpj(row[mapping.cpf_cnpj] || '') : null;
        const tel = mapping.telefone ? normalizeTelefone(row[mapping.telefone] || '') : null;

        // Try match in order: identificador_make > protocolo > cpf+telefone
        let vendaId: string | null = null;
        if (idMake && byMake.has(idMake)) {
          vendaId = byMake.get(idMake)!;
        } else if (protocolo && byProtocolo.has(protocolo)) {
          vendaId = byProtocolo.get(protocolo)!;
        } else if (cpf && tel && byCpfTel.has(`${cpf}_${tel}`)) {
          vendaId = byCpfTel.get(`${cpf}_${tel}`)!;
        }

        const matchStatus = vendaId ? 'MATCHED' : 'NO_MATCH';
        if (vendaId) importResult.matched++;
        else importResult.noMatch++;

        rowsToInsert.push({
          importacao_id: importacaoId,
          created_by: user?.id,
          referencia_desconto: refDesconto,
          valor_estornado: valor,
          identificador_make: idMake || null,
          protocolo: protocolo || null,
          cpf_cnpj: cpf || null,
          telefone: tel || null,
          venda_id: vendaId,
          match_status: matchStatus,
        });
      }

      // Insert in batches
      for (let i = 0; i < rowsToInsert.length; i += 200) {
        const batch = rowsToInsert.slice(i, i + 200);
        const { error } = await supabase.from('estornos' as any).insert(batch);
        if (error) {
          // Try one by one
          for (const row of batch) {
            const { error: singleError } = await supabase.from('estornos' as any).insert(row);
            if (singleError) {
              importResult.errors.push({ line: 0, reason: singleError.message, data: row });
              // Adjust counts
              if (row.match_status === 'MATCHED') importResult.matched--;
              else importResult.noMatch--;
            }
          }
        }
      }

      // Audit log
      try {
        await supabase.from('audit_log' as any).insert({
          tabela: 'estornos',
          registro_id: importacaoId,
          acao: 'IMPORTACAO_ESTORNOS',
          usuario_id: user?.id || null,
          dados_novos: {
            arquivo: file?.name,
            total: importResult.total,
            matched: importResult.matched,
            no_match: importResult.noMatch,
            erros: importResult.errors.length,
          },
        });
      } catch {}

      setResult(importResult);
      setStep('result');
      toast.success(`Importação concluída: ${importResult.matched} vinculados, ${importResult.noMatch} sem vínculo`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar importação');
    } finally {
      setIsProcessing(false);
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
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `erros_estornos_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Mapeamento' },
    { key: 'preview', label: 'Pré-visualização' },
    { key: 'result', label: 'Resultado' },
  ];

  return (
    <AppLayout title="Importação de Estornos">
      <div className="space-y-6">
        {/* Stepper */}
        <div className="flex items-center gap-2 text-sm">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <Badge variant={step === s.key ? 'default' : 'outline'} className="text-xs">
                {i + 1}. {s.label}
              </Badge>
              {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Upload Step */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Upload do Arquivo CSV
              </CardTitle>
              <CardDescription>
                Selecione o CSV com os estornos. Campos obrigatórios: valor e referência de desconto (YYYY-MM). 
                Pelo menos um campo de cruzamento (ID Make, Protocolo, CPF ou Telefone) é necessário.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center space-y-4">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                <div>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                    Selecionar Arquivo CSV
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
                {file && (
                  <p className="text-sm text-muted-foreground">{file.name} — {csvRows.length} linhas</p>
                )}
              </div>

              {csvRows.length > 0 && (
                <>
                  <div className="overflow-x-auto max-h-64 border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {csvHeaders.slice(0, 8).map(h => (
                            <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvRows.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {csvHeaders.slice(0, 8).map(h => (
                              <TableCell key={h} className="text-xs whitespace-nowrap max-w-[200px] truncate">{row[h]}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => setStep('mapping')}>
                      Avançar <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Mapping Step */}
        {step === 'mapping' && (
          <Card>
            <CardHeader>
              <CardTitle>Mapeamento de Colunas</CardTitle>
              <CardDescription>Associe as colunas do CSV aos campos do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {CAMPOS_ESTORNO.map(campo => (
                  <div key={campo.key} className="space-y-1">
                    <Label className="text-sm">
                      {campo.label} {campo.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={mapping[campo.key] || ''}
                      onValueChange={v => setMapping(prev => ({ ...prev, [campo.key]: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a coluna" />
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

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
                <Button onClick={() => {
                  const err = validateMapping();
                  if (err) { toast.error(err); return; }
                  setStep('preview');
                }}>
                  Avançar <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview Step */}
        {step === 'preview' && (
          <Card>
            <CardHeader>
              <CardTitle>Pré-visualização</CardTitle>
              <CardDescription>{csvRows.length} estornos serão importados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto max-h-72 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Valor</TableHead>
                      <TableHead className="text-xs">Ref. Desconto</TableHead>
                      <TableHead className="text-xs">ID Make</TableHead>
                      <TableHead className="text-xs">Protocolo</TableHead>
                      <TableHead className="text-xs">CPF/CNPJ</TableHead>
                      <TableHead className="text-xs">Telefone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRows.slice(0, 10).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{row[mapping.valor_estornado] || '-'}</TableCell>
                        <TableCell className="text-xs">{row[mapping.referencia_desconto] || '-'}</TableCell>
                        <TableCell className="text-xs">{mapping.identificador_make ? row[mapping.identificador_make] || '-' : '-'}</TableCell>
                        <TableCell className="text-xs">{mapping.protocolo ? row[mapping.protocolo] || '-' : '-'}</TableCell>
                        <TableCell className="text-xs">{mapping.cpf_cnpj ? row[mapping.cpf_cnpj] || '-' : '-'}</TableCell>
                        <TableCell className="text-xs">{mapping.telefone ? row[mapping.telefone] || '-' : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {csvRows.length > 10 && (
                <p className="text-xs text-muted-foreground text-center">
                  Mostrando 10 de {csvRows.length} linhas
                </p>
              )}

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Estornos são lançamentos financeiros. Não alteram status operacional ou conciliação das vendas.
                </AlertDescription>
              </Alert>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('mapping')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
                <Button onClick={processImport} disabled={isProcessing}>
                  {isProcessing ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</>
                  ) : (
                    <>Importar Estornos</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result Step */}
        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold">{result.total}</div>
                  <p className="text-sm text-muted-foreground">Total de Linhas</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <CheckCircle2 className="h-6 w-6 mx-auto text-success mb-1" />
                  <div className="text-3xl font-bold text-success">{result.matched}</div>
                  <p className="text-sm text-muted-foreground">Vinculados (MATCHED)</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <AlertCircle className="h-6 w-6 mx-auto text-warning mb-1" />
                  <div className="text-3xl font-bold text-warning">{result.noMatch}</div>
                  <p className="text-sm text-muted-foreground">Sem Vínculo (NO_MATCH)</p>
                </CardContent>
              </Card>
            </div>

            {result.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    {result.errors.length} erro(s)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="overflow-x-auto max-h-48 border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Linha</TableHead>
                          <TableHead className="text-xs">Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.slice(0, 20).map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{e.line}</TableCell>
                            <TableCell className="text-xs">{e.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportErrors}>
                    <Download className="mr-2 h-4 w-4" /> Exportar Erros (CSV)
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center">
              <Button onClick={reset}>Nova Importação</Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
