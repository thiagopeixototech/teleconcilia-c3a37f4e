// Database types for the conciliation system

export type AppRole = 'admin' | 'supervisor' | 'vendedor';

export type StatusInterno = 'nova' | 'enviada' | 'aguardando' | 'confirmada' | 'cancelada';

export type StatusOperadora = 'aprovado' | 'instalado' | 'cancelado' | 'pendente';

export type TipoMatch = 'protocolo' | 'cpf' | 'telefone' | 'manual';

export type StatusConciliacao = 'conciliado' | 'divergente' | 'nao_encontrado';

// Campos do sistema que podem ser mapeados
export type CampoSistema = 
  | 'cliente_nome'
  | 'cpf_cnpj'
  | 'protocolo_operadora'
  | 'telefone'
  | 'plano'
  | 'valor'
  | 'data_status'
  | 'status_operadora'
  | 'quinzena_ref';

export interface MapeamentoColunas {
  id: string;
  operadora_id: string;
  nome: string;
  mapeamento: Record<CampoSistema, string>;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  operadora?: Operadora | null;
}

export interface Operadora {
  id: string;
  nome: string;
  ativa: boolean;
  created_at: string;
  updated_at: string;
}

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
  ativa: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vendedor {
  id: string;
  user_id: string | null;
  nome: string;
  email: string;
  empresa_id: string | null;
  supervisor_id: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  empresa?: Empresa | null;
  supervisor?: Vendedor | null;
}

export interface VendaInterna {
  id: string;
  empresa_id: string | null;
  vendedor_id: string;
  operadora_id: string | null;
  protocolo_interno: string | null;
  cpf_cnpj: string | null;
  cliente_nome: string;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  plano: string | null;
  valor: number | null;
  data_venda: string;
  status_interno: StatusInterno;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  vendedor?: Vendedor | null;
  empresa?: Empresa | null;
  operadora?: Operadora | null;
}

export interface LinhaOperadora {
  id: string;
  operadora: string;
  protocolo_operadora: string | null;
  cpf_cnpj: string | null;
  cliente_nome: string | null;
  telefone: string | null;
  plano: string | null;
  valor: number | null;
  valor_make: number | null;
  valor_lq: number | null;
  tipo_plano: string | null;
  data_status: string | null;
  status_operadora: StatusOperadora;
  quinzena_ref: string | null;
  arquivo_origem: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conciliacao {
  id: string;
  venda_interna_id: string;
  linha_operadora_id: string;
  tipo_match: TipoMatch;
  score_match: number;
  status_final: StatusConciliacao;
  validado_por: string | null;
  validado_em: string | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
  venda_interna?: VendaInterna | null;
  linha_operadora?: LinhaOperadora | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface AuditLog {
  id: string;
  tabela: string;
  registro_id: string;
  acao: string;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  usuario_id: string | null;
  created_at: string;
}

// Labels para campos do sistema (para UI)
export const CAMPOS_SISTEMA_LABELS: Record<CampoSistema, string> = {
  cliente_nome: 'Nome do Cliente',
  cpf_cnpj: 'CPF/CNPJ',
  protocolo_operadora: 'Protocolo',
  telefone: 'Telefone',
  plano: 'Plano/Produto',
  valor: 'Valor',
  data_status: 'Data do Status',
  status_operadora: 'Status',
  quinzena_ref: 'Quinzena de Referência',
};

// Campos obrigatórios para o mapeamento
export const CAMPOS_OBRIGATORIOS: CampoSistema[] = ['cpf_cnpj', 'valor'];
