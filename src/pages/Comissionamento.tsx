import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ShoppingCart, CheckCircle, TrendingDown, DollarSign,
  Plus, RefreshCw, Loader2, GitCompare, RotateCcw,
  FileSpreadsheet, Receipt, Trash2, FileDown,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ComissionamentoWizard } from '@/components/comissionamento/ComissionamentoWizard';

interface Comissionamento {
  id: string;
  nome: string;
  competencia: string;
  status: 'rascunho' | 'em_andamento' | 'finalizado';
  created_at: string;
}

interface ComissionamentoStats {
  totalVendas: number;
  vendasInstaladas: number;
  vendasConciliadas: number;
  receitaInterna: number;
  receitaConciliada: number;
  totalEstornos: number;
  churn: number;
  receitaLiquida: number;
}

interface VendedorRow {
  vendedor_nome: string;
  receita_interna: number;
  receita_lal: number;
  estorno: number;
  churn: number;
  receita_liquida: number;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const statusVariant: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  em_andamento: 'bg-warning/20 text-warning',
  finalizado: 'bg-success/20 text-success',
};

export default function ComissionamentoPage() {
  const { user } = useAuth();
  const [comissionamentos, setComissionamentos] = useState<Comissionamento[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<ComissionamentoStats | null>(null);
  const [vendedorRows, setVendedorRows] = useState<VendedorRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<'criar' | 'atualizar'>('criar');

  const loadComissionamentos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('comissionamentos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComissionamentos(data || []);

      if (!selectedId && data && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar comissionamentos');
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  const loadStats = useCallback(async (comId: string) => {
    if (!comId) return;
    setStatsLoading(true);
    try {
      // Fetch ALL comissionamento_vendas using recursive batching
      const allRows: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('comissionamento_vendas')
          .select(`
            status_pag,
            receita_interna,
            receita_lal,
            receita_descontada,
            venda_interna_id,
            vendas_internas!comissionamento_vendas_venda_interna_id_fkey(
              status_make,
              valor,
              usuarios!vendas_internas_usuario_id_fkey(nome)
            )
          `)
          .eq('comissionamento_id', comId)
          .range(offset, offset + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < batchSize) break;
        offset += batchSize;
      }

      const rows = allRows;
      const totalVendas = rows.length;
      let vendasInstaladas = 0;
      let vendasConciliadas = 0;
      let receitaInterna = 0;
      let receitaConciliada = 0;
      let totalEstornos = 0;
      let churn = 0;

      // Vendedor aggregation
      const vendedorMap = new Map<string, VendedorRow>();

      for (const row of rows) {
        const vi = row.vendas_internas as any;
        const statusMake = (vi?.status_make || '').toLowerCase();
        const isInstalada = statusMake.startsWith('instalad');
        const isChurn = statusMake.startsWith('churn');
        const vendedorNome = vi?.usuarios?.nome || 'Não identificado';

        if (isInstalada) vendasInstaladas++;
        const churnVal = isChurn ? Number(row.receita_interna || vi?.valor || 0) : 0;
        if (isChurn) churn += churnVal;

        receitaInterna += Number(row.receita_interna || 0);

        let lalVal = 0;
        if (row.status_pag === 'OK') {
          vendasConciliadas++;
          lalVal = Number(row.receita_lal || row.receita_interna || 0);
          receitaConciliada += lalVal;
        }

        const estornoVal = Number(row.receita_descontada || 0);
        totalEstornos += estornoVal;

        // Aggregate per vendedor
        if (!vendedorMap.has(vendedorNome)) {
          vendedorMap.set(vendedorNome, {
            vendedor_nome: vendedorNome,
            receita_interna: 0,
            receita_lal: 0,
            estorno: 0,
            churn: 0,
            receita_liquida: 0,
          });
        }
        const vr = vendedorMap.get(vendedorNome)!;
        vr.receita_interna += Number(row.receita_interna || 0);
        vr.receita_lal += lalVal;
        vr.estorno += estornoVal;
        vr.churn += churnVal;
      }

      // Calculate receita_liquida per vendedor
      for (const vr of vendedorMap.values()) {
        vr.receita_liquida = vr.receita_lal - vr.estorno - vr.churn;
      }

      const receitaLiquida = receitaConciliada - totalEstornos - churn;

      setStats({
        totalVendas,
        vendasInstaladas,
        vendasConciliadas,
        receitaInterna,
        receitaConciliada,
        totalEstornos,
        churn,
        receitaLiquida,
      });

      setVendedorRows(
        Array.from(vendedorMap.values()).sort((a, b) => b.receita_liquida - a.receita_liquida)
      );
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar estatísticas');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComissionamentos();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadStats(selectedId);
    }
  }, [selectedId, loadStats]);

  const selectedCom = comissionamentos.find(c => c.id === selectedId);

  const handleOpenWizard = (mode: 'criar' | 'atualizar') => {
    setWizardMode(mode);
    setWizardOpen(true);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    loadComissionamentos();
    if (selectedId) loadStats(selectedId);
  };

  const handleDeleteComissionamento = async () => {
    if (!selectedId) return;
    try {
      const { error } = await supabase
        .from('comissionamentos')
        .delete()
        .eq('id', selectedId);
      if (error) throw error;
      toast.success('Comissionamento excluído com sucesso');
      setSelectedId('');
      setStats(null);
      setVendedorRows([]);
      loadComissionamentos();
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + err.message);
    }
  };

  const [isExportingReport, setIsExportingReport] = useState(false);

  const buildCsvBlob = (headers: string[], rows: string[][]) => {
    const bom = '\uFEFF';
    const csv = [headers, ...rows].map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    return new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportRelatorio = useCallback(async () => {
    if (!selectedId) return;
    setIsExportingReport(true);
    try {
      // 1. Get LAL apelidos
      const { data: lalRows, error: lalErr } = await supabase
        .from('comissionamento_lal')
        .select('apelido')
        .eq('comissionamento_id', selectedId);
      if (lalErr) throw lalErr;
      const apelidos = lalRows?.map(r => r.apelido) || [];

      // 2. Fetch all linha_operadora
      let linhasOperadora: any[] = [];
      if (apelidos.length > 0) {
        for (let i = 0; i < apelidos.length; i += 30) {
          const batch = apelidos.slice(i, i + 30);
          let offset = 0;
          while (true) {
            const { data, error } = await supabase
              .from('linha_operadora')
              .select('*')
              .in('apelido', batch)
              .range(offset, offset + 999);
            if (error) throw error;
            if (!data || data.length === 0) break;
            linhasOperadora = linhasOperadora.concat(data);
            if (data.length < 1000) break;
            offset += 1000;
          }
        }
      }

      // 3. Fetch all comissionamento_vendas with joins
      let allComVendas: any[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('comissionamento_vendas')
          .select(`
            id, venda_interna_id, status_pag, receita_interna, receita_lal, receita_descontada,
            lal_apelido, comissionamento_desconto,
            vendas_internas!comissionamento_vendas_venda_interna_id_fkey(
              cliente_nome, cpf_cnpj, protocolo_interno, status_make, data_venda, data_instalacao,
              telefone, plano, valor, identificador_make, status_interno, observacoes,
              usuario_id,
              usuarios!vendas_internas_usuario_id_fkey(id, nome),
              operadoras!vendas_internas_operadora_id_fkey(nome),
              empresas!vendas_internas_empresa_id_fkey(nome)
            )
          `)
          .eq('comissionamento_id', selectedId)
          .range(offset, offset + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allComVendas = allComVendas.concat(data);
        if (data.length < 1000) break;
        offset += 1000;
      }

      // 4. Fetch conciliacoes
      const vendaIds = allComVendas.map((r: any) => r.venda_interna_id);
      let conciliacoes: any[] = [];
      for (let i = 0; i < vendaIds.length; i += 50) {
        const batch = vendaIds.slice(i, i + 50);
        const { data, error } = await supabase
          .from('conciliacoes')
          .select('*')
          .in('venda_interna_id', batch);
        if (error) throw error;
        conciliacoes = conciliacoes.concat(data || []);
      }

      // Build indexes
      const concByLinhaId = new Map<string, any>();
      const concByVendaId = new Map<string, any>();
      for (const c of conciliacoes) {
        concByLinhaId.set(c.linha_operadora_id, c);
        concByVendaId.set(c.venda_interna_id, c);
      }

      const vendaByVendaId = new Map<string, any>();
      for (const cv of allComVendas) {
        vendaByVendaId.set(cv.venda_interna_id, cv);
      }

      const linhaById = new Map<string, any>();
      for (const l of linhasOperadora) {
        linhaById.set(l.id, l);
      }

      // ===== FILE 1: Linha a Linha + Conciliação =====
      const h1 = [
        'Operadora', 'Protocolo Operadora', 'CPF/CNPJ', 'Cliente', 'Telefone',
        'Plano', 'Tipo Plano', 'Valor', 'Valor Make', 'Valor LQ',
        'Data Status', 'Status Operadora', 'Quinzena Ref', 'Apelido Lote', 'Arquivo Origem',
        'Status Conciliação', 'Tipo Match', 'Score Match',
        'Venda ID', 'Vendedor', 'Protocolo Interno', 'Data Venda', 'Data Instalação',
        'Status Make', 'Operadora Interna', 'Empresa', 'Valor Venda Interna',
      ];
      const rows1 = linhasOperadora.map((l: any) => {
        const conc = concByLinhaId.get(l.id);
        const cv = conc ? vendaByVendaId.get(conc.venda_interna_id) : null;
        const vi = cv?.vendas_internas;
        return [
          l.operadora || '', l.protocolo_operadora || '', l.cpf_cnpj || '',
          l.cliente_nome || '', l.telefone || '', l.plano || '', l.tipo_plano || '',
          l.valor?.toString() || '', l.valor_make?.toString() || '', l.valor_lq?.toString() || '',
          l.data_status || '', l.status_operadora || '', l.quinzena_ref || '',
          l.apelido || '', l.arquivo_origem || '',
          conc ? (conc.status_final === 'conciliado' ? 'Encontrado' : 'Divergente') : 'Não encontrado',
          conc?.tipo_match || '', conc?.score_match?.toString() || '',
          cv?.venda_interna_id || '', vi?.usuarios?.nome || '',
          vi?.protocolo_interno || '', vi?.data_venda || '', vi?.data_instalacao || '',
          vi?.status_make || '', vi?.operadoras?.nome || '', vi?.empresas?.nome || '',
          vi?.valor?.toString() || '',
        ];
      });

      // ===== FILE 2: Vendas Internas + Conciliação =====
      const h2 = [
        'Vendedor', 'Empresa', 'Protocolo Interno', 'Identificador Make', 'CPF/CNPJ', 'Cliente',
        'Telefone', 'Operadora', 'Plano', 'Data Venda', 'Data Instalação',
        'Status Interno', 'Status Make', 'Valor', 'Observações',
        'Status Pag', 'Receita Interna', 'Receita LAL', 'LAL Apelido', 'Estorno', 'Comiss. Desconto',
        'Status Conciliação', 'Tipo Match', 'Score Match',
        'LAL Protocolo Operadora', 'LAL CPF/CNPJ', 'LAL Cliente', 'LAL Plano',
        'LAL Valor', 'LAL Data Status', 'LAL Status Operadora', 'LAL Quinzena',
      ];
      const rows2 = allComVendas.map((cv: any) => {
        const vi = cv.vendas_internas;
        const conc = concByVendaId.get(cv.venda_interna_id);
        const linha = conc ? linhaById.get(conc.linha_operadora_id) : null;
        return [
          vi?.usuarios?.nome || '', vi?.empresas?.nome || '',
          vi?.protocolo_interno || '', vi?.identificador_make || '',
          vi?.cpf_cnpj || '', vi?.cliente_nome || '',
          vi?.telefone || '', vi?.operadoras?.nome || '', vi?.plano || '',
          vi?.data_venda || '', vi?.data_instalacao || '',
          vi?.status_interno || '', vi?.status_make || '',
          vi?.valor?.toString() || '', vi?.observacoes || '',
          cv.status_pag || '', cv.receita_interna?.toString() || '',
          cv.receita_lal?.toString() || '', cv.lal_apelido || '',
          cv.receita_descontada?.toString() || '', cv.comissionamento_desconto || '',
          conc ? (conc.status_final === 'conciliado' ? 'Encontrado' : 'Divergente') : 'Não encontrado no Linha a Linha',
          conc?.tipo_match || '', conc?.score_match?.toString() || '',
          linha?.protocolo_operadora || '', linha?.cpf_cnpj || '',
          linha?.cliente_nome || '', linha?.plano || '',
          linha?.valor?.toString() || '', linha?.data_status || '',
          linha?.status_operadora || '', linha?.quinzena_ref || '',
        ];
      });

      const comNome = selectedCom?.nome?.replace(/\s+/g, '_') || 'comissionamento';
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      downloadBlob(buildCsvBlob(h1, rows1), `${comNome}_LAL_conciliacao_${dateStr}.csv`);
      await new Promise(r => setTimeout(r, 500));
      downloadBlob(buildCsvBlob(h2, rows2), `${comNome}_vendas_internas_conciliacao_${dateStr}.csv`);

      toast.success(`Relatório gerado: ${rows1.length} linhas LAL + ${rows2.length} vendas internas`);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao gerar relatório: ' + err.message);
    } finally {
      setIsExportingReport(false);
    }
  }, [selectedId, selectedCom]);

  return (
    <AppLayout title="Comissionamento">
      <div className="space-y-6">
        {/* Seletor + Ações */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Comissionamento
                </label>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando...
                  </div>
                ) : (
                  <Select value={selectedId} onValueChange={setSelectedId}>
                    <SelectTrigger className="w-full sm:w-[400px]">
                      <SelectValue placeholder="Selecione um comissionamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {comissionamentos.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            {c.nome}
                            <span className="text-xs text-muted-foreground">({c.competencia})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedCom && (
                <Badge className={cn('shrink-0', statusVariant[selectedCom.status])}>
                  {statusLabels[selectedCom.status]}
                </Badge>
              )}

              <div className="flex gap-2 shrink-0 flex-wrap">
                <Button onClick={() => handleOpenWizard('criar')} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Novo
                </Button>
                {selectedId && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleExportRelatorio}
                      disabled={isExportingReport}
                    >
                      {isExportingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                      Baixar Relatório
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir Comissionamento</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir o comissionamento "{selectedCom?.nome}"? 
                            Todas as vendas vinculadas, fontes, LALs e dados de conciliação deste comissionamento serão removidos permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDeleteComissionamento} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        {selectedId && (
          statsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : stats ? (
            <>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                <StatCard
                  title="Vendas Totais"
                  value={stats.totalVendas.toString()}
                  icon={<FileSpreadsheet className="h-4 w-4" />}
                />
                <StatCard
                  title="Instaladas"
                  value={stats.vendasInstaladas.toString()}
                  icon={<ShoppingCart className="h-4 w-4" />}
                />
                <StatCard
                  title="Churn"
                  value={formatBRL(stats.churn)}
                  icon={<TrendingDown className="h-4 w-4" />}
                  className="text-destructive"
                />
                <StatCard
                  title="Conciliadas"
                  value={stats.vendasConciliadas.toString()}
                  icon={<GitCompare className="h-4 w-4" />}
                />
                <StatCard
                  title="Receita Bruta"
                  value={formatBRL(stats.receitaInterna)}
                  icon={<DollarSign className="h-4 w-4" />}
                />
                <StatCard
                  title="Estornos"
                  value={formatBRL(stats.totalEstornos)}
                  icon={<RotateCcw className="h-4 w-4" />}
                  className="text-destructive"
                />
                <StatCard
                  title="Receita Líquida"
                  value={formatBRL(stats.receitaLiquida)}
                  icon={<Receipt className="h-4 w-4" />}
                  className={stats.receitaLiquida >= 0 ? 'text-success' : 'text-destructive'}
                />
              </div>

              {/* Vendedor Breakdown Table */}
              {vendedorRows.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Detalhamento por Vendedor</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Vendedor</TableHead>
                            <TableHead className="text-xs text-right">Receita Interna</TableHead>
                            <TableHead className="text-xs text-right">Receita LAL</TableHead>
                            <TableHead className="text-xs text-right">Estorno</TableHead>
                            <TableHead className="text-xs text-right">Churn</TableHead>
                            <TableHead className="text-xs text-right">Receita Líquida</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendedorRows.map((vr, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm font-medium">{vr.vendedor_nome}</TableCell>
                              <TableCell className="text-sm text-right">{formatBRL(vr.receita_interna)}</TableCell>
                              <TableCell className="text-sm text-right">{formatBRL(vr.receita_lal)}</TableCell>
                              <TableCell className="text-sm text-right text-destructive">{formatBRL(vr.estorno)}</TableCell>
                              <TableCell className="text-sm text-right text-destructive">{formatBRL(vr.churn)}</TableCell>
                              <TableCell className={cn("text-sm text-right font-bold", vr.receita_liquida >= 0 ? 'text-success' : 'text-destructive')}>
                                {formatBRL(vr.receita_liquida)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              Nenhum dado encontrado para este comissionamento.
            </div>
          )
        )}

        {!selectedId && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Receipt className="h-12 w-12 opacity-30" />
            <p>
              {comissionamentos.length === 0
                ? 'Nenhum comissionamento encontrado. Crie o primeiro!'
                : 'Selecione um comissionamento acima para visualizar.'}
            </p>
          </div>
        )}
      </div>

      {/* Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={(open) => {
        // Don't allow closing via overlay/X - let the wizard handle it
        if (!open) return;
        setWizardOpen(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {wizardMode === 'criar' ? 'Novo Comissionamento' : 'Atualizar Comissionamento'}
            </DialogTitle>
          </DialogHeader>
          <ComissionamentoWizard
            mode={wizardMode}
            comissionamentoId={wizardMode === 'atualizar' ? selectedId : undefined}
            onClose={handleWizardClose}
          />
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function StatCard({
  title,
  value,
  icon,
  className,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={cn('text-lg font-bold', className)}>{value}</div>
      </CardContent>
    </Card>
  );
}
