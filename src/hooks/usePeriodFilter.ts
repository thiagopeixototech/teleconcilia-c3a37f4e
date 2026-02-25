import { useState, useCallback, useMemo } from 'react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'America/Sao_Paulo';

export function usePeriodFilter() {
  const now = toZonedTime(new Date(), TIMEZONE);

  const [dataInicio, setDataInicio] = useState<Date>(startOfMonth(now));
  const [dataFim, setDataFim] = useState<Date>(endOfMonth(now));

  const dataInicioStr = format(dataInicio, 'yyyy-MM-dd');
  const dataFimStr = format(dataFim, 'yyyy-MM-dd');

  return {
    dataInicio,
    dataFim,
    setDataInicio,
    setDataFim,
    dataInicioStr,
    dataFimStr,
  };
}
