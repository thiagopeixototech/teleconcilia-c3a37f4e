-- Add data_instalacao column to vendas_internas
ALTER TABLE public.vendas_internas 
ADD COLUMN data_instalacao date;