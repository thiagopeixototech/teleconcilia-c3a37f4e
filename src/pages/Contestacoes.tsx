import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Loader2, Search, Send, CheckCircle2, XCircle, Download, FileWarning, Clock, MailCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Contestacao {
  id: string;
  venda_interna_id: string;
  comissionamento_id: string | null;
  operadora_id: string | null;
  status: string;
  data_envio: string | null;
  data_resposta: string | null;
  motivo_negativa: string | null;
  created_at: string;
  // Joined
  cliente_nome?: string;
  cpf_cnpj?: string;
  protocolo_interno?: string;
  valor?: number;
  vendedor_nome?: string;
  operadora_nome?: string;
  comissionamento_nome?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  aberta: { label: 'Aberta', color: 'bg-muted text-muted-foreground', icon: Clock },
  enviada: { label: 'Enviada', color: 'bg-primary/20 text-primary', icon: Send },
  aceita: { label: 'Aceita', color: 'bg-success/20 text-success', icon: CheckCircle2 },
  negada: { label: 'Negada', color: 'bg-destructive/20 text-destructive', icon: XCircle },
  encerrada: { label: 'Encerrada', color: 'bg-muted text-muted-foreground', icon: MailCheck },
};

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function ContestcoesPage() {
  const { user } = useAuth();
  const [contestacoes, setContestacoes] = useState<Contestacao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editDialog, setEditDialog] = useState<Contestacao | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editMotivo, setEditMotivo] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('contestacoes')
        .select(`
          id, venda_interna_id, comissionamento_id, operadora_id, status,
          data_envio, data_resposta, motivo_negativa, created_at,
          vendas_internas!contestacoes_venda_interna_id_fkey(
            cliente_nome, cpf_cnpj, protocolo_interno, valor,
            usuarios!vendas_internas_usuario_id_fkey(nome)
          ),
          operadoras!contestacoes_operadora_id_fkey(nome),
          comissionamentos!contestacoes_comissionamento_id_fkey(nome)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: Contestacao[] = (data || []).map((row: any) => ({
        id: row.id,
        venda_interna_id: row.venda_interna_id,
        comissionamento_id: row.comissionamento_id,
        operadora_id: row.operadora_id,
        status: row.status,
        data_envio: row.data_envio,
        data_resposta: row.data_resposta,
        motivo_negativa: row.motivo_negativa,
        created_at: row.created_at,
        cliente_nome: row.vendas_internas?.cliente_nome,
        cpf_cnpj: row.vendas_internas?.cpf_cnpj,
        protocolo_interno: row.vendas_internas?.protocolo_interno,
        valor: row.vendas_internas?.valor,
        vendedor_nome: row.vendas_internas?.usuarios?.nome,
        operadora_nome: row.operadoras?.nome,
        comissionamento_nome: row.comissionamentos?.nome,
      }));

      setContestacoes(mapped);
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = contestacoes;
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c =>
        (c.cliente_nome || '').toLowerCase().includes(term) ||
        (c.cpf_cnpj || '').includes(term) ||
        (c.vendedor_nome || '').toLowerCase().includes(term) ||
        (c.protocolo_interno || '').includes(term)
      );
    }
    return result;
  }, [contestacoes, statusFilter, searchTerm]);

  const stats = useMemo(() => {
    const s = { aberta: 0, enviada: 0, aceita: 0, negada: 0, encerrada: 0, total: contestacoes.length };
    contestacoes.forEach(c => { if (s.hasOwnProperty(c.status)) (s as any)[c.status]++; });
    return s;
  }, [contestacoes]);

  const openEdit = (c: Contestacao) => {
    setEditDialog(c);
    setEditStatus(c.status);
    setEditMotivo(c.motivo_negativa || '');
  };

  const handleSave = async () => {
    if (!editDialog) return;
    setIsSaving(true);
    try {
      const updates: any = { status: editStatus };
      if (editStatus === 'enviada' && !editDialog.data_envio) updates.data_envio = new Date().toISOString().split('T')[0];
      if (['aceita', 'negada'].includes(editStatus)) updates.data_resposta = new Date().toISOString().split('T')[0];
      if (editStatus === 'negada') updates.motivo_negativa = editMotivo;

      await supabase.from('contestacoes').update(updates).eq('id', editDialog.id);

      // If accepted, update venda status
      if (editStatus === 'aceita') {
        await supabase.from('vendas_internas').update({
          status_interno: 'contestacao_procedente',
        }).eq('id', editDialog.venda_interna_id);
      } else if (editStatus === 'negada') {
        await supabase.from('vendas_internas').update({
          status_interno: 'contestacao_improcedente',
        }).eq('id', editDialog.venda_interna_id);
      }

      toast.success('Contestação atualizada');
      setEditDialog(null);
      load();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Status', 'Cliente', 'CPF/CNPJ', 'Protocolo', 'Valor', 'Vendedor', 'Operadora', 'Comissionamento', 'Data Envio', 'Data Resposta', 'Motivo'];
    const rows = filtered.map(c => [
      c.status, c.cliente_nome || '', c.cpf_cnpj || '', c.protocolo_interno || '',
      c.valor?.toString() || '', c.vendedor_nome || '', c.operadora_nome || '',
      c.comissionamento_nome || '', c.data_envio || '', c.data_resposta || '', c.motivo_negativa || '',
    ]);
    const bom = '\uFEFF';
    const csv = [headers, ...rows].map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contestacoes_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <AppLayout title="Contestações">
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Contestações com Operadora">
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(STATUS_LABELS).map(([key, cfg]) => (
            <Card
              key={key}
              className={`p-3 text-center cursor-pointer transition-colors ${statusFilter === key ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
            >
              <p className="text-xs text-muted-foreground">{cfg.label}</p>
              <p className="text-lg font-bold">{(stats as any)[key] || 0}</p>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileWarning className="h-5 w-5" />
                  Contestações ({filtered.length})
                </CardTitle>
                <CardDescription>
                  Vendas instaladas no sistema interno mas não encontradas no Linha a Linha.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5">
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs">CPF/CNPJ</TableHead>
                      <TableHead className="text-xs">Protocolo</TableHead>
                      <TableHead className="text-xs text-right">Valor</TableHead>
                      <TableHead className="text-xs">Vendedor</TableHead>
                      <TableHead className="text-xs">Operadora</TableHead>
                      <TableHead className="text-xs">Enviada</TableHead>
                      <TableHead className="text-xs">Resposta</TableHead>
                      <TableHead className="text-xs text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Nenhuma contestação encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.slice(0, 200).map(c => {
                        const cfg = STATUS_LABELS[c.status] || STATUS_LABELS.aberta;
                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Badge className={`${cfg.color} text-xs`}>{cfg.label}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{c.cliente_nome}</TableCell>
                            <TableCell className="text-xs font-mono">{c.cpf_cnpj || '—'}</TableCell>
                            <TableCell className="text-xs font-mono">{c.protocolo_interno || '—'}</TableCell>
                            <TableCell className="text-xs text-right">{c.valor ? formatBRL(c.valor) : '—'}</TableCell>
                            <TableCell className="text-xs">{c.vendedor_nome}</TableCell>
                            <TableCell className="text-xs">{c.operadora_nome || '—'}</TableCell>
                            <TableCell className="text-xs">{c.data_envio || '—'}</TableCell>
                            <TableCell className="text-xs">{c.data_resposta || '—'}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                                Atualizar
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atualizar Contestação</DialogTitle>
            </DialogHeader>
            {editDialog && (
              <div className="space-y-4">
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Cliente:</span> {editDialog.cliente_nome}</p>
                  <p><span className="text-muted-foreground">CPF:</span> {editDialog.cpf_cnpj || '—'}</p>
                  <p><span className="text-muted-foreground">Protocolo:</span> {editDialog.protocolo_interno || '—'}</p>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aberta">Aberta</SelectItem>
                      <SelectItem value="enviada">Enviada para operadora</SelectItem>
                      <SelectItem value="aceita">Aceita</SelectItem>
                      <SelectItem value="negada">Negada</SelectItem>
                      <SelectItem value="encerrada">Encerrada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editStatus === 'negada' && (
                  <div className="space-y-2">
                    <Label>Motivo da negativa</Label>
                    <Textarea value={editMotivo} onChange={e => setEditMotivo(e.target.value)} placeholder="Motivo..." />
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialog(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
