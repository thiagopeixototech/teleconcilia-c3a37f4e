# 📚 Documentação Completa — Verifika (TeleConcilia)

**Sistema de Conciliação de Vendas para Telecomunicações**  
**Versão:** Março 2026  
**URL:** https://teleconcilia.lovable.app

---

## 📋 Índice

1. [Visão Geral](#1-visão-geral)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Arquitetura de Autenticação e RBAC](#3-arquitetura-de-autenticação-e-rbac)
4. [Banco de Dados — Tabelas](#4-banco-de-dados--tabelas)
5. [Banco de Dados — Funções e Triggers](#5-banco-de-dados--funções-e-triggers)
6. [Banco de Dados — Enums](#6-banco-de-dados--enums)
7. [Políticas de Segurança (RLS)](#7-políticas-de-segurança-rls)
8. [Telas e Funcionalidades](#8-telas-e-funcionalidades)
9. [Edge Functions (APIs Backend)](#9-edge-functions-apis-backend)
10. [Fluxos de Negócio](#10-fluxos-de-negócio)
11. [Serviços e Utilitários](#11-serviços-e-utilitários)
12. [Estrutura de Arquivos](#12-estrutura-de-arquivos)
13. [Lógica de Processamento e Cálculos Detalhados](#13-lógica-de-processamento-e-cálculos-detalhados)

---

## 1. Visão Geral

O **Verifika** é um sistema de conciliação de vendas para empresas de telecomunicações. Ele permite:

- **Registrar vendas internas** (feitas por consultores/vendedores)
- **Importar dados das operadoras** (arquivos CSV "Linha a Linha")
- **Conciliar** vendas internas com dados da operadora (match por CPF, protocolo ou telefone)
- **Gerenciar comissionamentos** por competência mensal
- **Controlar estornos e churn** com impacto financeiro
- **Auditar** todas as alterações com rastreabilidade completa
- **Gerar relatórios** de performance por consultor

O sistema opera sob um modelo de **Comissionamento por Competência** (YYYY-MM), onde vendas são processadas em ciclos mensais estruturados.

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Estilização** | Tailwind CSS + shadcn/ui |
| **Estado** | React Query (TanStack) |
| **Roteamento** | React Router DOM v6 |
| **Backend** | Lovable Cloud (Supabase) |
| **Banco de Dados** | PostgreSQL (via Supabase) |
| **Autenticação** | Supabase Auth |
| **APIs** | Supabase Edge Functions (Deno) |
| **Gráficos** | Recharts |
| **Utilitários** | date-fns, zod, react-hook-form |

---

## 3. Arquitetura de Autenticação e RBAC

### Roles (Perfis de Acesso)

| Role | Descrição | Acesso |
|------|-----------|--------|
| **admin** | Administrador geral | Acesso total a todas as telas e dados |
| **supervisor** | Gerente de equipe | Visualiza dados próprios + subordinados diretos |
| **vendedor** | Consultor de vendas | Visualiza apenas dados próprios |

### Fluxo de Autenticação

1. Login via email/senha (Supabase Auth)
2. Após login, busca-se o `role` na tabela `user_roles`
3. Busca-se o perfil do `usuario` na tabela `usuarios` (vinculado via `user_id`)
4. O `AuthContext` expõe: `user`, `role`, `vendedor`, `isAdmin`, `isSupervisor`, `isVendedor`

### Controle de Acesso por Tela

| Tela | Rota | Roles Permitidas |
|------|------|------------------|
| Login | `/login` | Pública |
| Dashboard | `/dashboard` | Todos autenticados |
| Vendas Internas | `/vendas` | Todos autenticados |
| Nova Venda | `/vendas/nova` | Todos autenticados |
| Linha Operadora | `/linha-operadora` | admin |
| Conciliação | `/conciliacao` | admin, supervisor |
| Divergências | `/divergencias` | admin, supervisor |
| Empresas | `/empresas` | admin |
| Usuários | `/usuarios` | admin |
| Permissões | `/permissoes` | admin |
| Operadoras | `/operadoras` | admin |
| Modelos de Importação | `/mapeamento-colunas` | admin |
| Performance | `/performance` | admin, supervisor |
| Importação de Vendas | `/importacao-vendas` | admin |
| Importação de Estornos | `/importacao-estornos` | admin |
| Cadastro em Massa | `/cadastro-massa` | admin |
| Comissionamento | `/comissionamento` | admin |
| Limpar Dados | `/limpar-dados` | admin |

---

## 4. Banco de Dados — Tabelas

### 4.1 `usuarios` (Perfis de Usuários)
Armazena os dados de todos os usuários do sistema (vendedores, supervisores, admins).

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `user_id` | uuid | Não | Referência ao `auth.users` (login) |
| `nome` | text | Sim | Nome completo |
| `email` | text | Sim | Email |
| `cpf` | text | Não | CPF (para match em importações) |
| `empresa_id` | uuid (FK → empresas) | Não | Empresa vinculada |
| `supervisor_id` | uuid (FK → usuarios) | Não | Supervisor direto |
| `ativo` | boolean | Sim | Se o usuário está ativo |
| `created_at` | timestamptz | Sim | Data de criação |
| `updated_at` | timestamptz | Sim | Data de atualização |

### 4.2 `user_roles` (Papéis de Acesso)
Tabela separada para roles (segurança contra escalação de privilégios).

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `user_id` | uuid (FK → auth.users) | Sim | Usuário autenticado |
| `role` | app_role | Sim | admin, supervisor ou vendedor |
| `created_at` | timestamptz | Sim | Data de criação |

### 4.3 `empresas`
Empresas parceiras/franqueadas.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `nome` | text | Sim | Nome da empresa |
| `cnpj` | text | Não | CNPJ |
| `ativa` | boolean | Sim | Status ativo |
| `created_at` / `updated_at` | timestamptz | Sim | Timestamps |

### 4.4 `operadoras`
Operadoras de telecomunicações cadastradas.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `nome` | text | Sim | Nome da operadora |
| `ativa` | boolean | Sim | Status ativo |
| `created_at` / `updated_at` | timestamptz | Sim | Timestamps |

### 4.5 `vendas_internas` (Vendas dos Consultores)
Tabela principal de vendas registradas pelo time comercial.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `usuario_id` | uuid (FK → usuarios) | Sim | Vendedor responsável |
| `empresa_id` | uuid (FK → empresas) | Não | Empresa |
| `operadora_id` | uuid (FK → operadoras) | Não | Operadora da venda |
| `cliente_nome` | text | Sim | Nome do cliente |
| `cpf_cnpj` | text | Não | CPF/CNPJ do cliente |
| `telefone` | text | Não | Telefone |
| `protocolo_interno` | text | Não | Protocolo de referência |
| `identificador_make` | text | Não | ID no CRM externo (Make) — chave de deduplicação |
| `status_make` | text | Não | Status no CRM externo |
| `status_interno` | status_interno | Sim | Status interno da venda |
| `valor` | numeric | Não | Valor da venda |
| `data_venda` | date | Sim | Data da venda |
| `data_instalacao` | date | Não | Data de instalação |
| `plano` | text | Não | Plano contratado |
| `cep` | text | Não | CEP |
| `endereco` | text | Não | Endereço |
| `observacoes` | text | Não | Observações |
| `created_at` / `updated_at` | timestamptz | Sim | Timestamps |

### 4.6 `linha_operadora` (Dados da Operadora — "Linha a Linha")
Registros importados diretamente dos arquivos CSV das operadoras.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `operadora` | text | Sim | Nome da operadora |
| `protocolo_operadora` | text | Não | Protocolo da operadora |
| `cpf_cnpj` | text | Não | CPF/CNPJ |
| `cliente_nome` | text | Não | Nome do cliente |
| `telefone` | text | Não | Telefone |
| `plano` | text | Não | Plano |
| `valor` | numeric | Não | Valor bruto |
| `valor_make` | numeric | Não | Valor Make |
| `valor_lq` | numeric | Não | Valor líquido (usado no comissionamento) |
| `tipo_plano` | text | Não | Tipo do plano |
| `data_status` | date | Não | Data do status |
| `status_operadora` | status_operadora | Sim | Status (aprovado/instalado/cancelado/pendente) |
| `quinzena_ref` | text | Não | Quinzena de referência |
| `arquivo_origem` | text | Não | Nome do arquivo CSV de origem |
| `apelido` | text | Não | Apelido do lote |
| `created_at` / `updated_at` | timestamptz | Sim | Timestamps |

### 4.7 `conciliacoes` (Vínculos de Conciliação)
Liga uma venda interna a um registro da operadora.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `venda_interna_id` | uuid (FK → vendas_internas) | Sim | Venda interna |
| `linha_operadora_id` | uuid (FK → linha_operadora) | Sim | Registro da operadora |
| `tipo_match` | tipo_match | Sim | Tipo de match (protocolo/cpf/telefone/manual) |
| `score_match` | integer | Não | Score de confiança |
| `status_final` | status_conciliacao | Sim | conciliado / divergente / nao_encontrado |
| `validado_por` | uuid | Não | Quem validou |
| `validado_em` | timestamptz | Não | Quando validou |
| `observacao` | text | Não | Observação |
| `created_at` / `updated_at` | timestamptz | Sim | Timestamps |

### 4.8 `estornos`
Registros de estornos/chargebacks importados.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `referencia_desconto` | text | Sim | Referência do desconto |
| `valor_estornado` | numeric | Sim | Valor do estorno |
| `identificador_make` | text | Não | ID Make (para match) |
| `protocolo` | text | Não | Protocolo (para match) |
| `cpf_cnpj` | text | Não | CPF/CNPJ |
| `telefone` | text | Não | Telefone |
| `venda_id` | uuid (FK → vendas_internas) | Não | Venda vinculada (se match encontrado) |
| `match_status` | match_status | Sim | MATCHED ou NO_MATCH |
| `importacao_id` | uuid | Sim | ID da importação (lote) |
| `created_by` | uuid | Sim | Quem importou |
| `created_at` | timestamptz | Sim | Data de criação |

### 4.9 `comissionamentos` (Períodos de Competência)

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `nome` | text | Sim | Nome do período |
| `competencia` | text | Sim | Período YYYY-MM |
| `status` | status_comissionamento | Sim | rascunho / em_andamento / finalizado |
| `created_by` | uuid | Sim | Criado por |
| `created_at` / `updated_at` | timestamptz | Sim | Timestamps |

### 4.10 `comissionamento_fontes` (Fontes de Vendas)

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador único |
| `comissionamento_id` | uuid (FK) | Sim | Período vinculado |
| `nome` | text | Sim | Nome da fonte |
| `tipo` | tipo_fonte_comissionamento | Sim | sistema ou arquivo |
| `mapeamento_id` | uuid (FK) | Não | Modelo de mapeamento |
| `filtros` | jsonb | Não | Filtros aplicados (empresa, operadora, vendedor) |
| `vendedor_fixo_id` | uuid (FK) | Não | Vendedor fixo |
| `operadora_fixa_id` | uuid (FK) | Não | Operadora fixa |
| `empresa_id` | uuid (FK) | Não | Empresa |
| `arquivo_nome` | text | Não | Nome do arquivo |

### 4.11 `comissionamento_lal` (Lotes Linha a Linha)

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador |
| `comissionamento_id` | uuid (FK) | Sim | Período |
| `operadora_id` | uuid (FK) | Sim | Operadora |
| `mapeamento_id` | uuid (FK) | Não | Modelo de mapeamento |
| `apelido` | text | Sim | Apelido do lote |
| `tipo_match` | text | Sim | Tipo de match (cpf/protocolo) |
| `arquivo_nome` | text | Não | Nome do arquivo |
| `qtd_registros` | integer | Não | Quantidade de registros |

### 4.12 `comissionamento_vendas` (Tabela de Ligação)
Liga vendas internas ao contexto de um comissionamento específico.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador |
| `comissionamento_id` | uuid (FK) | Sim | Período |
| `venda_interna_id` | uuid (FK) | Sim | Venda |
| `fonte_id` | uuid (FK) | Não | Fonte de origem |
| `linha_operadora_id` | uuid (FK) | Não | Match no LAL |
| `status_pag` | status_pag | Não | OK ou DESCONTADA |
| `receita_interna` | numeric | Não | Receita interna (valor da venda) |
| `receita_lal` | numeric | Não | Receita LAL (valor_lq da operadora) |
| `receita_descontada` | numeric | Não | Valor descontado |
| `lal_apelido` | text | Não | Apelido do lote LAL |
| `comissionamento_desconto` | text | Não | Descrição do desconto |

### 4.13 `mapeamento_colunas` (Modelos — Linha a Linha)
Templates de mapeamento para importação de arquivos de operadoras.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador |
| `operadora_id` | uuid (FK) | Sim | Operadora |
| `nome` | text | Sim | Nome do modelo |
| `mapeamento` | jsonb | Sim | Mapa coluna CSV → campo sistema |
| `ativo` | boolean | Sim | Status |

### 4.14 `mapeamento_vendas` (Modelos — Vendas Internas)
Templates de mapeamento para importação de vendas.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|------------|-----------|
| `id` | uuid (PK) | Sim | Identificador |
| `nome` | text | Sim | Nome do modelo |
| `mapeamento` | jsonb | Sim | Mapa coluna CSV → campo sistema |
| `config` | jsonb | Sim | Config (modo vendedor, operadora, empresa) |
| `ativo` | boolean | Sim | Status |

### 4.15 `mapeamento_estornos` (Modelos — Estornos)
Templates para importação de estornos.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Identificador |
| `nome` | text | Nome do modelo |
| `mapeamento` | jsonb | Mapa de colunas |
| `config` | jsonb | Configurações de match |
| `ativo` | boolean | Status |

### 4.16 `audit_log` (Log Geral)
Auditoria de operações genéricas (importações em massa, etc.).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Identificador |
| `tabela` | text | Tabela afetada |
| `registro_id` | uuid | ID do registro |
| `acao` | text | Ação realizada |
| `dados_anteriores` | jsonb | Estado anterior |
| `dados_novos` | jsonb | Estado novo |
| `usuario_id` | uuid | Quem executou |

### 4.17 `audit_log_vendas` (Log Detalhado de Vendas)
Auditoria granular de alterações em vendas (campo a campo).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Identificador |
| `venda_id` | uuid | Venda afetada |
| `user_id` | uuid | Quem alterou |
| `user_nome` | text | Nome de quem alterou |
| `acao` | text | Tipo da ação |
| `campo` | text | Campo alterado |
| `valor_anterior` | jsonb | Valor anterior |
| `valor_novo` | jsonb | Valor novo |
| `origem` | text | Origem (UI ou API) |
| `metadata` | jsonb | Metadados adicionais |

---

## 5. Banco de Dados — Funções e Triggers

### Funções RPC

| Função | Descrição |
|--------|-----------|
| `has_role(user_id, role)` | Verifica se um usuário possui determinado role. `SECURITY DEFINER` para evitar recursão em RLS. |
| `get_user_usuario_id(user_id)` | Retorna o `id` da tabela `usuarios` a partir do `auth.users.id`. |
| `is_supervisor_of(user_id, usuario_id)` | Verifica se o user autenticado é supervisor do usuario_id. |
| `can_view_venda(user_id, usuario_id)` | Verifica se o user pode visualizar vendas do usuario_id (admin, próprio ou supervisor). |
| `get_subordinates_ids(supervisor_id)` | Retorna IDs de todos os subordinados de um supervisor. |
| `get_dashboard_stats(...)` | Retorna estatísticas agregadas do dashboard com filtros de data, vendedor e supervisor. |
| `get_performance_consultores(...)` | Retorna métricas de performance por consultor com filtros de período. |
| `handle_new_user()` | Trigger function: cria automaticamente um registro em `usuarios` quando um novo user é criado no auth. |
| `update_updated_at_column()` | Trigger function: atualiza o campo `updated_at` automaticamente. |

### Triggers

- `handle_new_user` — Dispara em `INSERT` na tabela `auth.users`, criando o perfil na tabela `usuarios`.

---

## 6. Banco de Dados — Enums

| Enum | Valores | Uso |
|------|---------|-----|
| `app_role` | admin, supervisor, vendedor | Perfis de acesso |
| `status_interno` | nova, enviada, aguardando, confirmada, cancelada, contestacao_enviada, contestacao_procedente, contestacao_improcedente | Status interno das vendas |
| `status_operadora` | aprovado, instalado, cancelado, pendente | Status no relatório da operadora |
| `status_conciliacao` | conciliado, divergente, nao_encontrado | Resultado da conciliação |
| `tipo_match` | protocolo, cpf, telefone, manual | Método de match na conciliação |
| `match_status` | MATCHED, NO_MATCH | Status de match de estornos |
| `status_comissionamento` | rascunho, em_andamento, finalizado | Ciclo de vida do comissionamento |
| `status_pag` | OK, DESCONTADA | Status de pagamento no comissionamento |
| `tipo_fonte_comissionamento` | sistema, arquivo | Origem dos dados da fonte |
| `acao_auditoria` | EDITAR_CAMPO, CONCILIAR, DESCONCILIAR, CONFIRMAR, ESTORNAR, REABRIR_CONTESTACAO, MUDAR_STATUS_INTERNO, MUDAR_STATUS_MAKE, ALTERAR_VALOR, IMPORTACAO_REMOVIDA, CONCILIAR_LOTE | Ações rastreadas pela auditoria |

---

## 7. Políticas de Segurança (RLS)

Todas as tabelas possuem RLS habilitado. Resumo do modelo:

### Padrão Geral
- **Admin**: acesso total (ALL) via `has_role(auth.uid(), 'admin')`
- **Supervisor**: SELECT em dados do time via `is_supervisor_of()`
- **Vendedor**: SELECT apenas em dados próprios via `usuario_id = get_user_usuario_id(auth.uid())`

### Tabelas Públicas (leitura para autenticados)
- `operadoras`, `empresas` — Leitura para qualquer autenticado (ativas ou admin vê todas)
- `mapeamento_colunas`, `mapeamento_vendas`, `mapeamento_estornos` — Leitura para autenticados
- `comissionamentos`, `comissionamento_fontes`, `comissionamento_lal` — Leitura para autenticados

### Tabelas com Controle Estrito
- `vendas_internas` — Admin: ALL; Vendedor: próprias; Supervisor: time
- `conciliacoes` — Admin: ALL; Demais: via `can_view_venda()`
- `estornos` — Admin: ALL; Supervisor: time; Vendedor: próprios
- `audit_log_vendas` — Imutável (sem UPDATE/DELETE); Admin: vê tudo; Supervisor: time; Vendedor: próprios
- `audit_log` — Imutável; Admin: vê tudo; Usuários: próprios registros

---

## 8. Telas e Funcionalidades

### 8.1 Login (`/login`)
- Autenticação por email e senha
- Redirecionamento automático para dashboard após login

### 8.2 Dashboard (`/dashboard`)
- **Indicadores**: Total de vendas, instaladas, confirmadas, canceladas, aguardando
- **Financeiro**: Receita bruta, conciliada, estornos, churn, receita líquida
- **IRL** (Índice de Realização Líquida): Sinalização semafórica (Verde ≥90%, Amarelo 75-89%, Vermelho <75%)
- **Filtros**: Período de venda, período de instalação, vendedor específico, supervisor
- **Dados**: Via RPC `get_dashboard_stats()` para agregação no servidor

### 8.3 Vendas Internas (`/vendas`)
- Lista paginada de todas as vendas com busca e filtros
- Detalhamento de venda com histórico de auditoria
- Edição inline de campos
- Status interno editável
- Visualização de conciliações vinculadas

### 8.4 Nova Venda (`/vendas/nova`)
- Formulário para registro manual de venda
- Campos: cliente, CPF, telefone, operadora, empresa, valor, plano, etc.

### 8.5 Importação de Vendas (`/importacao-vendas`) — Admin
**Assistente em 4 etapas:**
1. **Upload**: Seleção de arquivo CSV
2. **Mapeamento**: Correlação de colunas CSV → campos do sistema. Suporte a modelos salvos.
3. **Pré-visualização**: Preview de 100 linhas com validação visual de vendedor e operadora
4. **Resultado**: Resumo (novas, atualizadas, erros) com correção inline e exportação

**Otimizações técnicas:**
- Parser CSV compatível com RFC 4180
- Deduplicação por `identificador_make` (mantém última ocorrência)
- Verificação de duplicatas em lotes de 200
- Inserção em lotes de 500
- Atualizações em paralelo (Promise.all) em lotes de 50
- UI yielding para evitar congelamento

### 8.6 Linha a Linha / Importação da Operadora (`/linha-operadora`) — Admin
- Importação de arquivos CSV das operadoras
- Cada linha do CSV = 1 registro individual (sem agrupamento)
- Utiliza modelos de mapeamento (`mapeamento_colunas`)
- Filtro por operadora e arquivo de origem

### 8.7 Conciliação (`/conciliacao`) — Admin, Supervisor
- **Processamento sob demanda**: Match automático por CPF, protocolo ou telefone
- **Categorias**: Encontrados, Não Encontrados, Ambíguos, Já Conciliados, Problemas
- **Ações em massa**: Conciliar (status conciliado + confirmada) ou Marcar Divergência
- **Otimização**: Map/Set para matches O(1), busca recursiva sem limite de 1000 rows
- **Filtro por status_make**: Ex: filtrar apenas vendas com status "CHURN"

### 8.8 Divergências (`/divergencias`) — Admin, Supervisor
- **Fila automática** de registros sem vínculo de conciliação
- **Dois modos**: Vendas não confirmadas OU Ordens da operadora sem venda
- **Busca sob demanda**: Dispara apenas após seleção de contexto + filtro
- **Ações**: Vínculo manual de venda ↔ linha operadora
- **Exportação CSV**

### 8.9 Comissionamento (`/comissionamento`) — Admin
**Assistente de 6 etapas:**
1. **Identificação**: Nome e competência (YYYY-MM)
2. **Fontes de Vendas**: Sistema (filtros) ou arquivo (CSV com mapeamento)
3. **Linha a Linha**: Upload de múltiplos lotes com match por CPF ou protocolo
4. **Conciliação**: Vínculo automático e definição de `status_pag` (OK/DESCONTADA)
5. **Estornos**: Importação de descontos por identificador ou protocolo
6. **Painel Final**: Resumo financeiro agregado por vendedor

**Relatórios CSV:**
- **LAL + Conciliação**: Visão da operadora
- **Vendas Internas + Conciliação**: Visão do sistema
- Ambos com separador `;` e BOM UTF-8

**Regras de negócio:**
- `receita_lal` = `valor_lq` da linha operadora (copiado ao conciliar)
- Status `finalizado` bloqueia edições
- Receita Líquida = Σ receitas conciliadas - estornos - churn

### 8.10 Importação de Estornos (`/importacao-estornos`) — Admin
- Upload de CSV de estornos
- Match automático por `identificador_make` ou `protocolo`
- Resultado: MATCHED (vinculado a uma venda) ou NO_MATCH

### 8.11 Performance / Detalhado (`/performance`) — Admin, Supervisor
- Métricas por consultor: total vendas, instaladas, conciliadas, receita, taxa, ticket médio
- Filtros por período de venda e instalação
- Dados via RPC `get_performance_consultores()`

### 8.12 Empresas (`/empresas`) — Admin
- CRUD de empresas (nome, CNPJ, status ativo/inativo)

### 8.13 Operadoras (`/operadoras`) — Admin
- CRUD de operadoras de telecomunicações (nome, status)

### 8.14 Usuários (`/usuarios`) — Admin
- CRUD de usuários (nome, email, CPF, empresa, supervisor, status)
- Vinculação com conta de autenticação

### 8.15 Cadastro em Massa (`/cadastro-massa`) — Admin
- Criação de múltiplos usuários via Edge Function `criar-usuarios-massa`
- Cria conta auth + perfil na tabela `usuarios`

### 8.16 Permissões (`/permissoes`) — Admin
- Gestão de roles (admin/supervisor/vendedor) por usuário
- Atribuição e remoção de permissões

### 8.17 Modelos de Importação (`/mapeamento-colunas`) — Admin
- Gerenciamento de templates de mapeamento organizados em 3 abas:
  - **Linha a Linha** (operadora)
  - **Vendas Internas**
  - **Estornos**

### 8.18 Limpar Dados (`/limpar-dados`) — Admin
- Exclusão em massa de dados transacionais para ambiente de testes
- **Tabelas limpáveis**: vendas, comissionamentos, linha operadora, conciliações, estornos, audit logs
- **Preserva**: usuários, empresas, operadoras, modelos de mapeamento
- **Segurança**: Requer digitação de "APAGAR" para confirmar

---

## 9. Edge Functions (APIs Backend)

### 9.1 `criar-venda`
- **Método**: POST
- **Função**: Cria uma nova venda interna via API (integração externa, ex: n8n/Make)
- **Retorno**: HTTP 200 em todos os cenários (sucesso ou falha no JSON)

### 9.2 `consultar-venda`
- **Método**: POST
- **Função**: Consulta uma venda por `identificador_make`
- **Retorno**: HTTP 200 com `encontrada: true/false`

### 9.3 `atualizar-venda`
- **Método**: POST
- **Função**: Atualiza campos de uma venda existente
- **Retorno**: HTTP 200 com `sucesso: true/false`

### 9.4 `criar-usuarios-massa`
- **Método**: POST
- **Função**: Cria múltiplos usuários (auth + perfil) em lote
- **Uso**: Tela de Cadastro em Massa

### 9.5 `reset-user-password`
- **Método**: POST
- **Função**: Reseta a senha de um usuário (admin)

> **Nota**: Todas as APIs retornam HTTP 200 mesmo em erros para não interromper fluxos de automação.

---

## 10. Fluxos de Negócio

### 10.1 Fluxo de Venda

```
Registro (manual ou importação CSV)
  → status_interno: "aguardando"
  → Importação da operadora (Linha a Linha)
  → Conciliação (match automático ou manual)
  → status_interno: "confirmada" (se conciliada)
  → Comissionamento (cálculo de receita)
```

### 10.2 Fluxo de Conciliação

```
Venda Interna ←→ Linha Operadora
  Match por: CPF, Protocolo ou Telefone
  → Conciliado: venda confirmada + valor LAL registrado
  → Divergente: marcada para revisão
  → Não encontrado: sem match na operadora
```

### 10.3 Fluxo de Comissionamento

```
1. Criar período (competência YYYY-MM)
2. Definir fontes de vendas (sistema ou arquivo)
3. Importar Linha a Linha (CSV da operadora)
4. Executar conciliação (match + status_pag)
5. Importar estornos (descontos)
6. Painel final: receita líquida por vendedor
7. Finalizar (bloqueia edições)
```

### 10.4 Ciclo de Status Interno

```
nova → enviada → aguardando → confirmada
                            → cancelada
                            → contestacao_enviada → contestacao_procedente
                                                  → contestacao_improcedente
```

---

## 11. Serviços e Utilitários

### `src/services/auditService.ts`
- `registrarAuditoria(entry)` — Registra um evento de auditoria individual
- `registrarAuditoriaBatch(entries)` — Registra múltiplos eventos em lote
- `buscarAuditoriaVenda(vendaId, page, pageSize)` — Busca histórico paginado de uma venda

### `src/lib/parseCSV.ts`
- Parser CSV compatível com RFC 4180
- Suporta campos entre aspas, separadores dentro de campos, quebras de linha em campos
- Detecção automática de separador (`;` ou `,`)

### `src/lib/normalizeCpfCnpj.ts`
- `normalizeCpfCnpj(value)` — Remove caracteres não numéricos
- `normalizeCpfCnpjForMatch(value)` — Remove zeros à esquerda para comparação

### `src/lib/normalizeProtocolo.ts`
- `normalizeProtocolo(protocolo)` — Pad de 7 dígitos para 8 (adiciona zero à esquerda)

### `src/contexts/AuthContext.tsx`
- Contexto global de autenticação
- Expõe: `user`, `role`, `vendedor`, `isAdmin`, `isSupervisor`, `isVendedor`
- Métodos: `signIn()`, `signOut()`, `refreshUserData()`

### `src/hooks/usePeriodFilter.ts`
- Hook para gerenciamento de filtros de período (data início/fim)

---

## 12. Estrutura de Arquivos

```
src/
├── App.tsx                          # Rotas e providers
├── main.tsx                         # Entry point
├── index.css                        # Design tokens (Tailwind)
│
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx            # Layout principal com sidebar
│   │   ├── AppHeader.tsx            # Header
│   │   └── AppSidebar.tsx           # Navegação lateral
│   │
│   ├── auth/
│   │   └── ProtectedRoute.tsx       # Guarda de rotas por role
│   │
│   ├── comissionamento/
│   │   ├── ComissionamentoWizard.tsx # Assistente principal
│   │   ├── StepVendasInternas.tsx   # Etapa: fontes de vendas
│   │   ├── StepLinhaALinha.tsx      # Etapa: importação LAL
│   │   ├── StepConciliacao.tsx      # Etapa: conciliação
│   │   ├── StepEstornos.tsx         # Etapa: estornos
│   │   └── StepPainelFinal.tsx      # Etapa: painel final
│   │
│   ├── importacao/
│   │   └── HistoricoImportacoes.tsx # Histórico de importações
│   │
│   ├── divergencias/
│   │   └── VinculoManualDialog.tsx  # Dialog de vínculo manual
│   │
│   ├── mapeamento/
│   │   ├── MapeamentoColunas.tsx    # Gerenciador LAL
│   │   ├── MapeamentoVendasManager.tsx # Gerenciador vendas
│   │   └── MapeamentoEstornosManager.tsx # Gerenciador estornos
│   │
│   ├── audit/
│   │   └── AuditLogPanel.tsx        # Painel de auditoria
│   │
│   └── ui/                          # Componentes shadcn/ui
│
├── contexts/
│   └── AuthContext.tsx               # Contexto de autenticação
│
├── hooks/
│   ├── use-mobile.tsx               # Detecção de mobile
│   ├── use-toast.ts                 # Toast notifications
│   └── usePeriodFilter.ts           # Filtro de período
│
├── lib/
│   ├── utils.ts                     # Utilitários gerais (cn)
│   ├── parseCSV.ts                  # Parser CSV RFC 4180
│   ├── normalizeCpfCnpj.ts         # Normalização CPF/CNPJ
│   └── normalizeProtocolo.ts       # Normalização protocolo
│
├── pages/
│   ├── Login.tsx                    # Tela de login
│   ├── Dashboard.tsx                # Dashboard principal
│   ├── VendasInternas.tsx           # Lista de vendas
│   ├── NovaVenda.tsx                # Nova venda manual
│   ├── LinhaOperadora.tsx           # Importação Linha a Linha
│   ├── Conciliacao.tsx              # Tela de conciliação
│   ├── Divergencias.tsx             # Fila de divergências
│   ├── Comissionamento.tsx          # Gestão de comissionamentos
│   ├── ImportacaoVendas.tsx         # Importação CSV de vendas
│   ├── ImportacaoEstornos.tsx       # Importação de estornos
│   ├── Empresas.tsx                 # CRUD empresas
│   ├── Operadoras.tsx               # CRUD operadoras
│   ├── Usuarios.tsx                 # CRUD usuários
│   ├── GestaoRoles.tsx              # Gestão de permissões
│   ├── MapeamentoColunas.tsx        # Modelos de importação
│   ├── PerformanceConsultor.tsx     # Relatório de performance
│   ├── CadastroMassa.tsx            # Cadastro em massa
│   ├── LimparDados.tsx              # Limpeza de dados
│   └── NotFound.tsx                 # 404
│
├── services/
│   └── auditService.ts             # Serviço de auditoria
│
├── types/
│   └── database.ts                  # Tipos TypeScript
│
└── integrations/
    └── supabase/
        ├── client.ts                # Cliente Supabase (auto-gerado)
        └── types.ts                 # Tipos do banco (auto-gerado)

supabase/
├── config.toml                      # Configuração Supabase
├── migrations/                      # Migrações SQL
└── functions/
    ├── criar-venda/                 # API: criar venda
    ├── consultar-venda/             # API: consultar venda
    ├── atualizar-venda/             # API: atualizar venda
    ├── criar-usuarios-massa/        # API: cadastro em massa
    └── reset-user-password/         # API: reset de senha
```

---

## 13. Lógica de Processamento e Cálculos Detalhados

### 13.1 Importação de Vendas Internas (`/importacao-vendas`)

**Processamento em 4 fases:**

#### Fase 1 — Verificação de Duplicatas (0-10% progresso)
```
Para cada identificador_make do CSV:
  → Busca no banco se já existe via SELECT ... IN (lotes de 200)
  → Monta Map<identificador_make, id_existente>
```

#### Fase 2a — Deduplicação Interna do Arquivo
```
Para cada linha do CSV:
  SE identificador_make vazio → erro "identificador_make vazio"
  SE identificador_make já visto no arquivo → substitui pela última ocorrência
  (mantém sempre a ÚLTIMA linha com o mesmo identificador)
```

#### Fase 2b — Validação e Construção dos Registros
```
Para cada linha deduplicada:
  1. Parsing de data_venda (flexível: DD/MM/YY, MM/DD/YY, YYYY-MM-DD, com/sem hora)
     → Se ambíguo (ambos ≤ 12), assume formato US (MM/DD)
     → Ano de 2 dígitos: 0-49 → 20XX, 50-99 → 19XX
  2. Busca vendedor:
     - Modo "column_cpf": normaliza CPF (só dígitos), busca match exato em usuarios.cpf
     - Modo "column_email": match case-insensitive em usuarios.email
     - Modo "fixed": usa o vendedor fixo selecionado
  3. Busca operadora:
     - Modo "fixed": usa a operadora selecionada
     - Modo "column": match case-insensitive pelo nome
  4. Normalização de dados:
     - CPF/CNPJ: remove tudo exceto dígitos
     - Telefone: remove tudo exceto dígitos
     - Protocolo: se 7 dígitos, adiciona zero à esquerda (→ 8 dígitos)
     - Valor: substitui vírgula por ponto, remove caracteres não numéricos
  5. Decisão insert vs update:
     - SE identificador_make existe no banco → UPDATE (sem alterar status_interno)
     - SE não existe → INSERT com status_interno = 'aguardando'
```

#### Fase 3 — Inserção (10-80% progresso)
```
Lotes de 500 registros:
  → INSERT em batch
  → Se batch falhar: fallback para insert um a um (com yield a cada 10)
  → Yield de 30ms entre batches
```

#### Fase 4 — Atualização (80-100% progresso)
```
Lotes de 50 registros:
  → UPDATE via Promise.all (paralelo dentro do lote)
  → Yield de 30ms entre lotes
```

#### Pós-processamento
```
→ Busca IDs das vendas recém-inseridas (lotes de 200)
→ Registra audit_log com acao='IMPORTACAO_MASSA' (arquivo, totais, venda_ids)
```

---

### 13.2 Importação Linha a Linha (`/linha-operadora`)

**Processamento direto sem agrupamento:**

```
Para cada linha do CSV:
  1. Aplica mapeamento (modelo de colunas selecionado):
     coluna_csv → campo_sistema (ex: "DOCUMENTO" → "cpf_cnpj")
  2. Normalização de valor:
     valor_str.replace(',', '.').replace(não-numéricos)
  3. Cada linha vira 1 registro individual:
     {
       operadora: nome_selecionada,
       protocolo_operadora: mapeado ou null,
       cpf_cnpj: mapeado ou null,
       cliente_nome: mapeado ou null,
       valor: parseFloat(valor_str),
       valor_lq: parseFloat(valor_str),   ← CÓPIA do valor (valor líquido)
       apelido: apelido_do_lote,
       arquivo_origem: nome_do_arquivo,
       status_operadora: mapeado ou 'pendente'
     }
  4. Inserção em lotes de 500
```

**Importante:** `valor_lq` é inicializado com o mesmo valor de `valor`. Este campo é usado no comissionamento como "receita da operadora".

**Exclusão de importação:**
```
1. Busca todos os IDs de linha_operadora do lote (por apelido ou arquivo_origem)
2. Deleta conciliacoes vinculadas (em lotes de 500)
3. Deleta as linhas do lote
```

---

### 13.3 Conciliação Avulsa (`/conciliacao`)

**Processamento de match (por arquivo selecionado):**

#### Etapa 1 — Carregamento
```
1. Busca todas linhas do arquivo (fetchAllRows, sem limite de 1000)
2. Busca conciliações existentes para essas linhas (em lotes de 200)
3. Busca vendas com status_make LIKE 'instalad%' ou 'churn%' (fetchAllRows)
```

#### Etapa 2 — Indexação O(1)
```
Constrói 3 Maps a partir das vendas:
  vendaByProtocolo: Map<protocolo_interno, VendaInterna[]>
  vendaByCpf:       Map<cpf_normalizado, VendaInterna[]>
  vendaByTelefone:  Map<telefone_9dig, VendaInterna[]>

Normalização:
  CPF: remove tudo exceto dígitos
  Telefone: remove tudo exceto dígitos, pega últimos 9
```

#### Etapa 3 — Matching (em lotes de 500 com yield)
```
Para cada linha do arquivo da operadora:
  SE já conciliada → categoria "Já Conciliados"
  SE sem protocolo, CPF e telefone → categoria "Problemas" (sem chave de match)
  
  Busca candidatos na ordem de prioridade:
    1º Protocolo (score 100) → match exato protocolo_operadora == protocolo_interno
    2º CPF (score 90)        → match por CPF normalizado (somente se protocolo não encontrou)
    3º Telefone (score 70)   → match por últimos 9 dígitos (somente se nenhum anterior encontrou)
  
  Resultado:
    0 candidatos → "Não Encontrados"
    1 candidato  → "Encontrados" (com score)
    2+ candidatos → "Ambíguos"
  
  Detecção de duplicatas no arquivo:
    Se a mesma chave (protocolo/cpf/tel) aparece 2x no arquivo → "Duplicados"
```

#### Etapa 4 — Persistência (ação "Conciliar Todos")
```
Em lotes de 50:
  1. INSERT em conciliacoes:
     { venda_interna_id, linha_operadora_id, tipo_match, status_final, score_match, validado_por }
  
  2. UPDATE em vendas_internas:
     - status_interno → 'confirmada' (se conciliado) ou 'aguardando' (se divergente)
     - valor → valor_lq da linha operadora (sincroniza receita)
       ⚠️ SÓ atualiza valor se status_final != 'divergente' E valor_lq não é null
  
  3. Auditoria:
     - Registro CONCILIAR_LOTE (tipo_match, linha_id, arquivo)
     - Se valor mudou: registro ALTERAR_VALOR (valor anterior → valor_lq)
```

#### Match Manual (para "Não Encontrados")
```
1. Usuário busca e seleciona uma venda manualmente
2. INSERT em conciliacoes com tipo_match = 'manual'
3. UPDATE venda status_interno → 'confirmada'
4. Registro de auditoria CONCILIAR
```

---

### 13.4 Conciliação no Comissionamento (`StepConciliacao`)

**Pré-conciliação automática (em memória):**

```
1. Carrega todos os comissionamento_vendas do período
2. Carrega todos os comissionamento_lal (lotes LAL) do período
3. Para cada LAL, busca as linhas_operadora pelo apelido

Indexação:
  linhasByProtocolo: Map<protocolo, linha_operadora[]>  ← ARRAY (combos!)
  linhasByCpf:       Map<cpf_normalizado, linha_operadora[]>

Para cada venda no comissionamento (que ainda não tem vínculo):
  Testa cada LAL na ordem de prioridade:
    SE tipo_match do LAL = 'protocolo':
      Busca linhas com mesmo protocolo_interno
    SE tipo_match do LAL = 'cpf':
      Busca linhas com mesmo CPF normalizado (sem zeros à esquerda)
  
  SE encontrou match:
    ★ SOMA o valor_lq de TODAS as linhas com mesma chave ★
    (ex: combo com 3 produtos → soma dos 3 valor_lq)
    Marca a chave como "usada" (evita duplicar)
    Atribui matched_linha_id = primeiro registro do grupo
    Atribui matched_valor_lq = SOMA total
```

**Persistência (ação "Marcar como OK" ou "Marcar como DESCONTADA"):**

```
Em lotes de 50 (Promise.all):
  UPDATE comissionamento_vendas:
    - status_pag: 'OK' ou 'DESCONTADA'
    - SE pré-matched mas não salvo:
      - linha_operadora_id: matched_linha_id
      - receita_lal: matched_valor_lq (soma dos valor_lq)
      - lal_apelido: apelido do lote
```

---

### 13.5 Importação de Estornos (`/importacao-estornos`)

```
1. Carrega TODAS as vendas (fetchAll, sem limite 1000):
   { id, identificador_make, protocolo_interno, cpf_cnpj, telefone }

2. Constrói Maps de lookup:
   byMake:      Map<identificador_make, venda_id>
   byProtocolo: Map<protocolo_interno, venda_id>
   byCpfTel:    Map<"cpf_telefone", venda_id>

3. Para cada linha do CSV:
   Validação:
     - valor_estornado > 0 e numérico
     - referencia_desconto não vazio
   
   Match (prioridade):
     1º identificador_make (match exato)
     2º protocolo (match exato)
     3º cpf + telefone combinados (match exato da concatenação)
   
   Resultado:
     vendaId encontrado → match_status = 'MATCHED'
     não encontrado     → match_status = 'NO_MATCH'

4. Inserção em lotes de 200
   Se batch falhar → fallback um a um

5. Auditoria: audit_log com acao='IMPORTACAO_ESTORNOS'
```

---

### 13.6 Dashboard — Cálculos (`get_dashboard_stats`)

**Executado via RPC no servidor (PostgreSQL):**

```
Filtros aplicados:
  - data_venda BETWEEN _data_inicio AND _data_fim
  - data_instalacao BETWEEN _data_instalacao_inicio E _data_instalacao_fim (opcional)
  - usuario_id = _usuario_id (opcional)
  - supervisor subordinados (opcional)
  - RLS: admin vê tudo, supervisor vê time, vendedor vê próprio

Métricas calculadas:
  total_vendas        = COUNT(*)
  vendas_instaladas   = COUNT WHERE status_make ILIKE 'instalad%'
  vendas_confirmadas  = COUNT WHERE status_interno = 'confirmada'
  vendas_canceladas   = COUNT WHERE status_interno = 'cancelada'
  vendas_aguardando   = COUNT WHERE status_interno = 'aguardando'
  valor_total         = SUM(valor) WHERE status_make ILIKE 'instalad%'
  vendas_conciliadas  = COUNT WHERE instalada + EXISTS conciliação conciliada
  valor_conciliado    = SUM(valor) WHERE instalada + EXISTS conciliação conciliada
```

**IRL (calculado no frontend):**
```
IRL = (valor_conciliado / valor_total) × 100

Semáforo:
  Verde:   IRL ≥ 90%
  Amarelo: 75% ≤ IRL < 90%
  Vermelho: IRL < 75%
```

---

### 13.7 Performance de Consultores (`get_performance_consultores`)

```
Por vendedor (GROUP BY usuario_id):
  total_vendas       = COUNT(*)
  vendas_instaladas  = COUNT WHERE status_make ILIKE 'instalad%'
  vendas_conciliadas = COUNT WHERE instalada + conciliação 'conciliado'
  receita_conciliada = SUM(valor) das conciliadas
  taxa_conciliacao   = (vendas_conciliadas / vendas_instaladas) × 100
  ticket_medio       = receita_conciliada / vendas_conciliadas
```

---

### 13.8 Painel Final do Comissionamento (`StepPainelFinal`)

**Agregação por vendedor:**
```
Para cada vendedor que possui vendas no comissionamento:
  Receita Bruta    = SUM(receita_interna) WHERE status_pag = 'OK'
  Receita LAL      = SUM(receita_lal) WHERE status_pag = 'OK'
  Descontos        = SUM(receita_descontada) WHERE status_pag = 'DESCONTADA'
  Receita Líquida  = Receita LAL - Descontos
  
  Total vendas         = COUNT de comissionamento_vendas
  Vendas OK            = COUNT WHERE status_pag = 'OK'
  Vendas Descontadas   = COUNT WHERE status_pag = 'DESCONTADA'
```

---

### 13.9 Normalização de Dados

| Função | Input | Output | Regra |
|--------|-------|--------|-------|
| `normalizeCpfCnpj()` | "093.408.090/0001-37" | "09340809000137" | Remove tudo exceto dígitos |
| `normalizeCpfCnpjForMatch()` | "09340809000137" | "9340809000137" | Remove dígitos + zeros à esquerda |
| `normalizeProtocolo()` | "1234567" | "01234567" | Se 7 dígitos, pad com zero |
| `normalizeTelefone()` | "(11) 98765-4321" | "987654321" | Remove não-dígitos, últimos 9 |
| `parseDate()` | "10/28/25 13:07" | "2025-10-28" | Strip hora, expande ano, detecta formato |

---

### 13.10 Scores de Match na Conciliação

| Tipo | Score | Prioridade | Critério |
|------|-------|-----------|----------|
| Protocolo | 100 | 1ª | Match exato: protocolo_operadora == protocolo_interno |
| CPF | 90 | 2ª | Match por CPF normalizado (somente se protocolo não encontrou) |
| Telefone | 70 | 3ª | Match pelos últimos 9 dígitos |
| Manual | N/A | Manual | Seleção explícita pelo usuário |

**Regra de fallback:** Só tenta o critério seguinte se o anterior não encontrou match.

---

### 13.11 Lógica de Valor na Conciliação

```
Conciliação Avulsa (/conciliacao):
  → Atualiza vendas_internas.valor COM o valor_lq da linha operadora
  → Sincroniza receita da venda com o efetivamente faturado pela operadora

Conciliação no Comissionamento:
  → NÃO altera vendas_internas.valor
  → Armazena receita_lal em comissionamento_vendas (valor_lq somado)
  → Para combos/multi-produto: SOMA todos os valor_lq do mesmo CPF/protocolo
```

---

*Documentação gerada em Março de 2026. Para a versão mais atualizada, consulte o código-fonte do projeto.*
