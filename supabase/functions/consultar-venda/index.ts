import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { identificador_make } = await req.json();

    if (!identificador_make) {
      return new Response(
        JSON.stringify({
          encontrada: false,
          error: "identificador_make é obrigatório",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar venda pelo identificador_make
    const { data: venda, error } = await supabase
      .from("vendas_internas")
      .select(`
        *,
        usuario:usuarios(id, nome, email, cpf),
        empresa:empresas(id, nome),
        operadora:operadoras(id, nome)
      `)
      .eq("identificador_make", identificador_make)
      .maybeSingle();

    if (error) {
      console.error("Erro ao consultar venda:", error);
      return new Response(
        JSON.stringify({ encontrada: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!venda) {
      return new Response(
        JSON.stringify({
          encontrada: false,
          mensagem: "Venda não encontrada com o identificador_make informado",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        encontrada: true,
        venda,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro na função consultar-venda:", error);
    return new Response(
      JSON.stringify({ encontrada: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
