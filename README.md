# 🧮 Rachaí

> **Rachou, resolveu.** Divida a conta sem dor de cabeça.

App estilo Splitwise com **infra mínima**: front estático (GitHub Pages) +
Supabase (Postgres) para os dados compartilhados. **Sem login, sem servidor para
manter, sem build.**

**🔗 No ar:** https://danielcordeiro.github.io/rachai/

Crie um **evento**, compartilhe o **link**, cada um lança suas **despesas**
(divisão igual entre quem participou) e o Rachaí calcula **quem paga quem** com o
**menor número de transferências** — e registra os pagamentos conforme acontecem.

---

## ✨ Funcionalidades

O evento abre em 5 abas:

### 💸 Despesas
- Lançar despesa com **descrição, valor, quem pagou** e **participantes**
  (Todos / multi-seleção / atalho por **grupo**).
- Divisão **igual** entre os participantes; total do evento sempre visível.
- Editar/excluir despesa.

### 🛒 Compras
- Lista de itens (**nome + quantidade** em texto livre, ex.: "2 kg").
- Marcar como **comprado** (com contador `X/Y`).
- Após o evento, registrar **o que sobrou** e **o que faltou** por item —
  fica salvo para **consultar no próximo evento** e planejar melhor.
- **Copiar lista** para mandar no grupo.

### 📊 Painel
- **Cards de resumo:** total do evento, média por pessoa, nº de despesas e pessoas.
- **Rosca de participação no consumo** (SVG puro, sem libs) com legenda e %.
- **Por pessoa — pagou × consumiu:** barras comparando desembolso e rateio.
- **Ranking das maiores despesas.**

### 👥 Pessoas
- Cadastrar/renomear/excluir **pessoas**.
- **Grupos** (ex.: "Quarto 1", "Casais") que pré-selecionam membros na despesa.

### 🤝 Acerto
- **Saldo vivo** = despesas − consumo − **pagamentos já registrados**.
- Mostra **só o que ainda falta** acertar, com botão **"✓ Pago"** para registrar
  cada transferência (e **pagamento manual** para valores parciais).
- **Despesas lançadas depois do acerto recalculam sozinhas, sem perder os
  pagamentos já feitos.** Pagamentos ficam listados e podem ser desfeitos.
- **Copiar resumo** do acerto.

### Em todo o app
- **Mobile-first**; **"Quem é você?"** salvo no aparelho (preenche você como pagador).
- Link compartilhável por **UUID** (`#/e/<uuid>`), com botão de compartilhar/copiar.
- Valores em **centavos inteiros** — sem erro de arredondamento, a soma sempre fecha.

---

## 📁 Estrutura

```
index.html          # shell da página
config.js           # URL + publishable key do Supabase (pública por design)
config.example.js   # modelo do config.js
styles.css          # estilos (mobile-first)
package.json        # apenas o script de testes (o app não tem build)
js/
  app.js            # roteamento (hash) + telas + formulários
  db.js             # client Supabase + chamadas RPC
  settlement.js     # cálculo de saldos, acerto vivo e minimização de transferências
  ui.js             # helpers (DOM, moeda, parsing de valor, toast, clipboard)
supabase/
  schema.sql        # tabelas + RLS + funções RPC (rodar 1x no Supabase)
tests/
  unit.mjs          # testes das funções financeiras (node tests/unit.mjs)
docs/plans/         # documento de design
```

---

## 🔐 Segurança e integridade

**Acesso (sem login):**
- As tabelas têm **RLS habilitada sem policy pública** → a *publishable key*
  (pública por natureza) **não lê/escreve as tabelas direto**.
- Todo acesso passa por **funções RPC `SECURITY DEFINER`**.
- O controle de acesso é **conhecer o UUID do evento** (v4, não adivinhável).
  Quem tem o link, edita — modelo ideal para grupos de amigos.

**Integridade financeira:**
- Cálculo 100% em **centavos inteiros** (nunca ponto flutuante).
- Soma dos saldos sempre **= 0**; o resto da divisão é distribuído centavo a centavo.
- Botões de gravação **desabilitam durante a operação** (evita lançamento/pagamento
  em dobro por toque repetido).
- Não é possível excluir uma pessoa com **despesas ou pagamentos** vinculados
  (evita despesa órfã / dinheiro "sumindo").
- Funções puras cobertas por **testes automatizados** (ver abaixo).

> ⚠️ Como qualquer pessoa com o link edita, dois **aparelhos diferentes** poderiam
> registrar o mesmo pagamento ao mesmo tempo. O caso fica visível na lista de
> pagamentos e é reversível pelo ↩️ desfazer.

---

## 🧪 Testes

As funções financeiras (parsing de valores e cálculo do acerto) têm testes sem
dependências externas:

```bash
npm test          # ou: node tests/unit.mjs
```

Cobrem: parsing de valor (incl. desambiguação `"1.500"` → R$ 1.500,00), divisão
com sobra de centavos, "pago × consumido", acerto vivo com pagamentos, e um
**teste de propriedade com 200 cenários aleatórios** (as transferências sempre
quitam todos os saldos, nunca são ≤ 0 e somam ≤ n−1). Detalhes em `tests/README.md`.

---

## 🧠 Algoritmo do acerto

1. Para cada despesa: o pagador é creditado com o valor cheio; cada participante é
   debitado de `valor / nº de participantes`. O **resto** em centavos vai para os
   primeiros participantes, então a soma fecha exatamente.
2. `saldo = pagou − consumiu` por pessoa (positivo recebe, negativo paga).
3. **Pagamentos registrados** abatem o saldo: quem pagou tem a dívida reduzida,
   quem recebeu tem o crédito reduzido (o "acerto vivo").
4. **Greedy**: ordena credores e devedores em ordem decrescente e casa o maior
   devedor com o maior credor, repetidamente → mínimo prático de transferências.

---

## ▶️ Rodar localmente

Como são ES Modules, sirva por HTTP (não abra via `file://`):

```bash
python -m http.server 8000   # ou:  npx serve .
```

Acesse `http://localhost:8000`.

---

## ⚙️ Backend (Supabase)

O `supabase/schema.sql` **já está aplicado** no projeto em uso e o `config.js`
já está preenchido.

Para recriar em outro projeto:
1. **SQL Editor** do Supabase → cole `supabase/schema.sql` → **Run**.
2. Copie `Project Settings → API` para o `config.js` (`URL` e a *publishable key*).

---

## 🚀 Publicar no GitHub Pages

```bash
git add . && git commit -m "deploy"
git push origin main
```

Em **Settings → Pages → Deploy from a branch → `main` / `(root)`**. Em ~1 min o app
fica no ar. **Sem Actions, sem build — atualizar é só dar `push`.**

---

## 🛠️ Stack

- HTML + CSS + JavaScript (ES Modules) — **zero build**.
- [`@supabase/supabase-js`](https://supabase.com/) via CDN (esm.sh).
- Supabase Postgres + PostgREST (RPC), gráficos em **SVG puro**.
