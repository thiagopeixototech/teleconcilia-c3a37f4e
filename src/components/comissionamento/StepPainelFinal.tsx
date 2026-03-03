import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Loader2, Download, DollarSign, Users, RotateCcw, TrendingDown, Receipt,
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
  // Joined
  cliente_nome?: string;
  cpf_cnpj?: string;
  protocolo_interno?: string;
  status_make?: string;
  vendedor_nome?: string;
  vendedor_id?: string;
  operadora_nome?: string;
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

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function StepPainelFinal({ comissionamentoId }: Props) {
  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState<'resumo' | 'detalhes'>('resumo');

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
              usuario_id,
              usuarios!vendas_internas_usuario_id_fkey(id, nome),
              operadoras!vendas_internas_operadora_id_fkey(nome)
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

  // Aggregate by vendedor
  const resumoPorVendedor = useMemo(() => {
    const map = new Map<string, VendedorResumo>();
    for (const v of vendas) {
      const vid = v.vendedor_id || 'desconhecido';
      const vname = v.vendedor_nome || 'Desconhecido';
      if (!map.has(vid)) {
        map.set(vid, {
          vendedor_id: vid,
          vendedor_nome: vname,
          totalVendas: 0,
          receitaInterna: 0,
          receitaLal: 0,
          estorno: 0,
          churn: 0,
          liquido: 0,
        });
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
    // Calculate liquido
    for (const r of map.values()) {
      r.liquido = r.receitaLal - r.estorno - r.churn;
    }
    return Array.from(map.values()).sort((a, b) => b.liquido - a.liquido);
  }, [vendas]);

  // Global totals
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

  const exportCSV = () => {
    const headers = [
      'Vendedor', 'dt_atv', 'Protocolo', 'CPF', 'Cliente', 'Operadora',
      'Status Pedido', 'Status Pag', 'Receita Interna', 'Receita LAL',
      'LAL', 'Estorno', 'Comiss. Desconto',
    ];
    const rows = vendas.map(v => [
      v.vendedor_nome || '',
      v.data_instalacao || '',
      v.protocolo_interno || '',
      v.cpf_cnpj || '',
      v.cliente_nome || '',
      v.operadora_nome || '',
      v.status_make || '',
      v.status_pag || '',
      v.receita_interna?.toString() || '',
      v.receita_lal?.toString() || '',
      v.lal_apelido || '',
      v.receita_descontada?.toString() || '',
      v.comissionamento_desconto || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comissionamento_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

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
      <div className="flex gap-2">
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
        <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5 ml-auto">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

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
                  <TableCell className="text-xs font-medium">{r.vendedor_nome}</TableCell>
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
              {/* Totals row */}
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
