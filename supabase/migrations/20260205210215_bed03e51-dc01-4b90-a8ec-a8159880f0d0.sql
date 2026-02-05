-- Criar índice único no identificador_make (ignorando NULLs)
CREATE UNIQUE INDEX idx_vendas_internas_identificador_make_unique 
ON public.vendas_internas (identificador_make) 
WHERE identificador_make IS NOT NULL;