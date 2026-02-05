import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { MapeamentoColunasManager } from '@/components/mapeamento/MapeamentoColunas';
import { supabase } from '@/integrations/supabase/client';
import { Operadora } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function MapeamentoColunasPage() {
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOperadoras();
  }, []);

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
