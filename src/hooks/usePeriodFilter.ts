import { useState, useEffect, useCallback, useMemo } from 'react';
import { startOfMonth, endOfMonth, subMonths, format, addMonths } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export type PeriodPreset = 'comissao' | 'mes_atual' | 'mes_anterior' | 'personalizado';

const TIMEZONE = 'America/Sao_Paulo';
const STORAGE_KEY = 'teleconcilia_period_preset';

/**
 * Calculates the "Comissão a Receber" period.
 *
 * If today's day < 15 (before payday): show month = today - 2 months (paid on 15th of current month)
 * If today's day >= 15 (after payday): show month = today - 1 month (paid on 15th of next month)
 */
function getComissaoPeriod(): { start: Date; end: Date; paymentDate: Date } {
  const now = toZonedTime(new Date(), TIMEZONE);
  const day = now.getDate();

  let targetMonth: Date;
  let paymentDate: Date;

  if (day < 15) {
    // Before payday this month → period = 2 months ago, paid on 15th of current month
    targetMonth = subMonths(now, 2);
    paymentDate = new Date(now.getFullYear(), now.getMonth(), 15);
  } else {
    // After payday this month → period = 1 month ago, paid on 15th of next month
    targetMonth = subMonths(now, 1);
    const nextMonth = addMonths(now, 1);
    paymentDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 15);
  }

  return {
    start: startOfMonth(targetMonth),
    end: endOfMonth(targetMonth),
    paymentDate,
  };
}

function getPeriodForPreset(preset: PeriodPreset): { start: Date; end: Date } {
  const now = toZonedTime(new Date(), TIMEZONE);

  switch (preset) {
    case 'comissao': {
      const { start, end } = getComissaoPeriod();
      return { start, end };
    }
    case 'mes_atual':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'mes_anterior': {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

export function usePeriodFilter(storageKeySuffix?: string) {
  const fullStorageKey = storageKeySuffix ? `${STORAGE_KEY}_${storageKeySuffix}` : STORAGE_KEY;

  // Load saved preset or default to comissao
  const savedPreset = typeof window !== 'undefined'
    ? (localStorage.getItem(fullStorageKey) as PeriodPreset | null)
    : null;

  const initialPreset: PeriodPreset = savedPreset || 'comissao';
  const initialPeriod = getPeriodForPreset(initialPreset);

  const [preset, setPresetState] = useState<PeriodPreset>(initialPreset);
  const [dataInicio, setDataInicio] = useState<Date>(initialPeriod.start);
  const [dataFim, setDataFim] = useState<Date>(initialPeriod.end);

  const setPreset = useCallback((p: PeriodPreset) => {
    setPresetState(p);
    localStorage.setItem(fullStorageKey, p);

    if (p !== 'personalizado') {
      const { start, end } = getPeriodForPreset(p);
      setDataInicio(start);
      setDataFim(end);
    }
  }, [fullStorageKey]);

  const setCustomRange = useCallback((start: Date, end: Date) => {
    setPresetState('personalizado');
    localStorage.setItem(fullStorageKey, 'personalizado');
    setDataInicio(start);
    setDataFim(end);
  }, [fullStorageKey]);

  const comissaoInfo = useMemo(() => {
    const { start, end, paymentDate } = getComissaoPeriod();
    return {
      start,
      end,
      paymentDate,
      label: `${format(start, 'dd/MM/yyyy')} a ${format(end, 'dd/MM/yyyy')} (pagamento em ${format(paymentDate, 'dd/MM/yyyy')})`,
    };
  }, []);

  // Formatted strings for SQL queries
  const dataInicioStr = format(dataInicio, 'yyyy-MM-dd');
  const dataFimStr = format(dataFim, 'yyyy-MM-dd');

  return {
    preset,
    setPreset,
    dataInicio,
    dataFim,
    setDataInicio,
    setDataFim,
    setCustomRange,
    dataInicioStr,
    dataFimStr,
    comissaoInfo,
  };
}
