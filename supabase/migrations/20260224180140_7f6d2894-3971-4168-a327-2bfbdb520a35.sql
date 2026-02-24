
-- Criar tipo enum para ações de auditoria
CREATE TYPE public.acao_auditoria AS ENUM (
  'EDITAR_CAMPO',
  'CONCILIAR',
  'DESCONCILIAR',
  'CONFIRMAR',
  'ESTORNAR',
  'REABRIR_CONTESTACAO',
  'MUDAR_STATUS_INTERNO',
  'MUDAR_STATUS_MAKE',
  'ALTERAR_VALOR',
  'IMPORTACAO_REMOVIDA',
  'CONCILIAR_LOTE'
);

-- Criar tabela audit_log_vendas
CREATE TABLE public.audit_log_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  user_id uuid,
  user_nome text,
  acao text NOT NULL,
  campo text,
  valor_anterior jsonb,
  valor_novo jsonb,
  origem text NOT NULL DEFAULT 'UI',
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_audit_log_vendas_venda_id ON public.audit_log_vendas(venda_id);
CREATE INDEX idx_audit_log_vendas_user_id ON public.audit_log_vendas(user_id);
CREATE INDEX idx_audit_log_vendas_created_at ON public.audit_log_vendas(created_at DESC);
CREATE INDEX idx_audit_log_vendas_acao ON public.audit_log_vendas(acao);

-- Habilitar RLS
ALTER TABLE public.audit_log_vendas ENABLE ROW LEVEL SECURITY;

-- Admin vê todos os logs
CREATE POLICY "Admin can view all audit_log_vendas"
ON public.audit_log_vendas
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin pode inserir logs
CREATE POLICY "Admin can insert audit_log_vendas"
ON public.audit_log_vendas
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Supervisor vê logs das vendas do seu time
CREATE POLICY "Supervisor can view team audit_log_vendas"
ON public.audit_log_vendas
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor') AND
  EXISTS (
    SELECT 1 FROM public.vendas_internas vi
    WHERE vi.id = audit_log_vendas.venda_id
    AND public.can_view_venda(auth.uid(), vi.usuario_id)
  )
);

-- Supervisor pode inserir logs
CREATE POLICY "Supervisor can insert audit_log_vendas"
ON public.audit_log_vendas
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

-- Vendedor vê logs das próprias vendas
CREATE POLICY "Vendedor can view own audit_log_vendas"
ON public.audit_log_vendas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendas_internas vi
    WHERE vi.id = audit_log_vendas.venda_id
    AND vi.usuario_id = public.get_user_usuario_id(auth.uid())
  )
);

-- Service role (edge functions) pode inserir sem restrição (via service key)
-- Ninguém pode editar ou excluir logs
