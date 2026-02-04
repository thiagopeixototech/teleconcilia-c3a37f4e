-- PASSO 1: Remover policies da tabela vendedores
DROP POLICY IF EXISTS "Admin can manage all vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Supervisors can view their team" ON public.vendedores;
DROP POLICY IF EXISTS "Users can view own vendedor profile" ON public.vendedores;

-- PASSO 2: Remover policies da tabela vendas_internas
DROP POLICY IF EXISTS "Vendedor can view own vendas" ON public.vendas_internas;
DROP POLICY IF EXISTS "Vendedor can insert own vendas" ON public.vendas_internas;
DROP POLICY IF EXISTS "Vendedor can update own vendas" ON public.vendas_internas;
DROP POLICY IF EXISTS "Supervisor can view team vendas" ON public.vendas_internas;

-- PASSO 3: Remover policy da tabela conciliacoes
DROP POLICY IF EXISTS "Users can view conciliacoes for their vendas" ON public.conciliacoes;

-- PASSO 4: Remover funções antigas (agora sem dependentes)
DROP FUNCTION IF EXISTS public.get_user_vendedor_id(uuid);
DROP FUNCTION IF EXISTS public.is_supervisor_of(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_view_venda(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_subordinates_ids(uuid);

-- PASSO 5: Renomear tabela vendedores para usuarios
ALTER TABLE public.vendedores RENAME TO usuarios;

-- PASSO 6: Atualizar foreign key na tabela vendas_internas
ALTER TABLE public.vendas_internas 
  DROP CONSTRAINT vendas_internas_vendedor_id_fkey;

ALTER TABLE public.vendas_internas 
  RENAME COLUMN vendedor_id TO usuario_id;

ALTER TABLE public.vendas_internas
  ADD CONSTRAINT vendas_internas_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

-- PASSO 7: Criar novas funções
CREATE OR REPLACE FUNCTION public.get_user_usuario_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.usuarios WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor_of(_user_id uuid, _usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = _usuario_id
          AND u.supervisor_id = (SELECT id FROM public.usuarios WHERE user_id = _user_id LIMIT 1)
    )
$$;

CREATE OR REPLACE FUNCTION public.can_view_venda(_user_id uuid, _usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        public.has_role(_user_id, 'admin') OR
        (SELECT id FROM public.usuarios WHERE user_id = _user_id) = _usuario_id OR
        public.is_supervisor_of(_user_id, _usuario_id)
$$;

CREATE OR REPLACE FUNCTION public.get_subordinates_ids(_supervisor_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.usuarios WHERE supervisor_id = _supervisor_id
$$;

-- PASSO 8: Criar policies da tabela usuarios
CREATE POLICY "Admin can manage all usuarios" 
ON public.usuarios 
FOR ALL 
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisors can view their team" 
ON public.usuarios 
FOR SELECT 
USING (
  has_role(auth.uid(), 'supervisor') 
  AND supervisor_id = get_user_usuario_id(auth.uid())
);

CREATE POLICY "Users can view own profile" 
ON public.usuarios 
FOR SELECT 
USING (user_id = auth.uid());

-- PASSO 9: Criar policies da tabela vendas_internas
CREATE POLICY "Usuario can view own vendas" 
ON public.vendas_internas 
FOR SELECT 
USING (usuario_id = get_user_usuario_id(auth.uid()));

CREATE POLICY "Usuario can insert own vendas" 
ON public.vendas_internas 
FOR INSERT 
WITH CHECK (usuario_id = get_user_usuario_id(auth.uid()));

CREATE POLICY "Usuario can update own vendas" 
ON public.vendas_internas 
FOR UPDATE 
USING (usuario_id = get_user_usuario_id(auth.uid()));

CREATE POLICY "Supervisor can view team vendas" 
ON public.vendas_internas 
FOR SELECT 
USING (
  has_role(auth.uid(), 'supervisor') 
  AND is_supervisor_of(auth.uid(), usuario_id)
);

-- PASSO 10: Criar policy da tabela conciliacoes
CREATE POLICY "Users can view conciliacoes for their vendas" 
ON public.conciliacoes 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM vendas_internas vi
    WHERE vi.id = conciliacoes.venda_interna_id 
      AND can_view_venda(auth.uid(), vi.usuario_id)
  )
);