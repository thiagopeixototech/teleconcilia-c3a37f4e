
CREATE OR REPLACE FUNCTION public.get_comissionamento_vendedor_detail(
  _comissionamento_id uuid,
  _vendedor_nome text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
    FROM (
      SELECT
        cv.status_pag,
        cv.receita_interna,
        cv.receita_lal,
        cv.receita_descontada,
        cv.lal_apelido,
        cv.comissionamento_desconto,
        json_build_object(
          'cliente_nome', vi.cliente_nome,
          'cpf_cnpj', vi.cpf_cnpj,
          'protocolo_interno', vi.protocolo_interno,
          'status_make', vi.status_make,
          'data_instalacao', vi.data_instalacao,
          'data_venda', vi.data_venda,
          'plano', vi.plano,
          'valor', vi.valor,
          'identificador_make', vi.identificador_make,
          'telefone', vi.telefone,
          'status_interno', vi.status_interno,
          'observacoes', vi.observacoes,
          'usuarios', json_build_object('nome', u.nome),
          'operadoras', CASE WHEN op.id IS NOT NULL THEN json_build_object('nome', op.nome) ELSE NULL END
        ) AS vendas_internas
      FROM comissionamento_vendas cv
      JOIN vendas_internas vi ON vi.id = cv.venda_interna_id
      LEFT JOIN usuarios u ON u.id = vi.usuario_id
      LEFT JOIN operadoras op ON op.id = vi.operadora_id
      WHERE cv.comissionamento_id = _comissionamento_id
        AND u.nome = _vendedor_nome
      ORDER BY vi.data_venda DESC
    ) r
  );
END;
$$;
