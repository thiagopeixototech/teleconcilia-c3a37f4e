# Plano: Módulo de Comissionamento por Competência

## Visão Geral
Migrar o sistema de "conciliação avulsa" para um fluxo guiado de **comissionamento por competência**, com wizard de etapas.

---

## Modelagem de Dados

### 1. Nova tabela: `comissionamentos`
Registro principal de cada comissionamento (competência mensal).

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | uuid PK | Sim | |
| nome | text | Sim | Ex: "Comissionamento Março 2026" |
| competencia | text | Sim | Ex: "2026-03" (YYYY-MM) |
| status | enum | Sim | rascunho / em_andamento / finalizado |
| created_by | uuid | Sim | auth.uid() do criador |
| created_at | timestamptz | Sim | |
| updated_at | timestamptz | Sim | |

**Enum `status_comissionamento`**: `rascunho`, `em_andamento`, `finalizado`

### 2. Nova tabela: `comissionamento_fontes`
Cada fonte de vendas internas vinculada a um comissionamento (etapa 1).

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | uuid PK | Sim | |
| comissionamento_id | uuid FK→comissionamentos | Sim | |
| tipo | enum | Sim | `sistema` ou `arquivo` |
| nome | text | Sim | Nome amigável da fonte |
| mapeamento_id | uuid FK→mapeamento_vendas | Não | Para tipo=arquivo |
| filtros | jsonb | Não | Para tipo=sistema (filtros de data, etc.) |
| vendedor_fixo_id | uuid FK→usuarios | Não | Se vendedor fixo |
| operadora_fixa_id | uuid FK→operadoras | Não | Se operadora fixa |
| empresa_id | uuid FK→empresas | Não | Empresa associada |
| arquivo_nome | text | Não | Nome do arquivo original |
| created_at | timestamptz | Sim | |

**Enum `tipo_fonte_comissionamento`**: `sistema`, `arquivo`

### 3. Nova tabela: `comissionamento_vendas`
Vínculo entre vendas internas e comissionamento (tabela principal de dados por venda).

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | uuid PK | Sim | |
| comissionamento_id | uuid FK→comissionamentos | Sim | |
| venda_interna_id | uuid FK→vendas_internas | Sim | |
| fonte_id | uuid FK→comissionamento_fontes | Não | De qual fonte veio |
| status_pag | enum | Não | OK / DESCONTADA (null=não processada) |
| receita_interna | numeric | Não | Valor da venda interna (R$) |
| receita_lal | numeric | Não | Valor encontrado no LAL (R$) |
| linha_operadora_id | uuid FK→linha_operadora | Não | LAL que fez match |
| lal_apelido | text | Não | Apelido do lote LAL |
| comissionamento_desconto | text | Não | Nome do comissionamento onde apareceu como estorno |
| receita_descontada | numeric | Não | Valor estornado (R$) |
| created_at | timestamptz | Sim | |
| updated_at | timestamptz | Sim | |

**Enum `status_pag`**: `OK`, `DESCONTADA`

**Unique constraint**: (comissionamento_id, venda_interna_id)

### 4. Nova tabela: `comissionamento_lal`
Lotes de Linha a Linha vinculados a um comissionamento (etapa 2).

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | uuid PK | Sim | |
| comissionamento_id | uuid FK→comissionamentos | Sim | |
| mapeamento_id | uuid FK→mapeamento_colunas | Não | Modelo de mapeamento |
| operadora_id | uuid FK→operadoras | Sim | |
| apelido | text | Sim | Nome amigável do lote |
| tipo_match | text | Sim | "protocolo" ou "cpf" |
| arquivo_nome | text | Não | Nome do arquivo original |
| qtd_registros | integer | Não | Quantidade importada |
| created_at | timestamptz | Sim | |

---

## Mapeamento de campos existentes → novos nomes (apenas UI)

| Campo atual (BD) | Nome na UI |
|---|---|
| data_instalacao | dt_atv (data de ativação) |
| identificador_make | id_externo |
| protocolo_interno | protocolo |

> ⚠️ **NÃO renomear no banco.** Só mudar os labels na interface.

---

## Fluxo do Wizard (telas)

### Tela Principal: `/comissionamento`
- Seletor de comissionamento no topo (dropdown com competências)
- Cards de resumo (instaladas, churn, conciliadas, receita bruta, conciliada, estorno, líquida)
- Botões: "Criar novo" / "Atualizar existente"

### Wizard (modal/drawer com etapas):
1. **Etapa 1.1** - Selecionar fontes de vendas internas
2. **Etapa 1.2** - Validar importação de vendas
3. **Etapa 2.1** - Importar LAL (múltiplos lotes)
4. **Etapa 2.2** - Validar LAL
5. **Etapa 3** - Conciliação (com status_pag)
6. **Etapa 4** - Estornos
7. **Etapa 5** - Painel Final (resumo + detalhes + ajustes)

### Telas existentes: manter funcionando em paralelo durante migração gradual.

---

## RLS
- Admin: acesso total a todos os comissionamentos
- Supervisor: visualizar comissionamentos que contenham vendas do seu time
- Vendedor: visualizar apenas dados das próprias vendas dentro do comissionamento

---

## Ordem de execução
1. ✅ Plano documentado
2. ⬜ Criar enums e tabelas no banco (migration)
3. ⬜ Criar tela principal de Comissionamento
4. ⬜ Wizard Etapa 1 (fontes + validação)
5. ⬜ Wizard Etapa 2 (LAL + validação)
6. ⬜ Wizard Etapa 3 (conciliação com status_pag)
7. ⬜ Wizard Etapa 4 (estornos)
8. ⬜ Wizard Etapa 5 (painel final)
