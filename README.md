# 🧮 Rachaí

> **Rachou, resolveu.** Divida a conta sem dor de cabeça.

App estilo Splitwise com **infra mínima**: front estático (GitHub Pages) +
Supabase (Postgres) para os dados compartilhados. Sem login, sem servidor para
manter, sem build.

Crie um **evento**, compartilhe o **link**, cada um lança suas **despesas**
(divisão igual entre quem participou) e o Rachaí calcula **quem paga quem** com
o **menor número possível de transferências**.

---

## ✨ Funcionalidades

- Criar evento → gera um **UUID** compartilhável (`#/e/<uuid>`).
- Cadastrar/renomear/excluir **pessoas**.
- **Grupos** (ex.: "Quarto 1") que pré-selecionam pessoas ao lançar despesa.
- Despesas com: descrição, valor, **quem pagou** e **participantes**
  (Todos / multi-seleção / atalho por grupo).
- **"Quem é você?"** salvo no aparelho → já preenche você como pagador.
- Aba **Painel**: cards de resumo (total, média, nº de despesas/pessoas), rosca de
  participação no consumo, total por pessoa (**pagou x consumiu**) e ranking das
  maiores despesas. Gráficos em SVG puro, sem dependências.
- Aba **Acerto**: saldo de cada um + transferências mínimas + copiar resumo.
- Aba **Compras**: lista de itens (nome + quantidade), marcar como **comprado** e
  registrar **o que sobrou** e **o que faltou** — fica salvo no evento para
  consultar no próximo. Copiar lista para mandar no grupo.
- Mobile-first, valores em centavos (sem erro de arredondamento — a soma fecha).

---

## 📁 Estrutura

```
index.html          # shell da página
config.js           # URL + publishable key do Supabase (pública por design)
config.example.js   # modelo do config.js
styles.css          # estilos (mobile-first)
js/
  app.js            # roteamento + telas + formulários
  db.js             # client Supabase + chamadas RPC
  settlement.js     # cálculo de saldos e minimização de transferências
  ui.js             # helpers (DOM, moeda, toast, clipboard)
supabase/
  schema.sql        # tabelas + RLS + funções RPC (rodar 1x no Supabase)
docs/plans/         # documento de design
```

---

## 🔐 Como funciona a segurança (sem login)

- As tabelas têm **RLS habilitada sem policy pública** → a *publishable key*
  (que é pública por natureza) **não consegue ler/escrever as tabelas direto**.
- Todo acesso passa por **funções RPC `SECURITY DEFINER`** em `schema.sql`.
- O controle de acesso é **conhecer o UUID do evento** (v4, não adivinhável).
  Quem tem o link, edita. (Foi a opção escolhida no design — ideal para grupos
  de amigos.)

---

## ✅ Backend (Supabase) — já configurado

O `supabase/schema.sql` **já foi aplicado** no projeto
`wkuykhomucxskelbcpmi` e o `config.js` já está preenchido.

> Se um dia precisar recriar em outro projeto: abra o **SQL Editor** do Supabase,
> cole o conteúdo de `supabase/schema.sql`, clique **Run**. Depois copie
> `Project Settings → API` para o `config.js` (`URL` e a *publishable*/`anon key`).

---

## ▶️ Rodar localmente

Como são ES Modules, abra via um servidor (não pelo `file://`). Qualquer um serve:

```bash
# Python
python -m http.server 8000

# ou Node
npx serve .
```

Acesse `http://localhost:8000`.

---

## 🚀 Publicar no GitHub Pages

1. Crie um repositório no GitHub e suba estes arquivos:
   ```bash
   git init
   git add .
   git commit -m "Rachaí"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/rachai.git
   git push -u origin main
   ```
2. No GitHub: **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
4. Branch: **main**, pasta: **/ (root)**. Salve.
5. Em ~1 min o app fica no ar em
   `https://SEU_USUARIO.github.io/rachai/`.

Pronto — sem Actions, sem build. Atualizar = `git push`.

> **Nome do repositório:** pode usar `rachai`. Se quiser na raiz do domínio
> (`https://SEU_USUARIO.github.io/`), nomeie o repo como
> `SEU_USUARIO.github.io`.

---

## 🧠 Algoritmo do acerto

1. Para cada despesa: o pagador é creditado com o valor cheio; cada participante
   é debitado de `valor / nº de participantes`. O **resto** em centavos é
   distribuído aos primeiros participantes, então a soma fecha exatamente.
2. `saldo = pagou − devia` por pessoa (positivo recebe, negativo paga).
3. **Greedy**: ordena credores e devedores em ordem decrescente e casa
   repetidamente o maior devedor com o maior credor. Resultado: o mínimo prático
   de transferências (mesma ideia do Splitwise).

---

## 🛠️ Stack

- HTML + CSS + JavaScript (ES Modules) — **zero build**.
- [`@supabase/supabase-js`](https://supabase.com/) via CDN (esm.sh).
- Supabase Postgres + PostgREST (RPC).
