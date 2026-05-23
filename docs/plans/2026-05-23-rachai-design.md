# Rachaí — Design

> Divida a conta sem dor de cabeça. App estilo Splitwise com infra mínima.
> Data: 2026-05-23

## Objetivo

Criar um app onde se cria um **evento** (gera UUID compartilhável), cadastram-se
**pessoas** e **grupos**, lançam-se **despesas** (divisão igual entre os
participantes escolhidos) e, ao finalizar, calcula-se o **acerto com o menor
número de transferências possível**.

## Decisões (validadas com o usuário)

- **Divisão igual** por despesa (entre os participantes selecionados).
- **Acerto** mostra "quem paga quem" minimizando o número de transferências.
- **Sem login**: quem tem o link (UUID) vê e edita tudo.
- **Infra mínima**: front estático no **GitHub Pages**, dados no **Supabase free**.

## Arquitetura

- **Frontend zero-build**: `index.html` + módulos JS (`js/*.js`) + `styles.css`.
  Roteamento por hash (`#/e/<uuid>`). Mobile-first. Supabase JS via CDN (ESM).
  Deploy = `git push` (sem GitHub Actions, sem Node build).
- **Backend Supabase**: todo acesso via **funções RPC `SECURITY DEFINER`**.
  As tabelas têm RLS habilitada **sem policy pública** → a `anon key` (pública
  por natureza) só executa as funções; não consegue ler/dumpar as tabelas.
  Controle de acesso = conhecer o UUID do evento (v4, não adivinhável).
- **Cálculo do acerto**: no cliente (`js/settlement.js`).

## Modelo de dados

```
events(id uuid pk, name, currency='BRL', closed bool, created_at)
people(id uuid pk, event_id fk, name, created_at)
groups(id uuid pk, event_id fk, name)
group_members(group_id fk, person_id fk)  pk(group_id, person_id)
expenses(id uuid pk, event_id fk, payer_id fk, description, amount_cents int, created_at)
expense_shares(expense_id fk, person_id fk)  pk(expense_id, person_id)
```

Valores sempre em **centavos (int)** para evitar erro de ponto flutuante.

## Funções RPC (anon EXECUTE)

- `create_event(name) -> uuid`
- `get_event(event) -> json`  (snapshot completo: event, people, groups, members, expenses, shares)
- `add_person(event, name) -> uuid` / `rename_person(person, name)` / `delete_person(person)`
- `add_group(event, name, member_ids[]) -> uuid` / `update_group(group, name, member_ids[])` / `delete_group(group)`
- `add_expense(event, payer, description, amount_cents, participant_ids[]) -> uuid`
- `update_expense(expense, payer, description, amount_cents, participant_ids[])` / `delete_expense(expense)`
- `set_event_closed(event, closed)`

`delete_person` lança exceção se a pessoa for pagadora de alguma despesa.

## Telas / fluxo

1. **Início**: *Criar evento* → nome → gera UUID → abre o evento e mostra o
   **link compartilhável + copiar**.
2. **Evento** (3 abas):
   - **Pessoas**: incluir/renomear/excluir; criar **grupos** (nome + membros).
   - **Despesas**: quem pagou, valor, descrição, participantes
     (todos / multi-select / escolher grupo pré-seleciona).
   - **Acerto**: *Calcular* → saldo por pessoa + lista mínima de transferências.
3. **"Quem é você?"** salvo no `localStorage` do evento → preenche você como
   pagador padrão ao lançar despesa.

## Algoritmo do acerto

1. Para cada despesa: pagador recebe `+amount_cents`; cada participante deve
   `floor(amount/n)` e os primeiros `resto` participantes pagam +1 centavo (a
   soma fecha exatamente).
2. `saldo = pagou − devia` por pessoa.
3. Greedy: ordena credores e devedores desc.; casa repetidamente o maior devedor
   com o maior credor (`min(|devedor|, credor|)`). Gera o mínimo prático de
   transferências (mesma abordagem do Splitwise).

## Tratamento de borda

- Estados vazios em todas as abas.
- Erros de rede → toast com retry.
- Confirmação ao excluir pessoa/grupo/despesa.
- Excluir pessoa pagadora → bloqueado com mensagem clara.

## Configuração necessária (documentada no README)

1. Criar projeto Supabase (free) e rodar `supabase/schema.sql`.
2. Preencher `config.js` com `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
3. Criar repo no GitHub, push, ativar Pages (branch `main`, pasta `/root`).
