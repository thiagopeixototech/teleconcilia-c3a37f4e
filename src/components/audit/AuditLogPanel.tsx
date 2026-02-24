import { useEffect, useState } from 'react';
import { buscarAuditoriaVenda, AuditLogRecord } from '@/services/auditService';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ChevronLeft, ChevronRight, History, Expand } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const acaoLabels: Record<string, string> = {
  EDITAR_CAMPO: 'Editar Campo',
  CONCILIAR: 'Conciliar',
  DESCONCILIAR: 'Desconciliar',
  CONFIRMAR: 'Confirmar',
  ESTORNAR: 'Estornar',
  REABRIR_CONTESTACAO: 'Reabrir Contestação',
  MUDAR_STATUS_INTERNO: 'Mudar Status',
  MUDAR_STATUS_MAKE: 'Mudar Status Make',
  ALTERAR_VALOR: 'Alterar Valor',
  IMPORTACAO_REMOVIDA: 'Importação Removida',
  CONCILIAR_LOTE: 'Conciliar (Lote)',
};

const acaoColors: Record<string, string> = {
  CONCILIAR: 'bg-success text-success-foreground',
  CONCILIAR_LOTE: 'bg-success text-success-foreground',
  CONFIRMAR: 'bg-success text-success-foreground',
  DESCONCILIAR: 'bg-destructive text-destructive-foreground',
  ESTORNAR: 'bg-destructive text-destructive-foreground',
  EDITAR_CAMPO: 'bg-primary text-primary-foreground',
  MUDAR_STATUS_INTERNO: 'bg-warning text-warning-foreground',
  MUDAR_STATUS_MAKE: 'bg-warning text-warning-foreground',
  ALTERAR_VALOR: 'bg-info text-info-foreground',
};

interface AuditLogPanelProps {
  vendaId: string;
  isOpen?: boolean;
}

export function AuditLogPanel({ vendaId, isOpen = true }: AuditLogPanelProps) {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [acaoFilter, setAcaoFilter] = useState('all');
  const [expandedValue, setExpandedValue] = useState<{ title: string; value: unknown } | null>(null);
  const pageSize = 20;

  useEffect(() => {
    if (isOpen && vendaId) {
      fetchLogs();
    }
  }, [vendaId, page, isOpen]);

  const fetchLogs = async () => {
    setIsLoading(true);
    const result = await buscarAuditoriaVenda(vendaId, page, pageSize);
    setLogs(result.data);
    setTotal(result.total);
    setIsLoading(false);
  };

  const filteredLogs = acaoFilter === 'all' 
    ? logs 
    : logs.filter(l => l.acao === acaoFilter);

  const totalPages = Math.ceil(total / pageSize);

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'object') return JSON.stringify(parsed, null, 2);
        return String(parsed);
      } catch {
        return val;
      }
    }
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  const isLongValue = (val: unknown): boolean => {
    return formatValue(val).length > 30;
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando histórico...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Histórico de Alterações ({total})</span>
        </div>
        <Select value={acaoFilter} onValueChange={setAcaoFilter}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Filtrar ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(acaoLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredLogs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhum registro de alteração encontrado.
        </p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Data/Hora</TableHead>
                  <TableHead className="w-28">Usuário</TableHead>
                  <TableHead className="w-28">Ação</TableHead>
                  <TableHead className="w-24">Campo</TableHead>
                  <TableHead>Antes</TableHead>
                  <TableHead>Depois</TableHead>
                  <TableHead className="w-16">Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.user_nome || (log.origem === 'API' ? 'Sistema' : '-')}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${acaoColors[log.acao] || 'bg-muted text-muted-foreground'}`}>
                        {acaoLabels[log.acao] || log.acao}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {log.campo || '-'}
                    </TableCell>
                    <TableCell className="text-xs max-w-32 truncate">
                      {isLongValue(log.valor_anterior) ? (
                        <Button 
                          variant="ghost" size="sm" className="h-6 px-1 text-xs gap-1"
                          onClick={() => setExpandedValue({ title: 'Valor Anterior', value: log.valor_anterior })}
                        >
                          <Expand className="h-3 w-3" /> Ver
                        </Button>
                      ) : formatValue(log.valor_anterior)}
                    </TableCell>
                    <TableCell className="text-xs max-w-32 truncate">
                      {isLongValue(log.valor_novo) ? (
                        <Button 
                          variant="ghost" size="sm" className="h-6 px-1 text-xs gap-1"
                          onClick={() => setExpandedValue({ title: 'Valor Novo', value: log.valor_novo })}
                        >
                          <Expand className="h-3 w-3" /> Ver
                        </Button>
                      ) : formatValue(log.valor_novo)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {log.origem}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialog para expandir valores longos */}
      <Dialog open={!!expandedValue} onOpenChange={() => setExpandedValue(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{expandedValue?.title}</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-80 whitespace-pre-wrap">
            {formatValue(expandedValue?.value)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
