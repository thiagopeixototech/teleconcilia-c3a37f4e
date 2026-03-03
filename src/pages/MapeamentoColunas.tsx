import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { MapeamentoColunasManager } from '@/components/mapeamento/MapeamentoColunas';
import { supabase } from '@/integrations/supabase/client';
import { Operadora } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { MapeamentoVendasManager } from '@/components/mapeamento/MapeamentoVendasManager';
import { MapeamentoEstornosManager } from '@/components/mapeamento/MapeamentoEstornosManager';

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
      <AppLayout title="Modelos de Importação">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Modelos de Importação">
      <div className="space-y-6">
        <Tabs defaultValue="lal" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="lal">Linha a Linha</TabsTrigger>
            <TabsTrigger value="vendas">Vendas Internas</TabsTrigger>
            <TabsTrigger value="estornos">Estornos</TabsTrigger>
          </TabsList>
          <TabsContent value="lal">
            <Card>
              <CardContent className="pt-6">
                <MapeamentoColunasManager operadoras={operadoras} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="vendas">
            <Card>
              <CardContent className="pt-6">
                <MapeamentoVendasManager />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="estornos">
            <Card>
              <CardContent className="pt-6">
                <MapeamentoEstornosManager />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
