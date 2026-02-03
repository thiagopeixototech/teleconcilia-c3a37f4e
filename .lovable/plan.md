

## Sistema de Conciliação de Vendas Telecom/Fibra Óptica

### Visão Geral
Sistema web para cruzar vendas registradas internamente com relatórios "linha a linha" das operadoras, permitindo acompanhamento por vendedor, empresa e supervisor.

---

### 🔐 Autenticação e Permissões

**Perfis de usuário (via Supabase Auth + tabela de roles):**
- **Admin**: acesso total, pode editar qualquer registro e criar usuários
- **Supervisor**: vendedor promovido que vê vendas do seu time
- **Vendedor**: vê apenas suas próprias vendas

**Gestão de usuários:**
- Admin cadastra vendedores e supervisores manualmente
- Campo `supervisor_id` na tabela vendedores para hierarquia

---

### 🗄️ Estrutura de Dados

**Tabelas principais:**
1. **empresas** - Cadastro de empresas parceiras
2. **vendedores** - Vendedores com vínculo a empresa e supervisor
3. **vendas_internas** - Vendas registradas pela equipe
4. **linha_operadora** - Dados importados das operadoras
5. **conciliacoes** - Cruzamento entre vendas internas e linhas
6. **user_roles** - Controle de permissões (admin, supervisor, vendedor)
7. **audit_log** - Histórico de alterações de status

---

### 📊 Telas do Sistema

#### 1. Dashboard
- KPIs: total vendas, confirmadas, % conciliação, valor vendido
- Gráficos por empresa e por vendedor
- Filtros por período
- Visão ajustada conforme perfil do usuário

#### 2. Vendas Internas
- Tabela com busca, filtros (vendedor, empresa, status, data) e ordenação
- Edição de status com histórico
- Página de detalhes completa
- Exportação CSV

#### 3. Linha a Linha Operadora
- Listagem dos dados importados das operadoras
- Filtros por operadora, status, quinzena
- Upload de CSV/Excel com parser automático
- Exportação de dados

#### 4. Conciliação
- Lista de vendas com indicador visual de status (conciliado/divergente/não encontrado)
- Ação manual para vincular venda interna com registro da operadora
- Definição do tipo de match (protocolo, CPF, telefone, manual)

#### 5. Divergências
- Vendas internas sem correspondência
- Registros da operadora sem venda interna
- Ações: ignorar, marcar como erro interno, ou venda externa

#### 6. Gestão (Admin)
- Cadastro de empresas
- Cadastro de vendedores e supervisores
- Atribuição de perfis e hierarquias

---

### 🎨 Design

**Estilo Corporativo/Profissional:**
- Cores sóbrias (azul e cinza)
- Visual limpo focado em produtividade
- Layout responsivo com sidebar de navegação
- Tabelas com filtros inline e paginação
- Cards para KPIs e gráficos no dashboard

---

### ⚡ Funcionalidades Técnicas

- CRUD completo de vendas internas
- Upload e parsing de CSV/Excel para importar dados das operadoras
- Sistema de conciliação com score de match
- Auditoria completa (created_at, updated_at, logs de alteração)
- Row Level Security (RLS) para controle de acesso por perfil
- Estrutura preparada para futura integração via API/ETL

