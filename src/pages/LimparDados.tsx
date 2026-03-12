import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

const TABLES = [
  { key: "comissionamento_vendas", label: "Comissionamento Vendas", order: 1 },
  { key: "comissionamento_lal", label: "Comissionamento LAL", order: 2 },
  { key: "comissionamento_fontes", label: "Comissionamento Fontes", order: 3 },
  { key: "comissionamentos", label: "Comissionamentos", order: 4 },
  { key: "conciliacoes", label: "Conciliações", order: 5 },
  { key: "estornos", label: "Estornos", order: 6 },
  { key: "audit_log_vendas", label: "Audit Log Vendas", order: 7 },
  { key: "audit_log", label: "Audit Log", order: 8 },
  { key: "linha_operadora", label: "Linha Operadora (LAL)", order: 9 },
  { key: "vendas_internas", label: "Vendas Internas", order: 10 },
] as const;

type TableKey = typeof TABLES[number]["key"];

export default function LimparDados() {
  const [selected, setSelected] = useState<Set<TableKey>>(new Set());
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const allSelected = selected.size === TABLES.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(TABLES.map(t => t.key)));
    }
  };

  const toggle = (key: TableKey) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const handleLimpar = async () => {
    if (confirmText !== "APAGAR") {
      toast.error("Digite APAGAR para confirmar");
      return;
    }
    if (selected.size === 0) {
      toast.error("Selecione ao menos uma tabela");
      return;
    }

    setLoading(true);
    const ordered = TABLES.filter(t => selected.has(t.key)).sort((a, b) => a.order - b.order);

    try {
      for (const table of ordered) {
        const { error } = await supabase.from(table.key).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) throw new Error(`Erro ao limpar ${table.label}: ${error.message}`);
      }

      // Se vendas_internas foi selecionada, limpar também o histórico de importações no audit_log
      if (selected.has("vendas_internas")) {
        await supabase.from("audit_log").delete().eq("acao", "IMPORTACAO_MASSA");
      }
      toast.success(`${ordered.length} tabela(s) limpas com sucesso!`);
      setSelected(new Set());
      setConfirmText("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Limpar Dados de Teste</h1>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Esta ação é <strong>irreversível</strong>. Cadastros (usuários, operadoras, empresas e modelos de mapeamento) serão preservados.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Selecione as tabelas</CardTitle>
          <CardDescription>Marque quais dados deseja apagar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2 pb-2 border-b">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="all" />
            <label htmlFor="all" className="font-medium cursor-pointer">Selecionar tudo</label>
          </div>
          {TABLES.map(t => (
            <div key={t.key} className="flex items-center space-x-2">
              <Checkbox checked={selected.has(t.key)} onCheckedChange={() => toggle(t.key)} id={t.key} />
              <label htmlFor={t.key} className="cursor-pointer">{t.label}</label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <label className="text-sm font-medium">Digite <strong>APAGAR</strong> para confirmar:</label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="APAGAR"
          />
          <Button
            variant="destructive"
            className="w-full"
            disabled={loading || confirmText !== "APAGAR" || selected.size === 0}
            onClick={handleLimpar}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Limpar {selected.size} tabela(s)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
