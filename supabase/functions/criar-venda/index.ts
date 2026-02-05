import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VendaPayload {
  vendedor_cpf: string;
  cliente_nome: string;
  cpf_cnpj?: string;
  telefone?: string;
  cep?: string;
  endereco?: string;
  operadora_nome: string;
  plano?: string;
  valor?: number;
  protocolo_interno?: string;
  observacoes?: string;
}

// Normalize CPF (remove non-digits)
const normalizeCPF = (cpf: string): string => {
  return cpf.replace(/\D/g, '');
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não permitido" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse and validate request body
    const body: VendaPayload = await req.json();

    // Required field validation
    if (!body.cliente_nome || body.cliente_nome.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "cliente_nome é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.vendedor_cpf || body.vendedor_cpf.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "vendedor_cpf é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.operadora_nome || body.operadora_nome.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "operadora_nome é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize and validate vendedor CPF
    const vendedorCPF = normalizeCPF(body.vendedor_cpf);
    if (vendedorCPF.length !== 11) {
      return new Response(
        JSON.stringify({ error: "vendedor_cpf inválido (deve ter 11 dígitos)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Length validations
    if (body.cliente_nome.length > 200) {
      return new Response(
        JSON.stringify({ error: "cliente_nome deve ter no máximo 200 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.cpf_cnpj && normalizeCPF(body.cpf_cnpj).length > 14) {
      return new Response(
        JSON.stringify({ error: "cpf_cnpj inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find usuario by CPF
    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id, nome, ativo")
      .eq("cpf", vendedorCPF)
      .single();

    if (usuarioError || !usuario) {
      console.error("Usuario lookup error:", usuarioError, "CPF searched:", vendedorCPF);
      return new Response(
        JSON.stringify({ error: "Vendedor não encontrado com este CPF", cpf_buscado: vendedorCPF }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!usuario.ativo) {
      return new Response(
        JSON.stringify({ error: "Vendedor está inativo" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find operadora by name
    const { data: operadora, error: operadoraError } = await supabase
      .from("operadoras")
      .select("id, ativa")
      .ilike("nome", body.operadora_nome.trim())
      .single();

    if (operadoraError || !operadora) {
      return new Response(
        JSON.stringify({ error: `Operadora "${body.operadora_nome}" não encontrada` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!operadora.ativa) {
      return new Response(
        JSON.stringify({ error: "Operadora está inativa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare venda data
    const vendaData = {
      usuario_id: usuario.id,
      operadora_id: operadora.id,
      cliente_nome: body.cliente_nome.trim(),
      cpf_cnpj: body.cpf_cnpj ? normalizeCPF(body.cpf_cnpj) : null,
      telefone: body.telefone?.replace(/\D/g, '') || null,
      cep: body.cep?.replace(/\D/g, '') || null,
      endereco: body.endereco?.trim() || null,
      plano: body.plano?.trim() || null,
      valor: body.valor || null,
      protocolo_interno: body.protocolo_interno?.trim() || null,
      observacoes: body.observacoes?.trim() || null,
      status_interno: 'nova' as const,
    };

    // Insert venda
    const { data: venda, error: insertError } = await supabase
      .from("vendas_internas")
      .insert(vendaData)
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting venda:", insertError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar venda", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Venda criada com sucesso",
        venda: {
          id: venda.id,
          cliente_nome: venda.cliente_nome,
          vendedor_nome: usuario.nome,
          protocolo_interno: venda.protocolo_interno,
          status_interno: venda.status_interno,
          created_at: venda.created_at,
        },
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
