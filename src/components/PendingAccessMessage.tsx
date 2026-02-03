import { Card, CardContent } from '@/components/ui/card';
import { Clock, UserCheck, Building2 } from 'lucide-react';

export function PendingAccessMessage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-lg w-full border-dashed">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Clock className="h-8 w-8 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Aguardando Liberação de Acesso
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Sua conta foi criada com sucesso! Assim que um administrador 
              vincular você a uma empresa e definir suas permissões, 
              você poderá acessar o sistema e visualizar suas vendas.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <UserCheck className="h-5 w-5 text-primary" />
              <span>O administrador precisa criar seu perfil de vendedor</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Building2 className="h-5 w-5 text-primary" />
              <span>Você será vinculado a uma empresa</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Se você acredita que já deveria ter acesso, entre em contato com o administrador do sistema.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}