-- Add identificador_make column to vendas_internas
ALTER TABLE public.vendas_internas 
ADD COLUMN identificador_make text;