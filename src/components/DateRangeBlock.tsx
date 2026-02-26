import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';

interface DateRangeBlockProps {
  label: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  onDateFromChange: (d: Date | null) => void;
  onDateToChange: (d: Date | null) => void;
}

export function DateRangeBlock({ label, dateFrom, dateTo, onDateFromChange, onDateToChange }: DateRangeBlockProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("text-xs gap-1.5 min-w-[130px] justify-start", !dateFrom && "text-muted-foreground")}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Início'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom ?? undefined}
              onSelect={(d) => onDateFromChange(d ?? null)}
              initialFocus
              locale={ptBR}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">até</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("text-xs gap-1.5 min-w-[130px] justify-start", !dateTo && "text-muted-foreground")}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Fim'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo ?? undefined}
              onSelect={(d) => onDateToChange(d ?? null)}
              initialFocus
              locale={ptBR}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => { onDateFromChange(null); onDateToChange(null); }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
