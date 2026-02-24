
CREATE OR REPLACE FUNCTION public.get_performance_consultores(
  _data_inicio date,
  _data_fim date
)
RETURNS TABLE (
  usuario_id uuid,
  consultor_nome text,
  total_vendas bigint,
  vendas_instaladas bigint,
  vendas_conciliadas bigint,
  receita_conciliada numeric,
  taxa_conciliacao numeric,
  ticket_medio numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    vi.usuario_id,
    u.nome AS consultor_nome,
    COUNT(*)::bigint AS total_vendas,
    COUNT(*) FILTER (WHERE vi.status_make ILIKE 'instalad%')::bigint AS vendas_instaladas,
    COUNT(*) FILTER (
      WHERE vi.status_make ILIKE 'instalad%'
        AND EXISTS (
          SELECT 1 FROM conciliacoes c
          WHERE c.venda_interna_id = vi.id
            AND c.status_final = 'conciliado'
        )
    )::bigint AS vendas_conciliadas,
    COALESCE(SUM(vi.valor) FILTER (
      WHERE vi.status_make ILIKE 'instalad%'
        AND EXISTS (
          SELECT 1 FROM conciliacoes c
          WHERE c.venda_interna_id = vi.id
            AND c.status_final = 'conciliado'
        )
    ), 0)::numeric AS receita_conciliada,
    CASE
      WHEN COUNT(*) FILTER (WHERE vi.status_make ILIKE 'instalad%') = 0 THEN 0
      ELSE ROUND(
        (COUNT(*) FILTER (
          WHERE vi.status_make ILIKE 'instalad%'
            AND EXISTS (
              SELECT 1 FROM conciliacoes c
              WHERE c.venda_interna_id = vi.id
                AND c.status_final = 'conciliado'
            )
        )::numeric / COUNT(*) FILTER (WHERE vi.status_make ILIKE 'instalad%')::numeric) * 100
      , 1)
    END AS taxa_conciliacao,
    CASE
      WHEN COUNT(*) FILTER (
        WHERE vi.status_make ILIKE 'instalad%'
          AND EXISTS (
            SELECT 1 FROM conciliacoes c
            WHERE c.venda_interna_id = vi.id
              AND c.status_final = 'conciliado'
          )
      ) = 0 THEN 0
      ELSE ROUND(
        COALESCE(SUM(vi.valor) FILTER (
          WHERE vi.status_make ILIKE 'instalad%'
            AND EXISTS (
              SELECT 1 FROM conciliacoes c
              WHERE c.venda_interna_id = vi.id
                AND c.status_final = 'conciliado'
            )
        ), 0)::numeric / COUNT(*) FILTER (
          WHERE vi.status_make ILIKE 'instalad%'
            AND EXISTS (
              SELECT 1 FROM conciliacoes c
              WHERE c.venda_interna_id = vi.id
                AND c.status_final = 'conciliado'
            )
        )::numeric
      , 2)
    END AS ticket_medio
  FROM vendas_internas vi
  JOIN usuarios u ON u.id = vi.usuario_id
  WHERE vi.data_venda BETWEEN _data_inicio AND _data_fim
    AND (
      has_role(auth.uid(), 'admin')
      OR (
        has_role(auth.uid(), 'supervisor')
        AND (
          vi.usuario_id = get_user_usuario_id(auth.uid())
          OR is_supervisor_of(auth.uid(), vi.usuario_id)
        )
      )
    )
  GROUP BY vi.usuario_id, u.nome
  ORDER BY u.nome;
$$;
