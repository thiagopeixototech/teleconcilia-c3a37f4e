import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { type PeriodPreset } from '@/hooks/usePeriodFilter';

const PRESET_LABELS: Record<PeriodPreset, string> = {
  todas: 'Todas',
  comissao: 'Comissão a Receber',
  mes_atual: 'Mês Atual',
  mes_anterior: 'Mês Anterior',
  personalizado: 'Personalizado',
};

interface PeriodFilterProps {
  preset: PeriodPreset;
  setPreset: (p: PeriodPreset) => void;
  dataInicio: Date;
  dataFim: Date;
  setDataInicio: (d: Date) => void;
  setDataFim: (d: Date) => void;
  comissaoInfo: {
    start: Date;
    end: Date;
    paymentDate: Date;
    label: string;
  };
}

export function PeriodFilter({
  preset,
  setPreset,
  dataInicio,
  dataFim,
  setDataInicio,
  setDataFim,
  comissaoInfo,
}: PeriodFilterProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((p) => (
          <Button
            key={p}
            variant={preset === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPreset(p)}
            className="text-xs"
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}

        {preset === 'personalizado' && (
          <div className="flex items-center gap-2 ml-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {format(dataInicio, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dataInicio}
                  onSelect={(d) => d && setDataInicio(d)}
                  initialFocus
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {format(dataFim, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dataFim}
                  onSelect={(d) => d && setDataFim(d)}
                  initialFocus
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Info badge showing the active period */}
      {preset !== 'todas' && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3 w-3 flex-shrink-0" />
          {preset === 'comissao' ? (
            <span>Comissão a Receber: {comissaoInfo.label}</span>
          ) : (
            <span>
              Período: {format(dataInicio, 'dd/MM/yyyy')} a {format(dataFim, 'dd/MM/yyyy')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
