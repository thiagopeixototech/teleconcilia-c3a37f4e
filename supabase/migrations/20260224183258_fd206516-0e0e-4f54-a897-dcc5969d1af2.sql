
-- Table for vendas import mapping templates
CREATE TABLE public.mapeamento_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  mapeamento jsonb NOT NULL DEFAULT '{}',
  config jsonb NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.mapeamento_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage mapeamento_vendas"
  ON public.mapeamento_vendas
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view mapeamento_vendas"
  ON public.mapeamento_vendas
  FOR SELECT
  TO authenticated
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_mapeamento_vendas_updated_at
  BEFORE UPDATE ON public.mapeamento_vendas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert RLS policy for vendedor to insert vendas via import (admin inserts on behalf)
-- The existing RLS on vendas_internas requires admin role for ALL, which covers bulk insert
