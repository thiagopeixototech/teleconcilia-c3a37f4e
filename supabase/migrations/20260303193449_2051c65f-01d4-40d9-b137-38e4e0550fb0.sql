
CREATE TABLE public.mapeamento_estornos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  mapeamento jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.mapeamento_estornos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage mapeamento_estornos" ON public.mapeamento_estornos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view mapeamento_estornos" ON public.mapeamento_estornos
  FOR SELECT TO authenticated
  USING (true);
