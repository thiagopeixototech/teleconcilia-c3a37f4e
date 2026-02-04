import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { MapeamentoColunasManager } from '@/components/mapeamento/MapeamentoColunas';
import { supabase } from '@/integrations/supabase/client';
import { Operadora } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function MapeamentoColunasPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    fetchOperadoras();
  }, [isAdmin, navigate]);

  const fetchOperadoras = async () => {
    try {
      const { data, error } = await supabase
        .from('operadoras')
        .select('*')
        .eq('ativa', true)
        .order('nome');

      if (error) throw error;
      setOperadoras(data as Operadora[]);
    } catch (error) {
      console.error('Error fetching operadoras:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout title="Mapeamento de Colunas">
        <Card>
          <CardContent className="py-8 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-lg font-medium">Acesso Restrito</p>
            <p className="text-muted-foreground">Apenas administradores podem acessar esta página</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout title="Mapeamento de Colunas">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Mapeamento de Colunas">
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <MapeamentoColunasManager 
              operadoras={operadoras} 
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
