import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface PeriodFilterProps {
  dataInicio: Date;
  dataFim: Date;
  setDataInicio: (d: Date) => void;
  setDataFim: (d: Date) => void;
}

export function PeriodFilter({
  dataInicio,
  dataFim,
  setDataInicio,
  setDataFim,
}: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground font-medium">Período:</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
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
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
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
  );
}
