import { useState, useEffect, useRef } from 'react';
import { normalizeCpfCnpj } from '@/lib/normalizeCpfCnpj';
import { parseCurrency } from '@/lib/parseCurrency';
import { parseDate } from '@/lib/parseDate';
import { parseCSV } from '@/lib/parseCSV';
import { supabase } from '@/integrations/supabase/client';
import { MapeamentoColunas, CampoSistema } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2, Plus, Trash2, Upload, FileSpreadsheet, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

interface Operadora { id: string; nome: string; }

interface LalConfig {
  id: string;
  apelido: string;
  operadoraId: string;
  mapeamentoId: string;
  tipoMatch: 'protocolo' | 'cpf';
  arquivo?: File | null;
  csvRows?: Record<string, string>[];
  csvHeaders?: string[];
  imported: boolean;
  importResult?: { total: number; agrupados: number; combos: number };
}

interface Props {
  comissionamentoId: string;
}

export function StepLinhaALinha({ comissionamentoId }: Props) {
  const [lals, setLals] = useState<LalConfig[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [mapeamentos, setMapeamentos] = useState<MapeamentoColunas[]>([]);
  const [existingLals, setExistingLals] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const load = async () => {
      const [opRes, mapRes, lalRes] = await Promise.all([
        supabase.from('operadoras').select('id, nome').eq('ativa', true).order('nome'),
        supabase.from('mapeamento_colunas').select('*').order('nome'),
        supabase.from('comissionamento_lal').select('*').eq('comissionamento_id', comissionamentoId),
      ]);
      if (opRes.data) setOperadoras(opRes.data);
      if (mapRes.data) setMapeamentos(mapRes.data as MapeamentoColunas[]);
      if (lalRes.data) setExistingLals(lalRes.data);
    };
    load();
  }, [comissionamentoId]);

  const addLal = () => {
    setLals(prev => [...prev, {
      id: crypto.randomUUID(),
      apelido: '',
      operadoraId: operadoras[0]?.id || '',
      mapeamentoId: '',
      tipoMatch: 'protocolo',
      imported: false,
    }]);
  };

  const updateLal = (id: string, updates: Partial<LalConfig>) => {
    setLals(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const removeLal = (id: string) => {
    setLals(prev => prev.filter(l => l.id !== id));
  };

  // Uses robust RFC 4180 parseCSV from lib

  const handleFile = async (lalId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const content = await f.text();
    const { headers, rows } = parseCSV(content);
    if (headers.length === 0) { toast.error('Arquivo vazio'); return; }
    updateLal(lalId, { arquivo: f, csvHeaders: headers, csvRows: rows });
    toast.success(`${rows.length} linhas encontradas`);
  };

  // Auto-select mapeamento when operadora changes
  const getMapeamentosForOperadora = (opId: string) => mapeamentos.filter(m => m.operadora_id === opId);

  // normalizeCpfCnpj imported from lib

  const processarLal = async (lal: LalConfig) => {
    if (!lal.csvRows || !lal.mapeamentoId || !lal.apelido.trim()) {
      toast.error('Preencha todos os campos e selecione um arquivo');
      return;
    }

    const mapeamento = mapeamentos.find(m => m.id === lal.mapeamentoId);
    if (!mapeamento) { toast.error('Mapeamento não encontrado'); return; }
    const operadora = operadoras.find(o => o.id === lal.operadoraId);
    if (!operadora) { toast.error('Operadora não encontrada'); return; }

    setIsProcessing(true);
    try {
      const map = mapeamento.mapeamento as unknown as Record<CampoSistema, string>;

      // Import each row individually (no grouping)
      const linhas = lal.csvRows!.map(row => {
        const cpf = row[map.cpf_cnpj] || null;
        const protocolo = row[map.protocolo_operadora] || null;
        const valorStr = map.valor && row[map.valor] ? row[map.valor].replace(',', '.').replace(/[^\d.-]/g, '') : '';
        const valor = valorStr ? parseFloat(valorStr) : null;
        const plano = map.plano ? row[map.plano] : null;

        return {
          operadora: operadora.nome,
          protocolo_operadora: protocolo,
          cpf_cnpj: cpf,
          cliente_nome: map.cliente_nome ? row[map.cliente_nome] : null,
          telefone: map.telefone ? row[map.telefone] : null,
          plano: plano || null,
          valor: valor,
          valor_lq: valor,
          tipo_plano: plano || null,
          data_status: map.data_status ? parseDate(row[map.data_status]) : null,
          status_operadora: ((map.status_operadora ? row[map.status_operadora] : 'pendente') || 'pendente') as 'aprovado' | 'instalado' | 'cancelado' | 'pendente',
          quinzena_ref: map.quinzena_ref ? row[map.quinzena_ref] : null,
          arquivo_origem: lal.arquivo?.name || null,
          apelido: lal.apelido.trim(),
        };
      });

      // Insert linhas
      for (let i = 0; i < linhas.length; i += 500) {
        const batch = linhas.slice(i, i + 500);
        const { error } = await supabase.from('linha_operadora').insert(batch);
        if (error) throw error;
      }

      // Register LAL in comissionamento_lal
      await supabase.from('comissionamento_lal').insert({
        comissionamento_id: comissionamentoId,
        apelido: lal.apelido.trim(),
        operadora_id: lal.operadoraId,
        mapeamento_id: lal.mapeamentoId,
        tipo_match: lal.tipoMatch,
        arquivo_nome: lal.arquivo?.name || null,
        qtd_registros: linhas.length,
      });

      updateLal(lal.id, {
        imported: true,
        importResult: { total: lal.csvRows!.length, agrupados: linhas.length, combos: 0 },
      });
      toast.success(`${linhas.length} registros importados`);
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {existingLals.length > 0 && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            {existingLals.length} LAL(s) já importados: {existingLals.map(l => l.apelido).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      <Button size="sm" variant="outline" onClick={addLal} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Adicionar Linha a Linha
      </Button>

      {lals.map((lal, idx) => {
        const mapsForOp = getMapeamentosForOperadora(lal.operadoraId);
        return (
          <Card key={lal.id} className={lal.imported ? 'border-success/50' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  LAL {idx + 1}: {lal.apelido || '(sem apelido)'}
                  {lal.imported && <Badge className="bg-success/20 text-success text-xs">Importado</Badge>}
                </CardTitle>
                {!lal.imported && (
                  <Button variant="ghost" size="icon" onClick={() => removeLal(lal.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {lal.imported && lal.importResult && (
                <div className="flex gap-4 text-sm">
                  <span>Linhas CSV: <strong>{lal.importResult.total}</strong></span>
                  <span>Registros: <strong>{lal.importResult.agrupados}</strong></span>
                  <span>COMBOs: <strong>{lal.importResult.combos}</strong></span>
                </div>
              )}

              {!lal.imported && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Apelido *</Label>
                      <Input
                        value={lal.apelido}
                        onChange={e => updateLal(lal.id, { apelido: e.target.value })}
                        placeholder="Ex: LAL_CLARO_MAR26"
                        className="h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Operadora *</Label>
                      <Select
                        value={lal.operadoraId}
                        onValueChange={v => {
                          updateLal(lal.id, { operadoraId: v, mapeamentoId: '' });
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {operadoras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Mapeamento *</Label>
                      <Select value={lal.mapeamentoId} onValueChange={v => updateLal(lal.id, { mapeamentoId: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {mapsForOp.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                          {mapsForOp.length === 0 && (
                            <SelectItem value="__none" disabled>Nenhum mapeamento para esta operadora</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Tipo de Match *</Label>
                      <Select value={lal.tipoMatch} onValueChange={(v: 'protocolo' | 'cpf') => updateLal(lal.id, { tipoMatch: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="protocolo">Protocolo</SelectItem>
                          <SelectItem value="cpf">CPF/CNPJ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* File */}
                  <div className="flex gap-2 items-center">
                    <Button size="sm" variant="outline" onClick={() => fileRefs.current[lal.id]?.click()}>
                      <Upload className="h-4 w-4 mr-1" /> Arquivo CSV
                    </Button>
                    <input
                      ref={el => { fileRefs.current[lal.id] = el; }}
                      type="file" accept=".csv" className="hidden"
                      onChange={e => handleFile(lal.id, e)}
                    />
                    {lal.arquivo && (
                      <span className="text-xs text-muted-foreground">{lal.arquivo.name} ({lal.csvRows?.length || 0} linhas)</span>
                    )}
                  </div>

                  {/* Preview */}
                  {lal.csvRows && lal.csvRows.length > 0 && (
                    <div className="overflow-x-auto max-h-40 border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {(lal.csvHeaders || []).slice(0, 6).map(h => (
                              <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lal.csvRows.slice(0, 5).map((row, i) => (
                            <TableRow key={i}>
                              {(lal.csvHeaders || []).slice(0, 6).map(h => (
                                <TableCell key={h} className="text-xs max-w-[150px] truncate">{row[h]}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <Button
                    onClick={() => processarLal(lal)}
                    disabled={isProcessing || !lal.apelido.trim() || !lal.mapeamentoId || !lal.csvRows}
                    size="sm" className="w-full"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Importar LAL
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {lals.length === 0 && existingLals.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Adicione um Linha a Linha usando o botão acima.
        </div>
      )}
    </div>
  );
}
