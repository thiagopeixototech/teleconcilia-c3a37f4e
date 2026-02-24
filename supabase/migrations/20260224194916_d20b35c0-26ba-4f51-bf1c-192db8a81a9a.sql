
-- Create match_status enum
CREATE TYPE public.match_status AS ENUM ('MATCHED', 'NO_MATCH');

-- Create estornos table
CREATE TABLE public.estornos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  importacao_id uuid NOT NULL DEFAULT gen_random_uuid(),
  referencia_desconto text NOT NULL,
  valor_estornado numeric NOT NULL,
  identificador_make text,
  protocolo text,
  cpf_cnpj text,
  telefone text,
  venda_id uuid REFERENCES public.vendas_internas(id),
  match_status public.match_status NOT NULL DEFAULT 'NO_MATCH'
);

-- RLS
ALTER TABLE public.estornos ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin can manage all estornos"
  ON public.estornos FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Supervisor can view team estornos (via venda_id -> usuario_id)
CREATE POLICY "Supervisor can view team estornos"
  ON public.estornos FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor') AND (
      venda_id IS NULL OR EXISTS (
        SELECT 1 FROM vendas_internas vi
        WHERE vi.id = estornos.venda_id
          AND (vi.usuario_id = get_user_usuario_id(auth.uid()) OR is_supervisor_of(auth.uid(), vi.usuario_id))
      )
    )
  );

-- Vendedor can view own estornos
CREATE POLICY "Vendedor can view own estornos"
  ON public.estornos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendas_internas vi
      WHERE vi.id = estornos.venda_id
        AND vi.usuario_id = get_user_usuario_id(auth.uid())
    )
  );

-- Index for performance
CREATE INDEX idx_estornos_venda_id ON public.estornos(venda_id);
CREATE INDEX idx_estornos_referencia_desconto ON public.estornos(referencia_desconto);
CREATE INDEX idx_estornos_importacao_id ON public.estornos(importacao_id);
