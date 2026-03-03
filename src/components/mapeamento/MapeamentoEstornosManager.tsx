import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function MapeamentoEstornosManager() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Modelos para Estornos</h3>
          <p className="text-sm text-muted-foreground">Mapeamento de colunas para importação de arquivos de estorno</p>
        </div>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Os modelos de estorno utilizam um formato fixo com as colunas: Referência do Desconto, Valor Estornado, Identificador Make, Protocolo, CPF/CNPJ e Telefone. 
          Para importar estornos, acesse a tela de Comissionamento e utilize a etapa de Estornos.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Estornos utilizam formato fixo padronizado</p>
          <p className="text-sm mt-1">Não requerem modelo de mapeamento customizado</p>
        </CardContent>
      </Card>
    </div>
  );
}
