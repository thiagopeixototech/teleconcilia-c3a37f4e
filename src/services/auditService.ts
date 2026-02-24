import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  venda_id: string;
  user_id?: string | null;
  user_nome?: string | null;
  acao: string;
  campo?: string | null;
  valor_anterior?: unknown;
  valor_novo?: unknown;
  origem?: string;
  metadata?: Record<string, unknown> | null;
}

export async function registrarAuditoria(entry: AuditLogEntry) {
  try {
    const { error } = await supabase
      .from('audit_log_vendas' as any)
      .insert({
        venda_id: entry.venda_id,
        user_id: entry.user_id || null,
        user_nome: entry.user_nome || null,
        acao: entry.acao,
        campo: entry.campo || null,
        valor_anterior: entry.valor_anterior !== undefined ? JSON.stringify(entry.valor_anterior) : null,
        valor_novo: entry.valor_novo !== undefined ? JSON.stringify(entry.valor_novo) : null,
        origem: entry.origem || 'UI',
        metadata: entry.metadata || null,
      });

    if (error) {
      console.error('Erro ao registrar auditoria:', error);
    }
  } catch (err) {
    console.error('Erro ao registrar auditoria:', err);
  }
}

export async function registrarAuditoriaBatch(entries: AuditLogEntry[]) {
  if (entries.length === 0) return;
  
  try {
    const rows = entries.map(entry => ({
      venda_id: entry.venda_id,
      user_id: entry.user_id || null,
      user_nome: entry.user_nome || null,
      acao: entry.acao,
      campo: entry.campo || null,
      valor_anterior: entry.valor_anterior !== undefined ? JSON.stringify(entry.valor_anterior) : null,
      valor_novo: entry.valor_novo !== undefined ? JSON.stringify(entry.valor_novo) : null,
      origem: entry.origem || 'UI',
      metadata: entry.metadata || null,
    }));

    const { error } = await supabase
      .from('audit_log_vendas' as any)
      .insert(rows);

    if (error) {
      console.error('Erro ao registrar auditoria em lote:', error);
    }
  } catch (err) {
    console.error('Erro ao registrar auditoria em lote:', err);
  }
}

export interface AuditLogRecord {
  id: string;
  venda_id: string;
  user_id: string | null;
  user_nome: string | null;
  acao: string;
  campo: string | null;
  valor_anterior: unknown;
  valor_novo: unknown;
  origem: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function buscarAuditoriaVenda(
  vendaId: string, 
  page: number = 1, 
  pageSize: number = 20
): Promise<{ data: AuditLogRecord[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('audit_log_vendas' as any)
    .select('*', { count: 'exact' })
    .eq('venda_id', vendaId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Erro ao buscar auditoria:', error);
    return { data: [], total: 0 };
  }

  return { data: (data || []) as unknown as AuditLogRecord[], total: count || 0 };
}
