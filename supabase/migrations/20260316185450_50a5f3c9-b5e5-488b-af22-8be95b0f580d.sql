
-- Performance indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_comissionamento_vendas_comissionamento_id ON public.comissionamento_vendas(comissionamento_id);
CREATE INDEX IF NOT EXISTS idx_comissionamento_vendas_venda_interna_id ON public.comissionamento_vendas(venda_interna_id);
CREATE INDEX IF NOT EXISTS idx_comissionamento_vendas_composite ON public.comissionamento_vendas(comissionamento_id, venda_interna_id);
CREATE INDEX IF NOT EXISTS idx_vendas_internas_usuario_data ON public.vendas_internas(usuario_id, data_venda);
CREATE INDEX IF NOT EXISTS idx_vendas_internas_operadora_data ON public.vendas_internas(operadora_id, data_venda);
CREATE INDEX IF NOT EXISTS idx_vendas_internas_identificador ON public.vendas_internas(identificador_make);
CREATE INDEX IF NOT EXISTS idx_vendas_internas_protocolo ON public.vendas_internas(protocolo_interno);
CREATE INDEX IF NOT EXISTS idx_linha_operadora_apelido ON public.linha_operadora(apelido);
CREATE INDEX IF NOT EXISTS idx_linha_operadora_protocolo ON public.linha_operadora(protocolo_operadora);
CREATE INDEX IF NOT EXISTS idx_linha_operadora_cpf ON public.linha_operadora(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_estornos_venda_id ON public.estornos(venda_id);
CREATE INDEX IF NOT EXISTS idx_estornos_referencia ON public.estornos(referencia_desconto);
