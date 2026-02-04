-- Criar tabela de mapeamento de colunas para importação
CREATE TABLE public.mapeamento_colunas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operadora_id uuid NOT NULL REFERENCES public.operadoras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  mapeamento jsonb NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice para busca por operadora
CREATE INDEX idx_mapeamento_colunas_operadora ON public.mapeamento_colunas(operadora_id);

-- Garantir que só existe um mapeamento ativo por operadora
CREATE UNIQUE INDEX idx_mapeamento_colunas_ativo_unico 
ON public.mapeamento_colunas(operadora_id) 
WHERE ativo = true;

-- Habilitar RLS
ALTER TABLE public.mapeamento_colunas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Admin can manage mapeamento_colunas"
ON public.mapeamento_colunas
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view mapeamento_colunas"
ON public.mapeamento_colunas
FOR SELECT
USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_mapeamento_colunas_updated_at
BEFORE UPDATE ON public.mapeamento_colunas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.mapeamento_colunas IS 'Mapeamento de colunas CSV para importação de arquivos linha-a-linha';
COMMENT ON COLUMN public.mapeamento_colunas.mapeamento IS 'JSON com mapeamento: {"campo_sistema": "coluna_csv"}';