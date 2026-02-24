import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Users, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface ParsedUser {
  nome: string;
  email: string;
}

interface ResultItem {
  email: string;
  status: string;
  error?: string;
}

export default function CadastroMassa() {
  const [rawText, setRawText] = useState('');
  const [parsedUsers, setParsedUsers] = useState<ParsedUser[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ total: number; criados: number; erros: number; detalhes: ResultItem[] } | null>(null);

  const { data: empresas } = useQuery({
    queryKey: ['empresas'],
    queryFn: async () => {
      const { data } = await supabase.from('empresas').select('id, nome').eq('ativa', true).order('nome');
      return data || [];
    },
  });

  const { data: supervisores } = useQuery({
    queryKey: ['supervisores'],
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('id, nome').eq('ativo', true).order('nome');
      return data || [];
    },
  });

  const parseText = () => {
    const lines = rawText.trim().split('\n').filter(l => l.trim());
    const users: ParsedUser[] = [];

    for (const line of lines) {
      // Support: "nome;email" or "nome,email" or CSV with header
      const parts = line.includes(';') ? line.split(';') : line.split(',');
      if (parts.length >= 2) {
        const nome = parts[0].trim();
        const email = parts[1].trim();
        if (nome && email && email.includes('@')) {
          users.push({ nome, email: email.toLowerCase() });
        }
      }
    }

    if (users.length === 0) {
      toast.error('Nenhum usuário válido encontrado. Use o formato: Nome;email@exemplo.com');
      return;
    }

    setParsedUsers(users);
    setResults(null);
    toast.success(`${users.length} usuário(s) identificados`);
  };

  const handleSubmit = async () => {
    if (parsedUsers.length === 0) return;
    setLoading(true);
    setResults(null);

    try {
      const payload: Record<string, unknown> = {
        usuarios: parsedUsers.map(u => ({
          nome: u.nome,
          email: u.email,
          ...(empresaId ? { empresa_id: empresaId } : {}),
          ...(supervisorId ? { supervisor_id: supervisorId } : {}),
        })),
        senha_padrao: 'Mudar@123',
        role: 'vendedor',
      };

      const { data, error } = await supabase.functions.invoke('criar-usuarios-massa', {
        body: payload,
      });

      if (error) throw error;

      setResults(data);
      toast.success(`${data.criados} usuário(s) criado(s) com sucesso!`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuários');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cadastro em Massa</h1>
          <p className="text-muted-foreground">Crie vendedores em lote com senha padrão <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">Mudar@123</code></p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Lista de Usuários</CardTitle>
              <CardDescription>Cole a lista no formato: <strong>Nome;email@exemplo.com</strong> (um por linha)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={"João Silva;joao@empresa.com\nMaria Santos;maria@empresa.com\nPedro Souza;pedro@empresa.com"}
                rows={10}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                className="font-mono text-sm"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Empresa (opcional)</Label>
                  <Select value={empresaId} onValueChange={setEmpresaId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {empresas?.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Supervisor (opcional)</Label>
                  <Select value={supervisorId} onValueChange={setSupervisorId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {supervisores?.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={parseText} variant="outline" className="flex-1">
                  Pré-visualizar
                </Button>
                <Button onClick={handleSubmit} disabled={parsedUsers.length === 0 || loading} className="flex-1">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Criando...</> : <><Users className="h-4 w-4 mr-2" /> Criar {parsedUsers.length} Usuário(s)</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview / Results */}
          <Card>
            <CardHeader>
              <CardTitle>
                {results ? `Resultado: ${results.criados}/${results.total} criados` : `Pré-visualização (${parsedUsers.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results ? (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <Badge variant="default" className="text-sm">{results.criados} criados</Badge>
                    {results.erros > 0 && <Badge variant="destructive" className="text-sm">{results.erros} erros</Badge>}
                  </div>
                  <div className="max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Detalhe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.detalhes.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-sm">{r.email}</TableCell>
                            <TableCell>
                              {r.status === 'criado' ? (
                                <CheckCircle className="h-4 w-4 text-primary" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.error || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : parsedUsers.length > 0 ? (
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedUsers.map((u, i) => (
                        <TableRow key={i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{u.nome}</TableCell>
                          <TableCell className="font-mono text-sm">{u.email}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Cole a lista à esquerda e clique em "Pré-visualizar"</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
