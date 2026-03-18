import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, FileText, Users, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface CheckItem {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
  link?: string;
}

export default function SaudeComissionamentoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [comNome, setComNome] = useState('');
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [alerts, setAlerts] = useState<{ msg: string; severity: 'warning' | 'error' }[]>([]);

  useEffect(() => {
    if (!id) return;
    runDiagnostics(id);
  }, [id]);

  const runDiagnostics = async (comId: string) => {
    setIsLoading(true);
    try {
      // Load comissionamento info
      const { data: comData } = await supabase.from('comissionamentos').select('nome, status').eq('id', comId).single();
      setComNome(comData?.nome || '');

      // Load LALs
      const { data: lals } = await supabase.from('comissionamento_lal').select('*').eq('comissionamento_id', comId);
      const lalCount = lals?.length || 0;
      const lalApelidos = (lals || []).map(l => l.apelido).join(', ');

      // Load vendas
      const { data: vendas } = await supabase
        .from('comissionamento_vendas')
        .select('id, venda_interna_id, receita_lal, receita_descontada, lal_apelido, status_pag, linha_operadora_id')
        .eq('comissionamento_id', comId);

      const totalVendas = vendas?.length || 0;
      const vendasComMatch = (vendas || []).filter(v => v.receita_lal && v.receita_lal > 0);
      const vendasSemMatch = (vendas || []).filter(v => !v.receita_lal && !v.lal_apelido);
      const receitaNaoEncontrada = vendasSemMatch.reduce((s, v) => s + Number(v.receita_descontada || 0), 0);

      // Load estornos NO_MATCH for this comissionamento
      const { data: estornos } = await (supabase
        .from('estornos') as any)
        .select('id, match_status')
        .eq('comissionamento_id', comId)
        .eq('match_status', 'NO_MATCH');
      const estornosNoMatch = estornos?.length || 0;

      // Build checklist
      const checkItems: CheckItem[] = [];

      // LAL imported
      checkItems.push({
        id: 'lal',
        label: `Linha a Linha importado: ${lalCount} lote(s)`,
        status: lalCount > 0 ? 'ok' : 'error',
        detail: lalCount > 0 ? lalApelidos : 'Nenhum lote importado',
      });

      // Vendas selecionadas
      checkItems.push({
        id: 'vendas',
        label: `Vendas selecionadas: ${totalVendas}`,
        status: totalVendas > 0 ? 'ok' : 'error',
        detail: totalVendas > 0 ? `${vendasComMatch.length} com match, ${vendasSemMatch.length} sem match` : 'Nenhuma venda no comissionamento',
      });

      // Vendas sem match
      if (vendasSemMatch.length > 0) {
        checkItems.push({
          id: 'sem_match',
          label: `${vendasSemMatch.length} vendas sem match`,
          status: 'warning',
          detail: `${formatBRL(receitaNaoEncontrada)} potencial não encontrado`,
        });
      }

      // Estornos NO_MATCH
      if (estornosNoMatch > 0) {
        checkItems.push({
          id: 'estornos_no_match',
          label: `${estornosNoMatch} estornos sem vínculo`,
          status: 'error',
          detail: 'Estornos importados que não foram vinculados a nenhuma venda',
        });
      } else {
        checkItems.push({
          id: 'estornos_ok',
          label: 'Todos os estornos vinculados',
          status: 'ok',
          detail: 'Nenhum estorno órfão',
        });
      }

      // Duplicate check — vendas appearing in other comissionamentos
      // (simplified: check if any venda_interna_id has duplicates)
      const vendaIds = (vendas || []).map(v => v.venda_interna_id);
      const uniqueVendaIds = new Set(vendaIds);
      if (vendaIds.length !== uniqueVendaIds.size) {
        checkItems.push({
          id: 'duplicates',
          label: `${vendaIds.length - uniqueVendaIds.size} vendas duplicadas`,
          status: 'error',
          detail: 'Mesma venda aparece mais de uma vez no comissionamento',
        });
      } else {
        checkItems.push({
          id: 'duplicates',
          label: 'Nenhuma venda duplicada',
          status: 'ok',
          detail: 'Todas as vendas são únicas dentro do comissionamento',
        });
      }

      setChecks(checkItems);

      // Build alerts
      const alertList: { msg: string; severity: 'warning' | 'error' }[] = [];

      // Vendedores com 0 matches
      const { data: vendedorData } = await supabase
        .from('comissionamento_vendas')
        .select(`
          venda_interna_id, receita_lal, lal_apelido,
          vendas_internas!comissionamento_vendas_venda_interna_id_fkey(
            usuario_id,
            usuarios!vendas_internas_usuario_id_fkey(nome)
          )
        `)
        .eq('comissionamento_id', comId);

      const vendedorMatchCount = new Map<string, { nome: string; total: number; matches: number }>();
      for (const v of (vendedorData || []) as any[]) {
        const vid = v.vendas_internas?.usuario_id || 'unknown';
        const vname = v.vendas_internas?.usuarios?.nome || 'Desconhecido';
        if (!vendedorMatchCount.has(vid)) vendedorMatchCount.set(vid, { nome: vname, total: 0, matches: 0 });
        const entry = vendedorMatchCount.get(vid)!;
        entry.total++;
        if (v.receita_lal && v.receita_lal > 0) entry.matches++;
      }

      for (const [, v] of vendedorMatchCount) {
        if (v.total > 0 && v.matches === 0) {
          alertList.push({ msg: `Vendedor "${v.nome}" tem ${v.total} vendas e 0 matches — verificar cadastro de CPF/protocolo`, severity: 'warning' });
        }
      }

      // Match rate per operadora (simplified from LAL data)
      if (totalVendas > 0 && vendasComMatch.length > 0) {
        const matchRate = (vendasComMatch.length / totalVendas) * 100;
        if (matchRate < 70) {
          alertList.push({ msg: `Taxa de match geral é ${matchRate.toFixed(1)}% — abaixo de 70%, verificar arquivos importados`, severity: 'warning' });
        }
      }

      setAlerts(alertList);
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />;
    if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-warning shrink-0" />;
    return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  };

  const okCount = checks.filter(c => c.status === 'ok').length;
  const warnCount = checks.filter(c => c.status === 'warning').length;
  const errCount = checks.filter(c => c.status === 'error').length;
  const healthPct = checks.length > 0 ? Math.round((okCount / checks.length) * 100) : 0;

  if (isLoading) {
    return (
      <AppLayout title="Saúde do Comissionamento">
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Saúde: ${comNome}`}>
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/comissionamento')} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        {/* Health Score */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <div className="space-y-1 flex-1">
                <p className="text-sm text-muted-foreground">Integridade do Comissionamento</p>
                <Progress value={healthPct} className="h-3" />
              </div>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span>{okCount} OK</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span>{warnCount} Atenção</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>{errCount} Erro(s)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Checklist de Integridade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {checks.map(check => (
                <div key={check.id} className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  check.status === 'ok' && 'border-success/30 bg-success/5',
                  check.status === 'warning' && 'border-warning/30 bg-warning/5',
                  check.status === 'error' && 'border-destructive/30 bg-destructive/5',
                )}>
                  {statusIcon(check.status)}
                  <div>
                    <p className="text-sm font-medium">{check.label}</p>
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        {alerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Alertas Automáticos ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alerts.map((alert, i) => (
                  <div key={i} className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border",
                    alert.severity === 'warning' && 'border-warning/30 bg-warning/5',
                    alert.severity === 'error' && 'border-destructive/30 bg-destructive/5',
                  )}>
                    {alert.severity === 'warning' ? (
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    )}
                    <p className="text-sm">{alert.msg}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {alerts.length === 0 && errCount === 0 && warnCount === 0 && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
              <p className="font-medium">Comissionamento saudável</p>
              <p className="text-sm text-muted-foreground">Todos os itens do checklist foram atendidos.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
