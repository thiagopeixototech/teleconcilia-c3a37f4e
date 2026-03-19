import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, Search, Filter, Download, ChevronLeft, ChevronRight, Link2, Unlink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

interface LalRegistro {
  id: string;
  importacao_id: string;
  cpf_cnpj: string | null;
  n_solicitacao: string | null;
  cliente_nome: string | null;
  telefone: string | null;
  plano: string | null;
  receita: number | null;
  operadora: string;
  status: string;
  data_ativacao: string | null;
  linha_csv: number | null;
  dados_extras: Record<string, unknown> | null;
  created_at: string;
}

interface LalImportacao {
  id: string;
  apelido: string;
  operadora_id: string;
  arquivo_nome: string | null;
  qtd_registros: number | null;
  tipo_match: string;
  status: string;
  created_at: string;
}

interface Operadora {
  id: string;
  nome: string;
}

type SortField = 'cliente_nome' | 'cpf_cnpj' | 'receita' | 'operadora' | 'data_ativacao' | 'linha_csv' | 'created_at';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

export default function RegistrosLAL() {
  const [registros, setRegistros] = useState<LalRegistro[]>([]);
  const [importacoes, setImportacoes] = useState<LalImportacao[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [vinculados, setVinculados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterOperadora, setFilterOperadora] = useState('all');
  const [filterImportacao, setFilterImportacao] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterVinculo, setFilterVinculo] = useState('all');

  // Sort
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pagination
  const [page, setPage] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [regRes, impRes, opRes, vincRes] = await Promise.all([
        fetchAll('lal_registros'),
        supabase.from('lal_importacoes').select('id, apelido, operadora_id, arquivo_nome, qtd_registros, tipo_match, status, created_at').order('created_at', { ascending: false }),
        supabase.from('operadoras').select('id, nome').eq('ativa', true),
        fetchAll('lal_vinculos', 'lal_registro_id'),
      ]);

      if (regRes) setRegistros(regRes as LalRegistro[]);
      if (impRes.data) setImportacoes(impRes.data as LalImportacao[]);
      if (opRes.data) setOperadoras(opRes.data as Operadora[]);
      if (vincRes) {
        const set = new Set<string>();
        (vincRes as { lal_registro_id: string }[]).forEach(v => set.add(v.lal_registro_id));
        setVinculados(set);
      }
    } catch (e) {
      toast.error('Erro ao carregar registros LAL');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAll(table: string, selectCols = '*') {
    const rows: unknown[] = [];
    let from = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await (supabase.from(table) as any).select(selectCols).range(from, from + batchSize - 1);
      if (error) { toast.error(`Erro ao buscar ${table}`); return rows; }
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < batchSize) break;
      from += batchSize;
    }
    return rows;
  }

  // Importacao map for display
  const importacaoMap = useMemo(() => {
    const m = new Map<string, LalImportacao>();
    importacoes.forEach(i => m.set(i.id, i));
    return m;
  }, [importacoes]);

  const operadoraMap = useMemo(() => {
    const m = new Map<string, string>();
    operadoras.forEach(o => m.set(o.id, o.nome));
    return m;
  }, [operadoras]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let list = [...registros];

    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      list = list.filter(r =>
        (r.cliente_nome || '').toLowerCase().includes(q) ||
        (r.cpf_cnpj || '').includes(q) ||
        (r.telefone || '').includes(q) ||
        (r.n_solicitacao || '').toLowerCase().includes(q) ||
        (r.plano || '').toLowerCase().includes(q)
      );
    }

    if (filterOperadora !== 'all') {
      list = list.filter(r => {
        const imp = importacaoMap.get(r.importacao_id);
        return imp?.operadora_id === filterOperadora;
      });
    }

    if (filterImportacao !== 'all') {
      list = list.filter(r => r.importacao_id === filterImportacao);
    }

    if (filterStatus !== 'all') {
      list = list.filter(r => r.status === filterStatus);
    }

    if (filterVinculo === 'vinculado') {
      list = list.filter(r => vinculados.has(r.id));
    } else if (filterVinculo === 'sem_vinculo') {
      list = list.filter(r => !vinculados.has(r.id));
    }

    // Sort
    list.sort((a, b) => {
      let va: any, vb: any;
      switch (sortField) {
        case 'receita': va = a.receita ?? 0; vb = b.receita ?? 0; break;
        case 'linha_csv': va = a.linha_csv ?? 0; vb = b.linha_csv ?? 0; break;
        case 'created_at': va = a.created_at; vb = b.created_at; break;
        case 'data_ativacao': va = a.data_ativacao ?? ''; vb = b.data_ativacao ?? ''; break;
        default: va = (a[sortField] ?? '').toString().toLowerCase(); vb = (b[sortField] ?? '').toString().toLowerCase(); break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [registros, searchText, filterOperadora, filterImportacao, filterStatus, filterVinculo, sortField, sortDir, importacaoMap, vinculados]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [searchText, filterOperadora, filterImportacao, filterStatus, filterVinculo]);

  const uniqueStatuses = useMemo(() => [...new Set(registros.map(r => r.status))], [registros]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  }

  function exportCSV() {
    const headers = ['Cliente', 'CPF/CNPJ', 'Telefone', 'Solicitação', 'Plano', 'Receita', 'Operadora', 'Status', 'Data Ativação', 'Vínculo', 'Importação'];
    const rows = filtered.map(r => {
      const imp = importacaoMap.get(r.importacao_id);
      return [
        r.cliente_nome ?? '',
        r.cpf_cnpj ?? '',
        r.telefone ?? '',
        r.n_solicitacao ?? '',
        r.plano ?? '',
        r.receita?.toString() ?? '',
        r.operadora,
        r.status,
        r.data_ativacao ?? '',
        vinculados.has(r.id) ? 'Vinculado' : 'Sem vínculo',
        imp?.apelido ?? '',
      ].map(v => `"${v}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registros_lal_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (v: number | null) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

  return (
    <AppLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Registros LAL</h1>
              <p className="text-sm text-muted-foreground">
                {filtered.length.toLocaleString()} registros {filtered.length !== registros.length ? `de ${registros.length.toLocaleString()}` : ''}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative lg:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome, CPF, telefone, solicitação..."
                  className="pl-9"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                />
              </div>

              <Select value={filterOperadora} onValueChange={setFilterOperadora}>
                <SelectTrigger><SelectValue placeholder="Operadora" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas operadoras</SelectItem>
                  {operadoras.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterImportacao} onValueChange={setFilterImportacao}>
                <SelectTrigger><SelectValue placeholder="Importação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas importações</SelectItem>
                  {importacoes.map(i => (
                    <SelectItem key={i.id} value={i.id}>{i.apelido}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  {uniqueStatuses.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterVinculo} onValueChange={setFilterVinculo}>
                <SelectTrigger><SelectValue placeholder="Vínculo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="vinculado">Vinculados</SelectItem>
                  <SelectItem value="sem_vinculo">Sem vínculo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('cliente_nome')}>
                          <span className="flex items-center">Cliente <SortIcon field="cliente_nome" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('cpf_cnpj')}>
                          <span className="flex items-center">CPF/CNPJ <SortIcon field="cpf_cnpj" /></span>
                        </TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Solicitação</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('receita')}>
                          <span className="flex items-center justify-end">Receita <SortIcon field="receita" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('operadora')}>
                          <span className="flex items-center">Operadora <SortIcon field="operadora" /></span>
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('data_ativacao')}>
                          <span className="flex items-center">Ativação <SortIcon field="data_ativacao" /></span>
                        </TableHead>
                        <TableHead>Importação</TableHead>
                        <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort('linha_csv')}>
                          <span className="flex items-center justify-center">Linha <SortIcon field="linha_csv" /></span>
                        </TableHead>
                        <TableHead className="text-center">Vínculo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                            Nenhum registro encontrado com os filtros selecionados.
                          </TableCell>
                        </TableRow>
                      ) : paged.map((r, idx) => {
                        const imp = importacaoMap.get(r.importacao_id);
                        const isVinculado = vinculados.has(r.id);
                        return (
                          <TableRow key={r.id} className="text-sm">
                            <TableCell className="text-muted-foreground text-xs">{page * PAGE_SIZE + idx + 1}</TableCell>
                            <TableCell className="font-medium max-w-[180px] truncate">{r.cliente_nome ?? '—'}</TableCell>
                            <TableCell className="font-mono text-xs">{r.cpf_cnpj ?? '—'}</TableCell>
                            <TableCell className="text-xs">{r.telefone ?? '—'}</TableCell>
                            <TableCell className="text-xs max-w-[120px] truncate">{r.n_solicitacao ?? '—'}</TableCell>
                            <TableCell className="text-xs max-w-[120px] truncate">{r.plano ?? '—'}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(r.receita)}</TableCell>
                            <TableCell className="text-xs">{r.operadora}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{r.status}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{r.data_ativacao ?? '—'}</TableCell>
                            <TableCell className="text-xs max-w-[120px] truncate">{imp?.apelido ?? '—'}</TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground">{r.linha_csv ?? '—'}</TableCell>
                            <TableCell className="text-center">
                              {isVinculado ? (
                                <Link2 className="h-4 w-4 text-emerald-500 mx-auto" />
                              ) : (
                                <Unlink className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <span className="text-sm text-muted-foreground">
                      Página {page + 1} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-foreground">{registros.length.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total de Registros</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{vinculados.size.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Vinculados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{(registros.length - vinculados.size).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Sem Vínculo</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-foreground">{importacoes.length}</p>
                <p className="text-xs text-muted-foreground">Importações</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
