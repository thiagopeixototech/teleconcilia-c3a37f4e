
-- =============================================
-- TABELA: lal_importacoes (lotes de importação LAL)
-- =============================================
CREATE TABLE public.lal_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissionamento_id uuid REFERENCES public.comissionamentos(id) ON DELETE CASCADE,
  operadora_id uuid NOT NULL REFERENCES public.operadoras(id),
  mapeamento_id uuid REFERENCES public.mapeamento_colunas(id),
  apelido text NOT NULL,
  arquivo_nome text,
  hash_arquivo text,
  tipo_match text NOT NULL DEFAULT 'cpf',
  qtd_registros integer DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lal_importacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all lal_importacoes"
  ON public.lal_importacoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view lal_importacoes"
  ON public.lal_importacoes FOR SELECT TO authenticated
  USING (true);

-- =============================================
-- TABELA: lal_registros (cada linha do CSV persistida)
-- =============================================
CREATE TABLE public.lal_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL REFERENCES public.lal_importacoes(id) ON DELETE CASCADE,
  cpf_cnpj text,
  n_solicitacao text,
  receita numeric,
  data_ativacao date,
  plano text,
  operadora text NOT NULL,
  cliente_nome text,
  telefone text,
  status text NOT NULL DEFAULT 'ativo',
  linha_csv integer,
  dados_extras jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lal_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all lal_registros"
  ON public.lal_registros FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view lal_registros"
  ON public.lal_registros FOR SELECT TO authenticated
  USING (true);

-- Índices para performance no cruzamento
CREATE INDEX idx_lal_registros_importacao ON public.lal_registros(importacao_id);
CREATE INDEX idx_lal_registros_cpf ON public.lal_registros(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;
CREATE INDEX idx_lal_registros_solicitacao ON public.lal_registros(n_solicitacao) WHERE n_solicitacao IS NOT NULL;
CREATE INDEX idx_lal_registros_status ON public.lal_registros(status);

-- =============================================
-- TABELA: lal_vinculos (many-to-many LAL ↔ comissão)
-- =============================================
CREATE TABLE public.lal_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lal_registro_id uuid NOT NULL REFERENCES public.lal_registros(id) ON DELETE CASCADE,
  comissionamento_venda_id uuid NOT NULL REFERENCES public.comissionamento_vendas(id) ON DELETE CASCADE,
  tipo_vinculo text NOT NULL DEFAULT 'automatico',
  receita_atribuida numeric,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lal_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all lal_vinculos"
  ON public.lal_vinculos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view lal_vinculos"
  ON public.lal_vinculos FOR SELECT TO authenticated
  USING (true);

CREATE INDEX idx_lal_vinculos_registro ON public.lal_vinculos(lal_registro_id);
CREATE INDEX idx_lal_vinculos_comvenda ON public.lal_vinculos(comissionamento_venda_id);
CREATE UNIQUE INDEX idx_lal_vinculos_unique ON public.lal_vinculos(lal_registro_id, comissionamento_venda_id);

-- =============================================
-- TABELA: lal_audit_log (trilha de auditoria LAL)
-- =============================================
CREATE TABLE public.lal_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id uuid,
  vinculo_id uuid,
  importacao_id uuid,
  acao text NOT NULL,
  detalhes jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lal_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all lal_audit_log"
  ON public.lal_audit_log FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view lal_audit_log"
  ON public.lal_audit_log FOR SELECT TO authenticated
  USING (true);
