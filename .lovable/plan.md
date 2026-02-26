---

# 🔥 Plano de Alterações Estruturais – Teleconcilia (Versão Corrigida)

## 📌 Resumo Real das Mudanças

Seis mudanças principais:

1. Transformar Divergências em fila automática de vendas não conciliadas
2. Apelido obrigatório na importação do Linha a Linha (nível de lote)
3. Manter coluna "Confirmada" e adicionar nova coluna separada "Linha a Linha"
4. Ajustar filtros da tela Divergências
5. Redesenhar filtros de data para serem independentes (Data Venda + Data Instalação)
6. Aplicar mesma lógica de datas nas telas relevantes

---

# 1️⃣ Banco de Dados – Apelido é do LOTE, não da linha individual

A coluna `apelido` na tabela `linha_operadora` está correta.

Mas a regra precisa ser entendida assim:

- O apelido representa o **lote importado**
- Todas as linhas daquele lote compartilham o mesmo apelido
- Ele não é um campo decorativo, ele será usado para rastrear conciliações

Migração correta:

```
ALTER TABLE public.linha_operadora ADD COLUMN apelido TEXT;
```

---

# 2️⃣ Tela Linha a Linha – Apelido Obrigatório

Arquivo: `LinhaOperadora.tsx`

Regras:

- Campo "Apelido do Lote" obrigatório
- Não permitir importação sem apelido
- O valor deve ser salvo na coluna `apelido`
- A listagem deve exibir o apelido no lugar de `arquivo_origem` (ou como principal identificador do lote)

⚠️ O apelido é o identificador oficial do lote a partir de agora.

---

# 3️⃣ Tela Vendas Internas – DUAS COLUNAS SEPARADAS

⚠️ Aqui estava o erro de interpretação.

## ✔️ Manter coluna atual de status

A coluna que hoje mostra:

- "Confirmada"
- Ou vazio

DEVE continuar existindo exatamente como está.

Essa coluna é apenas um indicador binário de conciliação.

---

## ✔️ Criar nova coluna adicional

Nova coluna separada chamada:

```
Linha a Linha
```

ou

```
Confirmado no Linha a Linha
```

Essa coluna deve:

- Buscar o apelido do `linha_operadora` vinculado à conciliação
- Mostrar o apelido se conciliada
- Ficar vazia se não conciliada

---

### Exemplo esperado:


| Protocolo | Status     | Linha a Linha         |
| --------- | ---------- | --------------------- |
| 12345     | Confirmada | Claro Nov 1ª Quinzena |
| 67890     | &nbsp;     | &nbsp;                |


---

🚫 NÃO substituir a coluna Confirmada  
  
🚫 NÃO juntar status + apelido na mesma coluna

São informações diferentes.

---

# 4️⃣ Redesenho dos Filtros de Data (Mudança Estrutural Real)

Substituir completamente o modelo atual de:

Radio Button:

- Data Venda OU
- Data Instalação

Por:

## Dois blocos fixos independentes

### 🔹 Bloco Data de Venda

- Data Início
- Data Fim

### 🔹 Bloco Data de Instalação

- Data Início
- Data Fim

---

## Regras Obrigatórias

- Nenhum campo vem preenchido automaticamente
- Se apenas Data Venda preenchida → filtra só por venda
- Se apenas Data Instalação preenchida → filtra só por instalação
- Se ambos preenchidos → aplicar AND
- Se nenhum preenchido → não aplicar filtro de data
- A busca só executa ao clicar em "Buscar"

---

## Query condicional correta

```
(_data_venda_inicio IS NULL OR vi.data_venda >= _data_venda_inicio)
AND (_data_venda_fim IS NULL OR vi.data_venda <= _data_venda_fim)
AND (_data_instalacao_inicio IS NULL OR vi.data_instalacao >= _data_instalacao_inicio)
AND (_data_instalacao_fim IS NULL OR vi.data_instalacao <= _data_instalacao_fim)
```

---

# 5️⃣ Tela Divergências – Agora é 100% Automática

Arquivo: `Divergencias.tsx`

## ❌ Remover totalmente:

- Filtro de status_interno
- Qualquer controle manual de status

---

## ✅ Nova regra da tela

Essa tela deve exibir automaticamente:

Vendas que NÃO possuem registro em `conciliacoes` com:

```
status_final = 'conciliado'
```

Ou seja:

Se está conciliada → não aparece  
  
Se não está conciliada → aparece

Simples.

---

## Filtros que devem existir:

- Status Make
- Operadora
- ID Make
- Protocolo
- Vendedor
- Data Venda (bloco independente)
- Data Instalação (bloco independente)

⚠️ Não existe mais filtro de conciliação aqui.

---

# 6️⃣ Tela Performance – Atualizar RPC

Arquivo: `PerformanceConsultor.tsx`

Atualizar RPC para aceitar 4 parâmetros opcionais:

```
_data_venda_inicio
_data_venda_fim
_data_instalacao_inicio
_data_instalacao_fim
```

Remover modelo antigo baseado em um único campo de data.

---

# 7️⃣ Ordem Correta de Execução

1. Migração coluna apelido
2. Migração RPC performance
3. Criar componente reutilizável DateRangeBlock
4. Atualizar LinhaOperadora.tsx
5. Atualizar VendasInternas.tsx
6. Atualizar Divergencias.tsx
7. Atualizar PerformanceConsultor.tsx

---

# 🎯 Objetivo Final

- Divergência 100% automática
- Rastreabilidade por lote
- Status e lote separados corretamente
- Filtros de data flexíveis
- Performance preservada
- Sem ambiguidade de regra