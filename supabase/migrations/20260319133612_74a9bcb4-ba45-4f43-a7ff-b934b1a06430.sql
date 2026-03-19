
CREATE OR REPLACE FUNCTION public.get_comissionamento_stats(_comissionamento_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'summary', (
      SELECT json_build_object(
        'totalVendas', COUNT(*),
        'vendasInstaladas', COUNT(*) FILTER (WHERE lower(vi.status_make) LIKE 'instalad%'),
        'vendasConciliadas', COUNT(*) FILTER (WHERE cv.status_pag = 'OK'),
        'receitaInterna', COALESCE(SUM(cv.receita_interna), 0),
        'receitaConciliada', COALESCE(SUM(
          CASE WHEN cv.status_pag = 'OK' THEN COALESCE(cv.receita_lal, cv.receita_interna, 0) ELSE 0 END
        ), 0),
        'totalEstornos', COALESCE(SUM(COALESCE(cv.receita_descontada, 0)), 0),
        'churn', COALESCE(SUM(
          CASE WHEN lower(vi.status_make) LIKE 'churn%' THEN COALESCE(cv.receita_interna, vi.valor, 0) ELSE 0 END
        ), 0)
      )
      FROM comissionamento_vendas cv
      JOIN vendas_internas vi ON vi.id = cv.venda_interna_id
      WHERE cv.comissionamento_id = _comissionamento_id
    ),
    'vendedores', (
      SELECT COALESCE(json_agg(row_to_json(v) ORDER BY v.receita_liquida DESC), '[]'::json)
      FROM (
        SELECT
          u.nome AS vendedor_nome,
          COALESCE(SUM(cv.receita_interna), 0) AS receita_interna,
          COALESCE(SUM(CASE WHEN cv.status_pag = 'OK' THEN COALESCE(cv.receita_lal, cv.receita_interna, 0) ELSE 0 END), 0) AS receita_lal,
          COALESCE(SUM(COALESCE(cv.receita_descontada, 0)), 0) AS estorno,
          COALESCE(SUM(CASE WHEN lower(vi.status_make) LIKE 'churn%' THEN COALESCE(cv.receita_interna, vi.valor, 0) ELSE 0 END), 0) AS churn,
          COALESCE(SUM(CASE WHEN cv.status_pag = 'OK' THEN COALESCE(cv.receita_lal, cv.receita_interna, 0) ELSE 0 END), 0)
            - COALESCE(SUM(COALESCE(cv.receita_descontada, 0)), 0)
            - COALESCE(SUM(CASE WHEN lower(vi.status_make) LIKE 'churn%' THEN COALESCE(cv.receita_interna, vi.valor, 0) ELSE 0 END), 0) AS receita_liquida
        FROM comissionamento_vendas cv
        JOIN vendas_internas vi ON vi.id = cv.venda_interna_id
        LEFT JOIN usuarios u ON u.id = vi.usuario_id
        WHERE cv.comissionamento_id = _comissionamento_id
        GROUP BY u.nome
      ) v
    ),
    'operadoras', (
      SELECT COALESCE(json_agg(row_to_json(o) ORDER BY o.receita_liquida DESC), '[]'::json)
      FROM (
        SELECT
          COALESCE(op.nome, 'Sem operadora') AS operadora_nome,
          COUNT(*) AS total_vendas,
          COALESCE(SUM(cv.receita_interna), 0) AS receita_interna,
          COALESCE(SUM(CASE WHEN cv.status_pag = 'OK' THEN COALESCE(cv.receita_lal, cv.receita_interna, 0) ELSE 0 END), 0) AS receita_lal,
          COALESCE(SUM(COALESCE(cv.receita_descontada, 0)), 0) AS estorno,
          COALESCE(SUM(CASE WHEN lower(vi.status_make) LIKE 'churn%' THEN COALESCE(cv.receita_interna, vi.valor, 0) ELSE 0 END), 0) AS churn,
          COALESCE(SUM(CASE WHEN cv.status_pag = 'OK' THEN COALESCE(cv.receita_lal, cv.receita_interna, 0) ELSE 0 END), 0)
            - COALESCE(SUM(COALESCE(cv.receita_descontada, 0)), 0)
            - COALESCE(SUM(CASE WHEN lower(vi.status_make) LIKE 'churn%' THEN COALESCE(cv.receita_interna, vi.valor, 0) ELSE 0 END), 0) AS receita_liquida
        FROM comissionamento_vendas cv
        JOIN vendas_internas vi ON vi.id = cv.venda_interna_id
        LEFT JOIN operadoras op ON op.id = vi.operadora_id
        WHERE cv.comissionamento_id = _comissionamento_id
        GROUP BY op.nome
      ) o
    ),
    'operadora_infos', (
      SELECT COALESCE(json_agg(json_build_object('id', op.id, 'nome', op.nome, 'cor_hex', op.cor_hex) ORDER BY op.nome), '[]'::json)
      FROM (
        SELECT DISTINCT vi.operadora_id
        FROM comissionamento_vendas cv
        JOIN vendas_internas vi ON vi.id = cv.venda_interna_id
        WHERE cv.comissionamento_id = _comissionamento_id
          AND vi.operadora_id IS NOT NULL
      ) ids
      JOIN operadoras op ON op.id = ids.operadora_id
    ),
    'grid', (
      SELECT COALESCE(json_agg(row_to_json(g)), '[]'::json)
      FROM (
        SELECT
          u.id AS vendedor_id,
          u.nome AS vendedor_nome,
          COALESCE(op.id::text, 'sem_operadora') AS operadora_id,
          COUNT(*) AS vendas,
          COALESCE(SUM(CASE WHEN cv.status_pag = 'OK' THEN COALESCE(cv.receita_lal, cv.receita_interna, 0) ELSE 0 END), 0) AS receita,
          COALESCE(SUM(COALESCE(cv.receita_descontada, 0)), 0) AS estorno,
          COALESCE(SUM(CASE WHEN lower(vi.status_make) LIKE 'churn%' THEN COALESCE(cv.receita_interna, vi.valor, 0) ELSE 0 END), 0) AS churn
        FROM comissionamento_vendas cv
        JOIN vendas_internas vi ON vi.id = cv.venda_interna_id
        LEFT JOIN usuarios u ON u.id = vi.usuario_id
        LEFT JOIN operadoras op ON op.id = vi.operadora_id
        WHERE cv.comissionamento_id = _comissionamento_id
        GROUP BY u.id, u.nome, op.id
      ) g
    )
  ) INTO result;

  RETURN result;
END;
$$;
