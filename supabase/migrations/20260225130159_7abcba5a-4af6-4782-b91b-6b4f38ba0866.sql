-- Drop existing foreign keys and recreate with CASCADE
ALTER TABLE conciliacoes DROP CONSTRAINT IF EXISTS conciliacoes_venda_interna_id_fkey;
ALTER TABLE conciliacoes ADD CONSTRAINT conciliacoes_venda_interna_id_fkey 
  FOREIGN KEY (venda_interna_id) REFERENCES vendas_internas(id) ON DELETE CASCADE;

ALTER TABLE estornos DROP CONSTRAINT IF EXISTS estornos_venda_id_fkey;
ALTER TABLE estornos ADD CONSTRAINT estornos_venda_id_fkey 
  FOREIGN KEY (venda_id) REFERENCES vendas_internas(id) ON DELETE SET NULL;

-- Also add CASCADE for linha_operadora reference in conciliacoes
ALTER TABLE conciliacoes DROP CONSTRAINT IF EXISTS conciliacoes_linha_operadora_id_fkey;
ALTER TABLE conciliacoes ADD CONSTRAINT conciliacoes_linha_operadora_id_fkey 
  FOREIGN KEY (linha_operadora_id) REFERENCES linha_operadora(id) ON DELETE CASCADE;