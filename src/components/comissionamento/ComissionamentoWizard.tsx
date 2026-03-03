import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, Check, Loader2,
  FileSpreadsheet, Upload, GitCompare, RotateCcw, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WizardProps {
  mode: 'criar' | 'atualizar';
  comissionamentoId?: string;
  onClose: () => void;
}

const STEPS = [
  { id: 'info', label: 'Informações', icon: FileSpreadsheet, description: 'Nome e competência' },
  { id: 'vendas', label: 'Vendas Internas', icon: Upload, description: 'Fontes de vendas' },
  { id: 'lal', label: 'Linha a Linha', icon: FileSpreadsheet, description: 'Importar LAL' },
  { id: 'conciliacao', label: 'Conciliação', icon: GitCompare, description: 'Cruzar dados' },
  { id: 'estornos', label: 'Estornos', icon: RotateCcw, description: 'Descontos' },
  { id: 'painel', label: 'Painel Final', icon: BarChart3, description: 'Resumo' },
];

export function ComissionamentoWizard({ mode, comissionamentoId, onClose }: WizardProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(mode === 'criar' ? 0 : 1);
  const [isSaving, setIsSaving] = useState(false);

  // Step 0: Info
  const [nome, setNome] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [createdComId, setCreatedComId] = useState(comissionamentoId || '');

  const activeComId = createdComId || comissionamentoId || '';

  const handleCreateComissionamento = async () => {
    if (!nome.trim() || !competencia.trim()) {
      toast.error('Preencha o nome e a competência');
      return;
    }
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('comissionamentos')
        .insert({
          nome: nome.trim(),
          competencia: competencia.trim(),
          created_by: user!.id,
          status: 'rascunho' as any,
        })
        .select('id')
        .single();

      if (error) throw error;
      setCreatedComId(data.id);
      toast.success('Comissionamento criado!');
      setCurrentStep(1);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao criar comissionamento: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const canGoNext = () => {
    if (currentStep === 0 && mode === 'criar') return false; // must use create button
    return true;
  };

  const goNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1);
  };

  const goPrev = () => {
    if (currentStep > (mode === 'criar' && !createdComId ? 0 : 1)) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const StepIcon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          const isDisabled = mode === 'criar' && !createdComId && i > 0;

          return (
            <button
              key={step.id}
              onClick={() => !isDisabled && setCurrentStep(i)}
              disabled={isDisabled}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                isActive && 'bg-primary text-primary-foreground',
                isDone && !isActive && 'bg-success/10 text-success',
                !isActive && !isDone && !isDisabled && 'bg-muted text-muted-foreground hover:bg-accent',
                isDisabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              <StepIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{step.label}</span>
              {isDone && <Check className="h-3 w-3" />}
            </button>
          );
        })}
      </div>

      <Progress value={((currentStep + 1) / STEPS.length) * 100} className="h-1" />

      {/* Step content */}
      <div className="min-h-[300px]">
        {currentStep === 0 && (
          <StepInfo
            nome={nome}
            setNome={setNome}
            competencia={competencia}
            setCompetencia={setCompetencia}
            isSaving={isSaving}
            onCreate={handleCreateComissionamento}
            isCreated={!!createdComId}
            mode={mode}
          />
        )}
        {currentStep === 1 && (
          <StepPlaceholder
            title="Etapa 1 — Vendas Internas"
            description="Configure as fontes de vendas internas (sistema ou arquivo). Esta etapa será implementada em breve."
          />
        )}
        {currentStep === 2 && (
          <StepPlaceholder
            title="Etapa 2 — Linha a Linha"
            description="Importe arquivos de operadoras com diferentes tipos de match. Esta etapa será implementada em breve."
          />
        )}
        {currentStep === 3 && (
          <StepPlaceholder
            title="Etapa 3 — Conciliação"
            description="Cruze vendas internas com linhas de operadoras e atualize status_pag. Esta etapa será implementada em breve."
          />
        )}
        {currentStep === 4 && (
          <StepPlaceholder
            title="Etapa 4 — Estornos"
            description="Importe arquivo de estornos/descontos. Esta etapa será implementada em breve."
          />
        )}
        {currentStep === 5 && (
          <StepPlaceholder
            title="Etapa 5 — Painel Final"
            description="Resumo por vendedor, ajustes manuais e exportação. Esta etapa será implementada em breve."
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={currentStep === 0}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
          {currentStep < STEPS.length - 1 && (
            <Button
              size="sm"
              onClick={goNext}
              disabled={!canGoNext() || (currentStep === 0 && !createdComId)}
              className="gap-1.5"
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {currentStep === STEPS.length - 1 && (
            <Button size="sm" onClick={onClose} className="gap-1.5">
              <Check className="h-4 w-4" />
              Concluir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepInfo({
  nome, setNome, competencia, setCompetencia, isSaving, onCreate, isCreated, mode,
}: {
  nome: string;
  setNome: (v: string) => void;
  competencia: string;
  setCompetencia: (v: string) => void;
  isSaving: boolean;
  onCreate: () => void;
  isCreated: boolean;
  mode: 'criar' | 'atualizar';
}) {
  if (mode === 'atualizar') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Check className="h-8 w-8 text-success" />
        <p>Comissionamento já criado. Avance para a próxima etapa.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 py-4">
      <div className="space-y-2">
        <Label htmlFor="nome">Nome do Comissionamento</Label>
        <Input
          id="nome"
          placeholder="Ex: Comissão Março 2026"
          value={nome}
          onChange={e => setNome(e.target.value)}
          disabled={isCreated}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="competencia">Competência</Label>
        <Input
          id="competencia"
          type="month"
          placeholder="YYYY-MM"
          value={competencia}
          onChange={e => setCompetencia(e.target.value)}
          disabled={isCreated}
        />
      </div>

      {isCreated ? (
        <Badge className="bg-success/20 text-success">
          <Check className="h-3 w-3 mr-1" />
          Comissionamento criado com sucesso
        </Badge>
      ) : (
        <Button onClick={onCreate} disabled={isSaving || !nome.trim() || !competencia.trim()} className="w-full">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Criar Comissionamento
        </Button>
      )}
    </div>
  );
}

function StepPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}
