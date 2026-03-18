
CREATE TABLE public.comissionamento_status_operadora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissionamento_id uuid NOT NULL REFERENCES public.comissionamentos(id) ON DELETE CASCADE,
  operadora_id uuid NOT NULL REFERENCES public.operadoras(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente',
  observacao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comissionamento_id, operadora_id)
);

ALTER TABLE public.comissionamento_status_operadora ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all comissionamento_status_operadora"
  ON public.comissionamento_status_operadora
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view comissionamento_status_operadora"
  ON public.comissionamento_status_operadora
  FOR SELECT
  TO authenticated
  USING (true);
