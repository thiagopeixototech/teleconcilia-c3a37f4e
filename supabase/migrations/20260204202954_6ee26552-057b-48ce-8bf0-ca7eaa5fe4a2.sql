-- Adicionar novas colunas na tabela linha_operadora
ALTER TABLE public.linha_operadora
ADD COLUMN valor_make numeric NULL,
ADD COLUMN valor_lq numeric NULL,
ADD COLUMN tipo_plano text NULL;

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.linha_operadora.valor_make IS 'Valor do sistema Make';
COMMENT ON COLUMN public.linha_operadora.valor_lq IS 'Valor somado do linha-a-linha (soma quando há múltiplos produtos)';
COMMENT ON COLUMN public.linha_operadora.tipo_plano IS 'Tipo do plano (COMBO quando há mais de um produto por cliente)';