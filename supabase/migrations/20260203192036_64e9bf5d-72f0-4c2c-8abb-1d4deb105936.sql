-- ============================================
-- SISTEMA DE CONCILIAÇÃO DE VENDAS TELECOM
-- ============================================

-- Enum para roles de usuário
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'vendedor');

-- Enum para status interno de vendas
CREATE TYPE public.status_interno AS ENUM ('nova', 'enviada', 'aguardando', 'confirmada', 'cancelada');

-- Enum para status da operadora
CREATE TYPE public.status_operadora AS ENUM ('aprovado', 'instalado', 'cancelado', 'pendente');

-- Enum para tipo de match na conciliação
CREATE TYPE public.tipo_match AS ENUM ('protocolo', 'cpf', 'telefone', 'manual');

-- Enum para status final da conciliação
CREATE TYPE public.status_conciliacao AS ENUM ('conciliado', 'divergente', 'nao_encontrado');

-- ============================================
-- TABELA: user_roles
-- ============================================
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'vendedor',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABELA: empresas
-- ============================================
CREATE TABLE public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    cnpj TEXT UNIQUE,
    ativa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABELA: vendedores
-- ============================================
CREATE TABLE public.vendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    supervisor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABELA: vendas_internas
-- ============================================
CREATE TABLE public.vendas_internas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL NOT NULL,
    protocolo_interno TEXT,
    cpf_cnpj TEXT,
    cliente_nome TEXT NOT NULL,
    telefone TEXT,
    cep TEXT,
    endereco TEXT,
    plano TEXT,
    valor DECIMAL(10, 2),
    data_venda DATE NOT NULL DEFAULT CURRENT_DATE,
    status_interno status_interno NOT NULL DEFAULT 'nova',
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendas_internas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABELA: linha_operadora
-- ============================================
CREATE TABLE public.linha_operadora (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operadora TEXT NOT NULL,
    protocolo_operadora TEXT,
    cpf_cnpj TEXT,
    cliente_nome TEXT,
    telefone TEXT,
    plano TEXT,
    valor DECIMAL(10, 2),
    data_status DATE,
    status_operadora status_operadora NOT NULL DEFAULT 'pendente',
    quinzena_ref TEXT,
    arquivo_origem TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.linha_operadora ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABELA: conciliacoes
-- ============================================
CREATE TABLE public.conciliacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venda_interna_id UUID REFERENCES public.vendas_internas(id) ON DELETE CASCADE NOT NULL,
    linha_operadora_id UUID REFERENCES public.linha_operadora(id) ON DELETE CASCADE NOT NULL,
    tipo_match tipo_match NOT NULL,
    score_match INTEGER DEFAULT 0,
    status_final status_conciliacao NOT NULL DEFAULT 'nao_encontrado',
    validado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    validado_em TIMESTAMP WITH TIME ZONE,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (venda_interna_id, linha_operadora_id)
);

ALTER TABLE public.conciliacoes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABELA: audit_log
-- ============================================
CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tabela TEXT NOT NULL,
    registro_id UUID NOT NULL,
    acao TEXT NOT NULL,
    dados_anteriores JSONB,
    dados_novos JSONB,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FUNÇÃO: has_role (Security Definer)
-- ============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- ============================================
-- FUNÇÃO: get_user_vendedor_id
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_vendedor_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.vendedores WHERE user_id = _user_id LIMIT 1
$$;

-- ============================================
-- FUNÇÃO: get_subordinates_ids
-- ============================================
CREATE OR REPLACE FUNCTION public.get_subordinates_ids(_supervisor_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.vendedores WHERE supervisor_id = _supervisor_id
$$;

-- ============================================
-- FUNÇÃO: is_supervisor_of
-- ============================================
CREATE OR REPLACE FUNCTION public.is_supervisor_of(_user_id UUID, _vendedor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.vendedores v
        WHERE v.id = _vendedor_id
          AND v.supervisor_id = (SELECT id FROM public.vendedores WHERE user_id = _user_id LIMIT 1)
    )
$$;

-- ============================================
-- FUNÇÃO: can_view_venda
-- ============================================
CREATE OR REPLACE FUNCTION public.can_view_venda(_user_id UUID, _vendedor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        public.has_role(_user_id, 'admin') OR
        (SELECT id FROM public.vendedores WHERE user_id = _user_id) = _vendedor_id OR
        public.is_supervisor_of(_user_id, _vendedor_id)
$$;

-- ============================================
-- FUNÇÃO: update_updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- TRIGGERS: updated_at
-- ============================================
CREATE TRIGGER update_empresas_updated_at
    BEFORE UPDATE ON public.empresas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendedores_updated_at
    BEFORE UPDATE ON public.vendedores
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendas_internas_updated_at
    BEFORE UPDATE ON public.vendas_internas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_linha_operadora_updated_at
    BEFORE UPDATE ON public.linha_operadora
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conciliacoes_updated_at
    BEFORE UPDATE ON public.conciliacoes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS POLICIES: user_roles
-- ============================================
CREATE POLICY "Admin can manage all roles"
    ON public.user_roles FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own role"
    ON public.user_roles FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES: empresas
-- ============================================
CREATE POLICY "Authenticated users can view active empresas"
    ON public.empresas FOR SELECT
    TO authenticated
    USING (ativa = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage empresas"
    ON public.empresas FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- RLS POLICIES: vendedores
-- ============================================
CREATE POLICY "Admin can manage all vendedores"
    ON public.vendedores FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own vendedor profile"
    ON public.vendedores FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Supervisors can view their team"
    ON public.vendedores FOR SELECT
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'supervisor') AND
        supervisor_id = public.get_user_vendedor_id(auth.uid())
    );

-- ============================================
-- RLS POLICIES: vendas_internas
-- ============================================
CREATE POLICY "Admin can manage all vendas_internas"
    ON public.vendas_internas FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendedor can view own vendas"
    ON public.vendas_internas FOR SELECT
    TO authenticated
    USING (vendedor_id = public.get_user_vendedor_id(auth.uid()));

CREATE POLICY "Vendedor can insert own vendas"
    ON public.vendas_internas FOR INSERT
    TO authenticated
    WITH CHECK (vendedor_id = public.get_user_vendedor_id(auth.uid()));

CREATE POLICY "Vendedor can update own vendas"
    ON public.vendas_internas FOR UPDATE
    TO authenticated
    USING (vendedor_id = public.get_user_vendedor_id(auth.uid()));

CREATE POLICY "Supervisor can view team vendas"
    ON public.vendas_internas FOR SELECT
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'supervisor') AND
        public.is_supervisor_of(auth.uid(), vendedor_id)
    );

-- ============================================
-- RLS POLICIES: linha_operadora
-- ============================================
CREATE POLICY "Authenticated users can view linha_operadora"
    ON public.linha_operadora FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admin can manage linha_operadora"
    ON public.linha_operadora FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- RLS POLICIES: conciliacoes
-- ============================================
CREATE POLICY "Admin can manage all conciliacoes"
    ON public.conciliacoes FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view conciliacoes for their vendas"
    ON public.conciliacoes FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.vendas_internas vi
            WHERE vi.id = venda_interna_id
            AND public.can_view_venda(auth.uid(), vi.vendedor_id)
        )
    );

-- ============================================
-- RLS POLICIES: audit_log
-- ============================================
CREATE POLICY "Admin can view all audit_log"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view audit_log for their records"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (usuario_id = auth.uid());

CREATE POLICY "Authenticated users can insert audit_log"
    ON public.audit_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_vendedores_empresa_id ON public.vendedores(empresa_id);
CREATE INDEX idx_vendedores_supervisor_id ON public.vendedores(supervisor_id);
CREATE INDEX idx_vendedores_user_id ON public.vendedores(user_id);
CREATE INDEX idx_vendas_internas_vendedor_id ON public.vendas_internas(vendedor_id);
CREATE INDEX idx_vendas_internas_empresa_id ON public.vendas_internas(empresa_id);
CREATE INDEX idx_vendas_internas_data_venda ON public.vendas_internas(data_venda);
CREATE INDEX idx_vendas_internas_status_interno ON public.vendas_internas(status_interno);
CREATE INDEX idx_linha_operadora_operadora ON public.linha_operadora(operadora);
CREATE INDEX idx_linha_operadora_status ON public.linha_operadora(status_operadora);
CREATE INDEX idx_conciliacoes_venda_interna_id ON public.conciliacoes(venda_interna_id);
CREATE INDEX idx_conciliacoes_linha_operadora_id ON public.conciliacoes(linha_operadora_id);
CREATE INDEX idx_audit_log_registro_id ON public.audit_log(registro_id);
CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at);