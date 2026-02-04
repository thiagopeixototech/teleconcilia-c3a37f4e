export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          registro_id: string
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id: string
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id?: string
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      conciliacoes: {
        Row: {
          created_at: string
          id: string
          linha_operadora_id: string
          observacao: string | null
          score_match: number | null
          status_final: Database["public"]["Enums"]["status_conciliacao"]
          tipo_match: Database["public"]["Enums"]["tipo_match"]
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          venda_interna_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linha_operadora_id: string
          observacao?: string | null
          score_match?: number | null
          status_final?: Database["public"]["Enums"]["status_conciliacao"]
          tipo_match: Database["public"]["Enums"]["tipo_match"]
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          venda_interna_id: string
        }
        Update: {
          created_at?: string
          id?: string
          linha_operadora_id?: string
          observacao?: string | null
          score_match?: number | null
          status_final?: Database["public"]["Enums"]["status_conciliacao"]
          tipo_match?: Database["public"]["Enums"]["tipo_match"]
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          venda_interna_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacoes_linha_operadora_id_fkey"
            columns: ["linha_operadora_id"]
            isOneToOne: false
            referencedRelation: "linha_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacoes_venda_interna_id_fkey"
            columns: ["venda_interna_id"]
            isOneToOne: false
            referencedRelation: "vendas_internas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativa: boolean
          cnpj: string | null
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      linha_operadora: {
        Row: {
          arquivo_origem: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          created_at: string
          data_status: string | null
          id: string
          operadora: string
          plano: string | null
          protocolo_operadora: string | null
          quinzena_ref: string | null
          status_operadora: Database["public"]["Enums"]["status_operadora"]
          telefone: string | null
          tipo_plano: string | null
          updated_at: string
          valor: number | null
          valor_lq: number | null
          valor_make: number | null
        }
        Insert: {
          arquivo_origem?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_status?: string | null
          id?: string
          operadora: string
          plano?: string | null
          protocolo_operadora?: string | null
          quinzena_ref?: string | null
          status_operadora?: Database["public"]["Enums"]["status_operadora"]
          telefone?: string | null
          tipo_plano?: string | null
          updated_at?: string
          valor?: number | null
          valor_lq?: number | null
          valor_make?: number | null
        }
        Update: {
          arquivo_origem?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_status?: string | null
          id?: string
          operadora?: string
          plano?: string | null
          protocolo_operadora?: string | null
          quinzena_ref?: string | null
          status_operadora?: Database["public"]["Enums"]["status_operadora"]
          telefone?: string | null
          tipo_plano?: string | null
          updated_at?: string
          valor?: number | null
          valor_lq?: number | null
          valor_make?: number | null
        }
        Relationships: []
      }
      mapeamento_colunas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          mapeamento: Json
          nome: string
          operadora_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          mapeamento?: Json
          nome: string
          operadora_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          mapeamento?: Json
          nome?: string
          operadora_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mapeamento_colunas_operadora_id_fkey"
            columns: ["operadora_id"]
            isOneToOne: false
            referencedRelation: "operadoras"
            referencedColumns: ["id"]
          },
        ]
      }
      operadoras: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          ativo: boolean
          cpf: string | null
          created_at: string
          email: string
          empresa_id: string | null
          id: string
          nome: string
          supervisor_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          email: string
          empresa_id?: string | null
          id?: string
          nome: string
          supervisor_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          email?: string
          empresa_id?: string | null
          id?: string
          nome?: string
          supervisor_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendedores_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_internas: {
        Row: {
          cep: string | null
          cliente_nome: string
          cpf_cnpj: string | null
          created_at: string
          data_venda: string
          empresa_id: string | null
          endereco: string | null
          id: string
          observacoes: string | null
          operadora_id: string | null
          plano: string | null
          protocolo_interno: string | null
          status_interno: Database["public"]["Enums"]["status_interno"]
          telefone: string | null
          updated_at: string
          usuario_id: string
          valor: number | null
        }
        Insert: {
          cep?: string | null
          cliente_nome: string
          cpf_cnpj?: string | null
          created_at?: string
          data_venda?: string
          empresa_id?: string | null
          endereco?: string | null
          id?: string
          observacoes?: string | null
          operadora_id?: string | null
          plano?: string | null
          protocolo_interno?: string | null
          status_interno?: Database["public"]["Enums"]["status_interno"]
          telefone?: string | null
          updated_at?: string
          usuario_id: string
          valor?: number | null
        }
        Update: {
          cep?: string | null
          cliente_nome?: string
          cpf_cnpj?: string | null
          created_at?: string
          data_venda?: string
          empresa_id?: string | null
          endereco?: string | null
          id?: string
          observacoes?: string | null
          operadora_id?: string | null
          plano?: string | null
          protocolo_interno?: string | null
          status_interno?: Database["public"]["Enums"]["status_interno"]
          telefone?: string | null
          updated_at?: string
          usuario_id?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_internas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_internas_operadora_id_fkey"
            columns: ["operadora_id"]
            isOneToOne: false
            referencedRelation: "operadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_internas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_venda: {
        Args: { _user_id: string; _usuario_id: string }
        Returns: boolean
      }
      get_subordinates_ids: {
        Args: { _supervisor_id: string }
        Returns: string[]
      }
      get_user_usuario_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_supervisor_of: {
        Args: { _user_id: string; _usuario_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "vendedor"
      status_conciliacao: "conciliado" | "divergente" | "nao_encontrado"
      status_interno:
        | "nova"
        | "enviada"
        | "aguardando"
        | "confirmada"
        | "cancelada"
      status_operadora: "aprovado" | "instalado" | "cancelado" | "pendente"
      tipo_match: "protocolo" | "cpf" | "telefone" | "manual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "vendedor"],
      status_conciliacao: ["conciliado", "divergente", "nao_encontrado"],
      status_interno: [
        "nova",
        "enviada",
        "aguardando",
        "confirmada",
        "cancelada",
      ],
      status_operadora: ["aprovado", "instalado", "cancelado", "pendente"],
      tipo_match: ["protocolo", "cpf", "telefone", "manual"],
    },
  },
} as const
