import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UserInput {
  nome: string;
  email: string;
  empresa_id?: string;
  supervisor_id?: string;
}

interface CreateUsersRequest {
  usuarios: UserInput[];
  senha_padrao: string;
  role?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Não autorizado");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);

    // Verify requesting user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !requestingUser) throw new Error("Não autorizado");

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Apenas administradores podem criar usuários em massa");

    const { usuarios, senha_padrao, role: userRole = "vendedor" }: CreateUsersRequest = await req.json();

    if (!usuarios || !Array.isArray(usuarios) || usuarios.length === 0) {
      throw new Error("Lista de usuários vazia");
    }
    if (!senha_padrao || senha_padrao.length < 6) {
      throw new Error("Senha deve ter pelo menos 6 caracteres");
    }

    const results: { email: string; status: string; error?: string }[] = [];

    for (const u of usuarios) {
      try {
        if (!u.email || !u.nome) {
          results.push({ email: u.email || "?", status: "erro", error: "Nome e email obrigatórios" });
          continue;
        }

        // Create auth user
        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: u.email.trim().toLowerCase(),
          password: senha_padrao,
          email_confirm: true,
          user_metadata: { full_name: u.nome.trim() },
        });

        if (createError) {
          results.push({ email: u.email, status: "erro", error: createError.message });
          continue;
        }

        const authUserId = authData.user.id;

        // Update the auto-created usuario record (from trigger) with extra fields
        const updateFields: Record<string, unknown> = {
          nome: u.nome.trim(),
          ativo: true,
        };
        if (u.empresa_id) updateFields.empresa_id = u.empresa_id;
        if (u.supervisor_id) updateFields.supervisor_id = u.supervisor_id;

        await supabaseAdmin
          .from("usuarios")
          .update(updateFields)
          .eq("user_id", authUserId);

        // Assign role
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: authUserId, role: userRole }, { onConflict: "user_id,role" });

        results.push({ email: u.email, status: "criado" });
      } catch (err: any) {
        results.push({ email: u.email || "?", status: "erro", error: err.message });
      }
    }

    const total = results.length;
    const criados = results.filter(r => r.status === "criado").length;
    const erros = results.filter(r => r.status === "erro").length;

    return new Response(
      JSON.stringify({ total, criados, erros, detalhes: results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error creating users:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
