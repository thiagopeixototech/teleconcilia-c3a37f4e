
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  _data_inicio date,
  _data_fim date,
  _usuario_id uuid DEFAULT NULL,
  _supervisor_id uuid DEFAULT NULL,
  _data_instalacao_inicio date DEFAULT NULL,
  _data_instalacao_fim date DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_vendas', COUNT(*),
    'vendas_instaladas', COUNT(*) FILTER (WHERE vi.status_make ILIKE 'instalad%'),
    'vendas_confirmadas', COUNT(*) FILTER (WHERE vi.status_interno = 'confirmada'),
    'vendas_canceladas', COUNT(*) FILTER (WHERE vi.status_interno = 'cancelada'),
    'vendas_aguardando', COUNT(*) FILTER (WHERE vi.status_interno = 'aguardando'),
    'vendas_nova', COUNT(*) FILTER (WHERE vi.status_interno = 'nova'),
    'vendas_enviada', COUNT(*) FILTER (WHERE vi.status_interno = 'enviada'),
    'valor_total', COALESCE(SUM(vi.valor) FILTER (WHERE vi.status_make ILIKE 'instalad%'), 0),
    'vendas_conciliadas', COUNT(*) FILTER (
      WHERE vi.status_make ILIKE 'instalad%'
        AND EXISTS (
          SELECT 1 FROM conciliacoes c
          WHERE c.venda_interna_id = vi.id
            AND c.status_final = 'conciliado'
        )
    ),
    'valor_conciliado', COALESCE(SUM(vi.valor) FILTER (
      WHERE vi.status_make ILIKE 'instalad%'
        AND EXISTS (
          SELECT 1 FROM conciliacoes c
          WHERE c.venda_interna_id = vi.id
            AND c.status_final = 'conciliado'
        )
    ), 0)
  ) INTO result
  FROM vendas_internas vi
  WHERE vi.data_venda >= _data_inicio
    AND vi.data_venda <= _data_fim
    AND (_data_instalacao_inicio IS NULL OR vi.data_instalacao >= _data_instalacao_inicio)
    AND (_data_instalacao_fim IS NULL OR vi.data_instalacao <= _data_instalacao_fim)
    AND (_usuario_id IS NULL OR vi.usuario_id = _usuario_id)
    AND (_supervisor_id IS NULL OR vi.usuario_id IN (SELECT id FROM usuarios WHERE supervisor_id = _supervisor_id))
    AND (
      has_role(auth.uid(), 'admin')
      OR vi.usuario_id = get_user_usuario_id(auth.uid())
      OR (
        has_role(auth.uid(), 'supervisor')
        AND is_supervisor_of(auth.uid(), vi.usuario_id)
      )
    );

  RETURN result;
END;
$function$;
