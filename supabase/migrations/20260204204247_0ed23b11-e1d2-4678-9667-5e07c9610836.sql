-- Adicionar coluna CPF na tabela vendedores (obrigatório e único)
ALTER TABLE public.vendedores
ADD COLUMN cpf text NULL;

-- Criar índice único para CPF (apenas para valores não nulos para permitir migração gradual)
CREATE UNIQUE INDEX idx_vendedores_cpf_unique 
ON public.vendedores(cpf) 
WHERE cpf IS NOT NULL;

-- Comentário
COMMENT ON COLUMN public.vendedores.cpf IS 'CPF do vendedor - obrigatório e único para atribuição de vendas';