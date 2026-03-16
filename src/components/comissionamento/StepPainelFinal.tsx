import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Loader2, Download, DollarSign, Users, RotateCcw, TrendingDown, Receipt, FileDown, Grid3X3,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Props {
  comissionamentoId: string;
}

interface VendaRow {
  id: string;
  venda_interna_id: string;
  status_pag: string | null;
  receita_interna: number | null;
  receita_lal: number | null;
  receita_descontada: number | null;
  lal_apelido: string | null;
  comissionamento_desconto: string | null;
  cliente_nome?: string;
  cpf_cnpj?: string;
  protocolo_interno?: string;
  status_make?: string;
  vendedor_nome?: string;
  vendedor_id?: string;
  operadora_nome?: string;
  operadora_id?: string;
  operadora_cor?: string;
  data_instalacao?: string;
}

interface VendedorResumo {
  vendedor_id: string;
  vendedor_nome: string;
  totalVendas: number;
  receitaInterna: number;
  receitaLal: number;
  estorno: number;
  churn: number;
  liquido: number;
}

interface OperadoraInfo {
  id: string;
  nome: string;
  cor_hex: string;
}

interface GridCell {
  vendas: number;
  receita: number;
  churn: number;
  estorno: number;
  liquido: number;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatCompact = (v: number) =>
  v === 0 ? '-' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

export function StepPainelFinal({ comissionamentoId }: Props) {
  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState<'grade' | 'resumo' | 'detalhes'>('grade');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('comissionamento_vendas')
          .select(`
            id, venda_interna_id, status_pag, receita_interna, receita_lal, receita_descontada,
            lal_apelido, comissionamento_desconto,
            vendas_internas!comissionamento_vendas_venda_interna_id_fkey(
              cliente_nome, cpf_cnpj, protocolo_interno, status_make, data_instalacao,
              usuario_id, operadora_id,
              usuarios!vendas_internas_usuario_id_fkey(id, nome),
              operadoras!vendas_internas_operadora_id_fkey(id, nome, cor_hex)
            )
          `)
          .eq('comissionamento_id', comissionamentoId);

        if (error) throw error;

        const mapped = (data || []).map((row: any) => {
          const vi = row.vendas_internas;
          return {
            id: row.id,
            venda_interna_id: row.venda_interna_id,
            status_pag: row.status_pag,
            receita_interna: row.receita_interna,
            receita_lal: row.receita_lal,
            receita_descontada: row.receita_descontada,
            lal_apelido: row.lal_apelido,
            comissionamento_desconto: row.comissionamento_desconto,
            cliente_nome: vi?.cliente_nome,
            cpf_cnpj: vi?.cpf_cnpj,
            protocolo_interno: vi?.protocolo_interno,
            status_make: vi?.status_make,
            vendedor_nome: vi?.usuarios?.nome,
            vendedor_id: vi?.usuarios?.id || vi?.usuario_id,
            operadora_nome: vi?.operadoras?.nome,
            operadora_id: vi?.operadoras?.id || vi?.operadora_id,
            operadora_cor: vi?.operadoras?.cor_hex || '#CBD5E1',
            data_instalacao: vi?.data_instalacao,
          };
        });

        setVendas(mapped);
      } catch (err: any) {
        toast.error('Erro: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [comissionamentoId]);

  // Unique operadoras
  const operadoras = useMemo(() => {
    const map = new Map<string, OperadoraInfo>();
    for (const v of vendas) {
      if (v.operadora_id && v.operadora_nome) {
        map.set(v.operadora_id, { id: v.operadora_id, nome: v.operadora_nome, cor_hex: v.operadora_cor || '#CBD5E1' });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [vendas]);

  // Unique vendedores
  const vendedores = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vendas) {
      const vid = v.vendedor_id || 'desconhecido';
      const vname = v.vendedor_nome || 'Desconhecido';
      if (!map.has(vid)) map.set(vid, vname);
    }
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [vendas]);

  // Grid data: vendedor x operadora
  const gridData = useMemo(() => {
    const grid = new Map<string, Map<string, GridCell>>();
    const emptyCell = (): GridCell => ({ vendas: 0, receita: 0, churn: 0, estorno: 0, liquido: 0 });

    for (const v of vendas) {
      const vid = v.vendedor_id || 'desconhecido';
      const oid = v.operadora_id || 'sem_operadora';

      if (!grid.has(vid)) grid.set(vid, new Map());
      const vendedorRow = grid.get(vid)!;
      if (!vendedorRow.has(oid)) vendedorRow.set(oid, emptyCell());
      const cell = vendedorRow.get(oid)!;

      cell.vendas++;
      cell.receita += Number(v.receita_lal || 0);
      cell.estorno += Number(v.receita_descontada || 0);
      if ((v.status_make || '').toLowerCase().startsWith('churn')) {
        cell.churn += Number(v.receita_interna || 0);
      }
    }

    // Calculate liquido
    for (const vendedorRow of grid.values()) {
      for (const cell of vendedorRow.values()) {
        cell.liquido = cell.receita - cell.estorno - cell.churn;
      }
    }

    return grid;
  }, [vendas]);

  // Totals per operadora
  const operadoraTotals = useMemo(() => {
    const totals = new Map<string, GridCell>();
    const emptyCell = (): GridCell => ({ vendas: 0, receita: 0, churn: 0, estorno: 0, liquido: 0 });

    for (const [, vendedorRow] of gridData) {
      for (const [oid, cell] of vendedorRow) {
        if (!totals.has(oid)) totals.set(oid, emptyCell());
        const t = totals.get(oid)!;
        t.vendas += cell.vendas;
        t.receita += cell.receita;
        t.churn += cell.churn;
        t.estorno += cell.estorno;
        t.liquido += cell.liquido;
      }
    }
    return totals;
  }, [gridData]);

  // Aggregate by vendedor (for resumo tab)
  const resumoPorVendedor = useMemo(() => {
    const map = new Map<string, VendedorResumo>();
    for (const v of vendas) {
      const vid = v.vendedor_id || 'desconhecido';
      const vname = v.vendedor_nome || 'Desconhecido';
      if (!map.has(vid)) {
        map.set(vid, { vendedor_id: vid, vendedor_nome: vname, totalVendas: 0, receitaInterna: 0, receitaLal: 0, estorno: 0, churn: 0, liquido: 0 });
      }
      const r = map.get(vid)!;
      r.totalVendas++;
      r.receitaInterna += Number(v.receita_interna || 0);
      r.receitaLal += Number(v.receita_lal || 0);
      r.estorno += Number(v.receita_descontada || 0);
      if ((v.status_make || '').toLowerCase().startsWith('churn')) {
        r.churn += Number(v.receita_interna || 0);
      }
    }
    for (const r of map.values()) {
      r.liquido = r.receitaLal - r.estorno - r.churn;
    }
    return Array.from(map.values()).sort((a, b) => b.liquido - a.liquido);
  }, [vendas]);

  const totals = useMemo(() => {
    return resumoPorVendedor.reduce(
      (acc, r) => ({
        totalVendas: acc.totalVendas + r.totalVendas,
        receitaInterna: acc.receitaInterna + r.receitaInterna,
        receitaLal: acc.receitaLal + r.receitaLal,
        estorno: acc.estorno + r.estorno,
        churn: acc.churn + r.churn,
        liquido: acc.liquido + r.liquido,
      }),
      { totalVendas: 0, receitaInterna: 0, receitaLal: 0, estorno: 0, churn: 0, liquido: 0 }
    );
  }, [resumoPorVendedor]);

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

  const exportCSV = () => {
    const headers = [
      'Vendedor', 'dt_atv', 'Protocolo', 'CPF', 'Cliente', 'Operadora',
      'Status Pedido', 'Status Pag', 'Receita Interna', 'Receita LAL',
      'LAL', 'Estorno', 'Comiss. Desconto',
    ];
    const rows = vendas.map(v => [
      v.vendedor_nome || '', v.data_instalacao || '', v.protocolo_interno || '',
      v.cpf_cnpj || '', v.cliente_nome || '', v.operadora_nome || '',
      v.status_make || '', v.status_pag || '',
      v.receita_interna?.toString() || '', v.receita_lal?.toString() || '',
      v.lal_apelido || '', v.receita_descontada?.toString() || '',
      v.comissionamento_desconto || '',
    ]);
    downloadBlob(buildCsvBlob(headers, rows), `comissionamento_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const exportResumoVendedor = () => {
    const headers = ['Vendedor', 'Vendas', 'Receita Interna', 'Receita LAL', 'Estorno', 'Churn', 'Receita Líquida'];
    const rows = resumoPorVendedor.map(r => [
      r.vendedor_nome, r.totalVendas.toString(), r.receitaInterna.toFixed(2),
      r.receitaLal.toFixed(2), r.estorno.toFixed(2), r.churn.toFixed(2), r.liquido.toFixed(2),
    ]);
    rows.push([
      'TOTAL', totals.totalVendas.toString(), totals.receitaInterna.toFixed(2),
      totals.receitaLal.toFixed(2), totals.estorno.toFixed(2), totals.churn.toFixed(2), totals.liquido.toFixed(2),
    ]);
    downloadBlob(buildCsvBlob(headers, rows), `resumo_vendedor_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Resumo por vendedor exportado');
  };

  const exportVendedorDetalhado = (vendedorId: string, vendedorNome: string) => {
    const vendasVendedor = vendas.filter(v => (v.vendedor_id || 'desconhecido') === vendedorId);
    const headers = [
      'Vendedor', 'dt_atv', 'Protocolo', 'CPF', 'Cliente', 'Operadora',
      'Status Pedido', 'Status Pag', 'Receita Interna', 'Receita LAL',
      'LAL', 'Estorno', 'Comiss. Desconto',
    ];
    const rows = vendasVendedor.map(v => [
      v.vendedor_nome || '', v.data_instalacao || '', v.protocolo_interno || '',
      v.cpf_cnpj || '', v.cliente_nome || '', v.operadora_nome || '',
      v.status_make || '', v.status_pag || '',
      v.receita_interna?.toString() || '', v.receita_lal?.toString() || '',
      v.lal_apelido || '', v.receita_descontada?.toString() || '',
      v.comissionamento_desconto || '',
    ]);
    const nomeArquivo = vendedorNome.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    downloadBlob(buildCsvBlob(headers, rows), `detalhado_${nomeArquivo}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success(`Detalhado de ${vendedorNome} exportado (${vendasVendedor.length} vendas)`);
  };

  const exportRelatorioComissionamento = useCallback(async () => {
    setIsExportingReport(true);
    try {
      const { data: lalRows, error: lalErr } = await supabase
        .from('comissionamento_lal')
        .select('apelido')
        .eq('comissionamento_id', comissionamentoId);
      if (lalErr) throw lalErr;
      const apelidos = lalRows?.map(r => r.apelido) || [];

      let linhasOperadora: any[] = [];
      if (apelidos.length > 0) {
        const batchSize = 30;
        for (let i = 0; i < apelidos.length; i += batchSize) {
          const batch = apelidos.slice(i, i + batchSize);
          const { data, error } = await supabase.from('linha_operadora').select('*').in('apelido', batch);
          if (error) throw error;
          linhasOperadora = linhasOperadora.concat(data || []);
        }
      }

      let allComVendas: any[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('comissionamento_vendas')
          .select('venda_interna_id, linha_operadora_id, status_pag')
          .eq('comissionamento_id', comissionamentoId)
          .range(offset, offset + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allComVendas = allComVendas.concat(data);
        if (data.length < 1000) break;
        offset += 1000;
      }

      const cvByLinhaId = new Map<string, any>();
      for (const cv of allComVendas) {
        if (cv.linha_operadora_id) cvByLinhaId.set(cv.linha_operadora_id, cv);
      }

      const vendaById = new Map<string, VendaRow>();
      for (const v of vendas) vendaById.set(v.venda_interna_id, v);

      const linhaById = new Map<string, any>();
      for (const l of linhasOperadora) linhaById.set(l.id, l);

      const h1 = [
        'Operadora', 'Protocolo Operadora', 'CPF/CNPJ', 'Cliente', 'Telefone',
        'Plano', 'Tipo Plano', 'Valor', 'Valor Make', 'Valor LQ',
        'Data Status', 'Status Operadora', 'Quinzena Ref', 'Apelido Lote', 'Arquivo Origem',
        'Status Conciliação', 'Status Pag',
        'Venda ID', 'Vendedor', 'Protocolo Interno', 'Data Venda', 'Data Instalação',
        'Status Make', 'Empresa/Operadora', 'Valor Venda Interna',
      ];
      const rows1 = linhasOperadora.map(l => {
        const cv = cvByLinhaId.get(l.id);
        const venda = cv ? vendaById.get(cv.venda_interna_id) : null;
        const encontrado = !!cv;
        return [
          l.operadora || '', l.protocolo_operadora || '', l.cpf_cnpj || '',
          l.cliente_nome || '', l.telefone || '', l.plano || '', l.tipo_plano || '',
          l.valor?.toString() || '', l.valor_make?.toString() || '', l.valor_lq?.toString() || '',
          l.data_status || '', l.status_operadora || '', l.quinzena_ref || '',
          l.apelido || '', l.arquivo_origem || '',
          encontrado ? 'Encontrado' : 'Não encontrado',
          cv?.status_pag || '',
          venda?.venda_interna_id || '', venda?.vendedor_nome || '',
          venda?.protocolo_interno || '', '', venda?.data_instalacao || '',
          venda?.status_make || '', venda?.operadora_nome || '',
          venda?.receita_interna?.toString() || '',
        ];
      });

      const h2 = [
        'Vendedor', 'Protocolo Interno', 'CPF/CNPJ', 'Cliente', 'Operadora',
        'Data Instalação', 'Status Make', 'Valor', 'Status Pag', 'Receita Interna',
        'Receita LAL', 'LAL Apelido', 'Estorno', 'Comiss. Desconto',
        'Status Conciliação',
        'LAL Protocolo Operadora', 'LAL CPF/CNPJ', 'LAL Cliente', 'LAL Plano',
        'LAL Valor', 'LAL Data Status', 'LAL Status Operadora', 'LAL Quinzena',
      ];
      const rows2 = vendas.map(v => {
        const cv = allComVendas.find((c: any) => c.venda_interna_id === v.venda_interna_id);
        const linha = cv?.linha_operadora_id ? linhaById.get(cv.linha_operadora_id) : null;
        const encontrado = !!linha;
        return [
          v.vendedor_nome || '', v.protocolo_interno || '', v.cpf_cnpj || '',
          v.cliente_nome || '', v.operadora_nome || '', v.data_instalacao || '',
          v.status_make || '', v.receita_interna?.toString() || '',
          v.status_pag || '', v.receita_interna?.toString() || '',
          v.receita_lal?.toString() || '', v.lal_apelido || '',
          v.receita_descontada?.toString() || '', v.comissionamento_desconto || '',
          encontrado ? 'Encontrado' : 'Não encontrado no Linha a Linha',
          linha?.protocolo_operadora || '', linha?.cpf_cnpj || '',
          linha?.cliente_nome || '', linha?.plano || '',
          linha?.valor?.toString() || '', linha?.data_status || '',
          linha?.status_operadora || '', linha?.quinzena_ref || '',
        ];
      });

      const dateStr = format(new Date(), 'yyyy-MM-dd');
      downloadBlob(buildCsvBlob(h1, rows1), `relatorio_LAL_conciliacao_${dateStr}.csv`);
      await new Promise(r => setTimeout(r, 500));
      downloadBlob(buildCsvBlob(h2, rows2), `relatorio_vendas_internas_conciliacao_${dateStr}.csv`);

      toast.success(`Relatório gerado: ${rows1.length} linhas LAL + ${rows2.length} vendas internas`);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao gerar relatório: ' + err.message);
    } finally {
      setIsExportingReport(false);
    }
  }, [comissionamentoId, vendas]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const renderGridCell = (cell: GridCell | undefined, cor: string) => {
    if (!cell || cell.vendas === 0) return <td className="border border-border p-1.5 text-center text-xs text-muted-foreground">-</td>;
    return (
      <td className="border border-border p-1.5 text-xs">
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vendas:</span>
            <span className="font-medium">{cell.vendas}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Receita:</span>
            <span className="font-medium">{formatCompact(cell.receita)}</span>
          </div>
          {cell.churn > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Churn:</span>
              <span className="text-destructive font-medium">{formatCompact(cell.churn)}</span>
            </div>
          )}
          {cell.estorno > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estorno:</span>
              <span className="text-destructive font-medium">{formatCompact(cell.estorno)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border/50 pt-0.5">
            <span className="text-muted-foreground font-medium">Líquido:</span>
            <span className={cn("font-bold", cell.liquido >= 0 ? 'text-success' : 'text-destructive')}>
              {formatCompact(cell.liquido)}
            </span>
          </div>
        </div>
      </td>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Vendas</p>
          <p className="text-lg font-bold">{totals.totalVendas}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Receita Interna</p>
          <p className="text-sm font-bold">{formatBRL(totals.receitaInterna)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Receita LAL</p>
          <p className="text-sm font-bold text-primary">{formatBRL(totals.receitaLal)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Estornos</p>
          <p className="text-sm font-bold text-destructive">{formatBRL(totals.estorno)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Churn</p>
          <p className="text-sm font-bold text-destructive">{formatBRL(totals.churn)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Receita Líquida</p>
          <p className={cn("text-sm font-bold", totals.liquido >= 0 ? 'text-success' : 'text-destructive')}>
            {formatBRL(totals.liquido)}
          </p>
        </Card>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={activeView === 'grade' ? 'default' : 'outline'}
          onClick={() => setActiveView('grade')}
          className="gap-1.5"
        >
          <Grid3X3 className="h-4 w-4" />
          Grade por Operadora
        </Button>
        <Button
          size="sm"
          variant={activeView === 'resumo' ? 'default' : 'outline'}
          onClick={() => setActiveView('resumo')}
          className="gap-1.5"
        >
          <Users className="h-4 w-4" />
          Resumo por Vendedor
        </Button>
        <Button
          size="sm"
          variant={activeView === 'detalhes' ? 'default' : 'outline'}
          onClick={() => setActiveView('detalhes')}
          className="gap-1.5"
        >
          <Receipt className="h-4 w-4" />
          Detalhes
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportResumoVendedor} disabled={resumoPorVendedor.length === 0} className="gap-1.5">
            <Users className="h-4 w-4" />
            Resumo Vendedor
          </Button>
          <Button size="sm" variant="default" onClick={exportRelatorioComissionamento} disabled={isExportingReport} className="gap-1.5">
            {isExportingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Baixar Relatório
          </Button>
        </div>
      </div>

      {/* Grade por Operadora */}
      {activeView === 'grade' && operadoras.length > 0 && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-border p-2 text-left bg-muted font-medium sticky left-0 z-10 min-w-[140px]">
                  Vendedor
                </th>
                {operadoras.map(op => (
                  <th
                    key={op.id}
                    className="border border-border p-2 text-center font-medium min-w-[160px]"
                    style={{
                      backgroundColor: `${op.cor_hex}18`,
                      borderBottomColor: op.cor_hex,
                      borderBottomWidth: '3px',
                    }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: op.cor_hex }} />
                      {op.nome}
                    </div>
                  </th>
                ))}
                <th className="border border-border p-2 text-center bg-muted font-bold min-w-[160px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map(vend => {
                const vendedorRow = gridData.get(vend.id);
                const vendedorTotal: GridCell = { vendas: 0, receita: 0, churn: 0, estorno: 0, liquido: 0 };
                if (vendedorRow) {
                  for (const cell of vendedorRow.values()) {
                    vendedorTotal.vendas += cell.vendas;
                    vendedorTotal.receita += cell.receita;
                    vendedorTotal.churn += cell.churn;
                    vendedorTotal.estorno += cell.estorno;
                    vendedorTotal.liquido += cell.liquido;
                  }
                }

                return (
                  <tr key={vend.id}>
                    <td className="border border-border p-2 font-medium bg-muted sticky left-0 z-10 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          onClick={() => exportVendedorDetalhado(vend.id, vend.nome)}
                        >
                          <FileDown className="h-3 w-3" />
                        </Button>
                        {vend.nome}
                      </div>
                    </td>
                    {operadoras.map(op => {
                      const cell = vendedorRow?.get(op.id);
                      return (
                        <td
                          key={op.id}
                          className="border border-border p-1.5"
                          style={{ backgroundColor: cell && cell.vendas > 0 ? `${op.cor_hex}08` : undefined }}
                        >
                          {!cell || cell.vendas === 0 ? (
                            <span className="text-muted-foreground text-center block">-</span>
                          ) : (
                            <div className="space-y-0.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Vnd:</span>
                                <span className="font-medium">{cell.vendas}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Rec:</span>
                                <span className="font-medium">{formatCompact(cell.receita)}</span>
                              </div>
                              {cell.churn > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Chr:</span>
                                  <span className="text-destructive">{formatCompact(cell.churn)}</span>
                                </div>
                              )}
                              {cell.estorno > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Est:</span>
                                  <span className="text-destructive">{formatCompact(cell.estorno)}</span>
                                </div>
                              )}
                              <div className="flex justify-between border-t pt-0.5" style={{ borderColor: `${op.cor_hex}40` }}>
                                <span className="font-medium">Liq:</span>
                                <span className={cn("font-bold", cell.liquido >= 0 ? 'text-success' : 'text-destructive')}>
                                  {formatCompact(cell.liquido)}
                                </span>
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-border p-1.5 bg-muted/50">
                      <div className="space-y-0.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vnd:</span>
                          <span className="font-bold">{vendedorTotal.vendas}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Rec:</span>
                          <span className="font-bold">{formatCompact(vendedorTotal.receita)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-0.5">
                          <span className="font-bold">Liq:</span>
                          <span className={cn("font-bold", vendedorTotal.liquido >= 0 ? 'text-success' : 'text-destructive')}>
                            {formatCompact(vendedorTotal.liquido)}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Total row */}
              <tr className="bg-muted font-bold">
                <td className="border border-border p-2 font-bold sticky left-0 z-10 bg-muted text-xs">TOTAL</td>
                {operadoras.map(op => {
                  const t = operadoraTotals.get(op.id);
                  return (
                    <td
                      key={op.id}
                      className="border border-border p-1.5"
                      style={{ backgroundColor: `${op.cor_hex}15` }}
                    >
                      {!t || t.vendas === 0 ? (
                        <span className="text-muted-foreground text-center block">-</span>
                      ) : (
                        <div className="space-y-0.5 text-xs">
                          <div className="flex justify-between">
                            <span>Vnd:</span>
                            <span className="font-bold">{t.vendas}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Rec:</span>
                            <span className="font-bold">{formatCompact(t.receita)}</span>
                          </div>
                          <div className="flex justify-between border-t pt-0.5" style={{ borderColor: `${op.cor_hex}60` }}>
                            <span className="font-bold">Liq:</span>
                            <span className={cn("font-bold", t.liquido >= 0 ? 'text-success' : 'text-destructive')}>
                              {formatCompact(t.liquido)}
                            </span>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="border border-border p-1.5 bg-muted">
                  <div className="space-y-0.5 text-xs">
                    <div className="flex justify-between">
                      <span>Vnd:</span>
                      <span className="font-bold">{totals.totalVendas}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rec:</span>
                      <span className="font-bold">{formatCompact(totals.receitaLal)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-0.5">
                      <span className="font-bold">Liq:</span>
                      <span className={cn("font-bold", totals.liquido >= 0 ? 'text-success' : 'text-destructive')}>
                        {formatCompact(totals.liquido)}
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'grade' && operadoras.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhuma operadora encontrada nas vendas deste comissionamento.
        </div>
      )}

      {/* Resumo por vendedor */}
      {activeView === 'resumo' && (
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Vendedor</TableHead>
                <TableHead className="text-xs text-right">Vendas</TableHead>
                <TableHead className="text-xs text-right">Receita Interna</TableHead>
                <TableHead className="text-xs text-right">Receita LAL</TableHead>
                <TableHead className="text-xs text-right">Estorno</TableHead>
                <TableHead className="text-xs text-right">Churn</TableHead>
                <TableHead className="text-xs text-right">Líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumoPorVendedor.map(r => (
                <TableRow key={r.vendedor_id}>
                  <TableCell className="text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={() => exportVendedorDetalhado(r.vendedor_id, r.vendedor_nome)}
                        title={`Baixar detalhado de ${r.vendedor_nome}`}
                      >
                        <FileDown className="h-3.5 w-3.5" />
                      </Button>
                      {r.vendedor_nome}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-right">{r.totalVendas}</TableCell>
                  <TableCell className="text-xs text-right">{formatBRL(r.receitaInterna)}</TableCell>
                  <TableCell className="text-xs text-right">{formatBRL(r.receitaLal)}</TableCell>
                  <TableCell className="text-xs text-right text-destructive">{formatBRL(r.estorno)}</TableCell>
                  <TableCell className="text-xs text-right text-destructive">{formatBRL(r.churn)}</TableCell>
                  <TableCell className={cn("text-xs text-right font-bold", r.liquido >= 0 ? 'text-success' : 'text-destructive')}>
                    {formatBRL(r.liquido)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted font-bold">
                <TableCell className="text-xs">TOTAL</TableCell>
                <TableCell className="text-xs text-right">{totals.totalVendas}</TableCell>
                <TableCell className="text-xs text-right">{formatBRL(totals.receitaInterna)}</TableCell>
                <TableCell className="text-xs text-right">{formatBRL(totals.receitaLal)}</TableCell>
                <TableCell className="text-xs text-right text-destructive">{formatBRL(totals.estorno)}</TableCell>
                <TableCell className="text-xs text-right text-destructive">{formatBRL(totals.churn)}</TableCell>
                <TableCell className={cn("text-xs text-right", totals.liquido >= 0 ? 'text-success' : 'text-destructive')}>
                  {formatBRL(totals.liquido)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detalhes */}
      {activeView === 'detalhes' && (
        <div className="overflow-x-auto border rounded-lg max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">dt_atv</TableHead>
                <TableHead className="text-xs">Protocolo</TableHead>
                <TableHead className="text-xs">Operadora</TableHead>
                <TableHead className="text-xs">CPF</TableHead>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Vendedor</TableHead>
                <TableHead className="text-xs">Rec. Int.</TableHead>
                <TableHead className="text-xs">Rec. LAL</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Status Pag</TableHead>
                <TableHead className="text-xs">LAL</TableHead>
                <TableHead className="text-xs">Estorno</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendas.slice(0, 200).map(v => (
                <TableRow key={v.id}>
                  <TableCell className="text-xs">{v.data_instalacao || '-'}</TableCell>
                  <TableCell className="text-xs font-mono">{v.protocolo_interno || '-'}</TableCell>
                  <TableCell className="text-xs">{v.operadora_nome || '-'}</TableCell>
                  <TableCell className="text-xs font-mono">{v.cpf_cnpj || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[100px] truncate">{v.cliente_nome || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[80px] truncate">{v.vendedor_nome || '-'}</TableCell>
                  <TableCell className="text-xs">{formatBRL(Number(v.receita_interna || 0))}</TableCell>
                  <TableCell className="text-xs">{formatBRL(Number(v.receita_lal || 0))}</TableCell>
                  <TableCell className="text-xs">{v.status_make || '-'}</TableCell>
                  <TableCell>
                    {v.status_pag === 'OK'
                      ? <Badge className="bg-success/20 text-success text-xs">OK</Badge>
                      : v.status_pag === 'DESCONTADA'
                        ? <Badge className="bg-destructive/20 text-destructive text-xs">DESC</Badge>
                        : <Badge variant="outline" className="text-xs">-</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-xs max-w-[80px] truncate">{v.lal_apelido || '-'}</TableCell>
                  <TableCell className="text-xs text-destructive">{v.receita_descontada ? formatBRL(Number(v.receita_descontada)) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {vendas.length > 200 && activeView === 'detalhes' && (
        <p className="text-xs text-muted-foreground text-center">Mostrando 200 de {vendas.length}. Exporte o CSV para o completo.</p>
      )}
    </div>
  );
}
