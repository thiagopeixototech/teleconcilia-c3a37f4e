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

    const body = await req.json();
    const { identificador_make, ...dadosAtualizacao } = body;

    if (!identificador_make) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          error: "identificador_make é obrigatório",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se a venda existe
    const { data: vendaExistente, error: erroConsulta } = await supabase
      .from("vendas_internas")
      .select("id")
      .eq("identificador_make", identificador_make)
      .maybeSingle();

    if (erroConsulta) {
      console.error("Erro ao consultar venda:", erroConsulta);
      return new Response(
        JSON.stringify({ sucesso: false, error: erroConsulta.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!vendaExistente) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          encontrada: false,
          mensagem: "Venda não encontrada com o identificador_make informado",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Campos permitidos para atualização
    const camposPermitidos = [
      "cliente_nome",
      "cpf_cnpj",
      "telefone",
      "cep",
      "endereco",
      "plano",
      "valor",
      "data_venda",
      "data_instalacao",
      "protocolo_interno",
      "status_interno",
      "status_make",
      "observacoes",
    ];

    // Filtrar apenas os campos permitidos
    const dadosFiltrados: Record<string, unknown> = {};
    for (const campo of camposPermitidos) {
      if (dadosAtualizacao[campo] !== undefined) {
        dadosFiltrados[campo] = dadosAtualizacao[campo];
      }
    }

    if (Object.keys(dadosFiltrados).length === 0) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          error: "Nenhum campo válido para atualização foi enviado",
          campos_permitidos: camposPermitidos,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar status_interno se enviado
    if (dadosFiltrados.status_interno) {
      const statusValidos = [
        "nova",
        "enviada",
        "aguardando",
        "confirmada",
        "cancelada",
        "contestacao_enviada",
        "contestacao_procedente",
        "contestacao_improcedente",
      ];
      if (!statusValidos.includes(dadosFiltrados.status_interno as string)) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            error: `status_interno inválido. Valores permitidos: ${statusValidos.join(", ")}`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Atualizar a venda
    const { data: vendaAtualizada, error: erroAtualizacao } = await supabase
      .from("vendas_internas")
      .update(dadosFiltrados)
      .eq("identificador_make", identificador_make)
      .select(`
        *,
        usuario:usuarios(id, nome, email, cpf),
        empresa:empresas(id, nome),
        operadora:operadoras(id, nome)
      `)
      .single();

    if (erroAtualizacao) {
      console.error("Erro ao atualizar venda:", erroAtualizacao);
      return new Response(
        JSON.stringify({ sucesso: false, error: erroAtualizacao.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: "Venda atualizada com sucesso",
        venda: vendaAtualizada,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro na função atualizar-venda:", error);
    return new Response(
      JSON.stringify({ sucesso: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
