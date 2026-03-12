import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ChevronLeft, ChevronRight, Check, Loader2,
  FileSpreadsheet, Upload, GitCompare, RotateCcw, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { StepVendasInternas } from './StepVendasInternas';
import { StepLinhaALinha } from './StepLinhaALinha';
import { StepConciliacao } from './StepConciliacao';
import { StepEstornos } from './StepEstornos';
import { StepPainelFinal } from './StepPainelFinal';

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
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // Step 0: Info
  const [nome, setNome] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [createdComId, setCreatedComId] = useState(comissionamentoId || '');
  const [comNome, setComNome] = useState('');

  const activeComId = createdComId || comissionamentoId || '';
  const isLastStep = currentStep === STEPS.length - 1;
  const hasDataImported = !!activeComId && currentStep > 0;

  // Load comissionamento name when updating
  useEffect(() => {
    if (comissionamentoId && mode === 'atualizar') {
      supabase.from('comissionamentos').select('nome').eq('id', comissionamentoId).single()
        .then(({ data }) => { if (data) setComNome(data.nome); });
    }
  }, [comissionamentoId, mode]);

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
      setComNome(nome.trim());
      toast.success('Comissionamento criado!');
      setCurrentStep(1);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao criar comissionamento: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const goNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1);
  };

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canGoNext = currentStep === 0 ? !!createdComId : true;

  const handleRequestClose = () => {
    if (isLastStep) {
      onClose();
      return;
    }
    if (hasDataImported) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmExit = async () => {
    if (!activeComId) {
      onClose();
      return;
    }
    setIsCleaningUp(true);
    try {
      // 1. Get apelidos of LAL before deleting (used to clean imported linha_operadora)
      const { data: lalRows } = await supabase
        .from('comissionamento_lal')
        .select('apelido')
        .eq('comissionamento_id', activeComId);

      const apelidos = lalRows?.map(r => r.apelido) || [];

      // 2. Delete only comissionamento-owned records
      await supabase.from('comissionamento_vendas').delete().eq('comissionamento_id', activeComId);
      await supabase.from('comissionamento_lal').delete().eq('comissionamento_id', activeComId);
      await supabase.from('comissionamento_fontes').delete().eq('comissionamento_id', activeComId);

      // 3. Delete linha_operadora imported for this comissionamento
      if (apelidos.length > 0) {
        await supabase.from('linha_operadora').delete().in('apelido', apelidos);
      }

      // 4. Delete the comissionamento itself (only if we created it in this session)
      if (mode === 'criar') {
        await supabase.from('comissionamentos').delete().eq('id', activeComId);
      }

      toast.success('Dados do comissionamento removidos');
    } catch (err: any) {
      console.error('Erro ao limpar dados:', err);
      toast.error('Erro ao limpar dados: ' + err.message);
    } finally {
      setIsCleaningUp(false);
      setShowExitConfirm(false);
      onClose();
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
          const isDisabled = !activeComId && i > 0;

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
        {currentStep === 1 && activeComId && (
          <StepVendasInternas comissionamentoId={activeComId} />
        )}
        {currentStep === 2 && activeComId && (
          <StepLinhaALinha comissionamentoId={activeComId} />
        )}
        {currentStep === 3 && activeComId && (
          <StepConciliacao comissionamentoId={activeComId} />
        )}
        {currentStep === 4 && activeComId && (
          <StepEstornos comissionamentoId={activeComId} comissionamentoNome={comNome || nome} />
        )}
        {currentStep === 5 && activeComId && (
          <StepPainelFinal comissionamentoId={activeComId} />
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
          {!isLastStep && (
            <Button variant="ghost" size="sm" onClick={handleRequestClose}>
              Fechar
            </Button>
          )}
          {currentStep < STEPS.length - 1 && (
            <Button
              size="sm"
              onClick={goNext}
              disabled={!canGoNext}
              className="gap-1.5"
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {isLastStep && (
            <Button size="sm" onClick={onClose} className="gap-1.5">
              <Check className="h-4 w-4" />
              Concluir
            </Button>
          )}
        </div>
      </div>

      {/* Exit confirmation dialog */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem finalizar?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                O processo de comissionamento não foi concluído. Ao sair agora, <strong>somente os dados desta competência</strong> (vínculos, fontes, LAL e linhas importadas da operadora) <strong>serão removidos permanentemente</strong>.
                <br /><br />
                <strong>As vendas internas originais não serão apagadas.</strong>
                <br /><br />
                Deseja realmente sair e apagar os dados desta competência?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaningUp}>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmExit}
              disabled={isCleaningUp}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCleaningUp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sair e apagar dados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
