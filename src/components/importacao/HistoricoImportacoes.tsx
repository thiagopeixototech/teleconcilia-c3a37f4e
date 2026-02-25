import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { History, FileSpreadsheet, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';

interface ImportRecord {
  id: string;
  created_at: string;
  dados_novos: {
    arquivo?: string;
    total?: number;
    novos?: number;
    atualizados?: number;
    erros?: number;
    operadora_id?: string;
    empresa_id?: string;
  } | null;
  user_nome?: string;
}

export function HistoricoImportacoes() {
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('audit_log')
        .select('id, created_at, dados_novos, usuario_id')
        .eq('acao', 'IMPORTACAO_MASSA')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        // Fetch user names for the records
        const userIds = [...new Set(data.map(d => d.usuario_id).filter(Boolean))];
        let userMap = new Map<string, string>();

        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from('usuarios')
            .select('user_id, nome')
            .in('user_id', userIds);
          users?.forEach(u => {
            if (u.user_id) userMap.set(u.user_id, u.nome);
          });
        }

        setRecords(data.map(d => ({
          id: d.id,
          created_at: d.created_at,
          dados_novos: d.dados_novos as ImportRecord['dados_novos'],
          user_nome: d.usuario_id ? userMap.get(d.usuario_id) : undefined,
        })));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadHistory(); }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Histórico de Importações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (records.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Histórico de Importações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma importação realizada ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Histórico de Importações
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadHistory}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto max-h-80">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Data</TableHead>
                <TableHead className="text-xs">Arquivo</TableHead>
                <TableHead className="text-xs">Usuário</TableHead>
                <TableHead className="text-xs text-center">Total</TableHead>
                <TableHead className="text-xs text-center">Novas</TableHead>
                <TableHead className="text-xs text-center">Atualizadas</TableHead>
                <TableHead className="text-xs text-center">Erros</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(record => {
                const d = record.dados_novos;
                const hasErrors = (d?.erros || 0) > 0;
                const totalSuccess = (d?.novos || 0) + (d?.atualizados || 0);

                return (
                  <TableRow key={record.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(record.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate">
                      <span className="flex items-center gap-1">
                        <FileSpreadsheet className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        {d?.arquivo || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{record.user_nome || '—'}</TableCell>
                    <TableCell className="text-xs text-center font-medium">{d?.total || 0}</TableCell>
                    <TableCell className="text-xs text-center text-emerald-600 font-medium">{d?.novos || 0}</TableCell>
                    <TableCell className="text-xs text-center text-blue-600 font-medium">{d?.atualizados || 0}</TableCell>
                    <TableCell className="text-xs text-center">
                      {hasErrors ? (
                        <span className="text-destructive font-medium">{d?.erros}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      {hasErrors ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          <XCircle className="h-3 w-3 mr-0.5" />
                          Parcial
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-600">
                          <CheckCircle2 className="h-3 w-3 mr-0.5" />
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
