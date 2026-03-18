CREATE TABLE public.contestacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_interna_id uuid REFERENCES public.vendas_internas(id) ON DELETE CASCADE NOT NULL,
  comissionamento_id uuid REFERENCES public.comissionamentos(id) ON DELETE SET NULL,
  operadora_id uuid REFERENCES public.operadoras(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aberta',
  data_envio date,
  data_resposta date,
  motivo_negativa text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contestacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all contestacoes" ON public.contestacoes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisor can view contestacoes" ON public.contestacoes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER update_contestacoes_updated_at BEFORE UPDATE ON public.contestacoes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();