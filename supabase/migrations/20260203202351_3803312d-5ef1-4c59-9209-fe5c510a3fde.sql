-- Criar tabela de operadoras
CREATE TABLE public.operadoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.operadoras ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Authenticated users can view active operadoras"
ON public.operadoras
FOR SELECT
USING (ativa = true OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage operadoras"
ON public.operadoras
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Adicionar coluna operadora_id nas vendas_internas
ALTER TABLE public.vendas_internas
ADD COLUMN operadora_id uuid REFERENCES public.operadoras(id);

-- Criar trigger para updated_at
CREATE TRIGGER update_operadoras_updated_at
BEFORE UPDATE ON public.operadoras
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();