-- ============================================================================
-- Rachaí — API pública por evento (para integração com IA: ChatGPT, Claude…)
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- Seguro para rodar de novo: IF NOT EXISTS / CREATE OR REPLACE.
--
-- Modelo: cada evento tem um api_token próprio (separado do link de view).
-- As funções api_* recebem o token, resolvem o evento e validam. Trabalham
-- com NOMES de pessoas (não UUIDs) e valores em REAIS (não centavos), porque
-- é assim que uma IA recebe a instrução do usuário. O token é a credencial:
-- quem o tem opera só aquele evento; pode ser rotacionado sem trocar o link.
-- ============================================================================

-- Token por evento ------------------------------------------------------------
alter table public.events add column if not exists api_token text;
create unique index if not exists events_api_token_idx on public.events(api_token)
  where api_token is not null;

-- get_api_token: devolve (gerando na primeira vez) o token do evento.
-- Chamado com o UUID do evento (mesma "capability" do link) — granted p/ anon.
create or replace function public.get_api_token(p_event uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_token text;
begin
  select api_token into v_token from events where id = p_event;
  if v_token is null then
    if not exists (select 1 from events where id = p_event) then
      raise exception 'Evento não encontrado';
    end if;
    v_token := 'rch_' || replace(gen_random_uuid()::text, '-', '');
    update events set api_token = v_token where id = p_event;
  end if;
  return v_token;
end;
$$;

-- rotate_api_token: gera um token novo (invalida o anterior).
create or replace function public.rotate_api_token(p_event uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_token text;
begin
  if not exists (select 1 from events where id = p_event) then
    raise exception 'Evento não encontrado';
  end if;
  v_token := 'rch_' || encode(gen_random_bytes(16), 'hex');
  update events set api_token = v_token where id = p_event;
  return v_token;
end;
$$;

-- ----------------------------------------------------------------------------
-- Helpers internos (não expostos à API)
-- ----------------------------------------------------------------------------
create or replace function public._rachai_event_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_event uuid;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Token é obrigatório';
  end if;
  select id into v_event from events where api_token = btrim(p_token);
  if v_event is null then
    raise exception 'Token inválido';
  end if;
  return v_event;
end;
$$;

-- resolve por nome (case-insensitive); cria a pessoa se ainda não existir.
create or replace function public._rachai_resolve_person(p_event uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if v_name = '' then
    raise exception 'Nome da pessoa é obrigatório';
  end if;
  select id into v_id from people
   where event_id = p_event and lower(name) = lower(v_name)
   limit 1;
  if v_id is null then
    insert into people(event_id, name) values (p_event, v_name) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- API: leitura
-- ----------------------------------------------------------------------------
-- Estado completo do evento (mesma estrutura de get_event), achado pelo token.
create or replace function public.api_get_event(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_event uuid;
begin
  v_event := _rachai_event_by_token(p_token);
  return get_event(v_event);
end;
$$;

-- ----------------------------------------------------------------------------
-- API: escrita (nomes + reais)
-- ----------------------------------------------------------------------------
create or replace function public.api_add_person(p_token text, p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_event uuid; v_id uuid;
begin
  v_event := _rachai_event_by_token(p_token);
  v_id := _rachai_resolve_person(v_event, p_name);
  return json_build_object('ok', true, 'person_id', v_id, 'name', btrim(p_name));
end;
$$;

-- Lança uma despesa. p_payer e p_participants são NOMES; p_amount em REAIS.
-- p_participants vazio/nulo OU contendo 'todos' => divide entre todas as pessoas.
create or replace function public.api_add_expense(
  p_token text, p_payer text, p_description text,
  p_amount numeric, p_participants text[] default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid;
  v_payer uuid;
  v_cents integer;
  v_ids uuid[] := '{}';
  v_name text;
  v_expense uuid;
  v_all boolean := false;
begin
  v_event := _rachai_event_by_token(p_token);

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor deve ser maior que zero';
  end if;
  v_cents := round(p_amount * 100)::integer;

  v_payer := _rachai_resolve_person(v_event, p_payer);

  -- "todos": sem participantes, lista vazia, ou menção a todos/all/everyone
  if p_participants is null or array_length(p_participants, 1) is null then
    v_all := true;
  else
    foreach v_name in array p_participants loop
      if lower(btrim(v_name)) in ('todos', 'todas', 'all', 'everyone', 'geral') then
        v_all := true;
      end if;
    end loop;
  end if;

  if v_all then
    select array_agg(id) into v_ids from people where event_id = v_event;
  else
    foreach v_name in array p_participants loop
      v_ids := array_append(v_ids, _rachai_resolve_person(v_event, v_name));
    end loop;
  end if;

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'Nenhum participante para ratear';
  end if;

  insert into expenses(event_id, payer_id, description, amount_cents)
    values (v_event, v_payer, coalesce(btrim(p_description), ''), v_cents)
    returning id into v_expense;
  insert into expense_shares(expense_id, person_id)
    select v_expense, unnest(v_ids);

  return json_build_object(
    'ok', true, 'expense_id', v_expense,
    'amount_cents', v_cents, 'participants', array_length(v_ids, 1));
end;
$$;

create or replace function public.api_add_payment(
  p_token text, p_from text, p_to text, p_amount numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_event uuid; v_from uuid; v_to uuid; v_cents integer; v_id uuid;
begin
  v_event := _rachai_event_by_token(p_token);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor deve ser maior que zero';
  end if;
  v_cents := round(p_amount * 100)::integer;
  v_from := _rachai_resolve_person(v_event, p_from);
  v_to := _rachai_resolve_person(v_event, p_to);
  if v_from = v_to then
    raise exception 'Quem paga e quem recebe não podem ser a mesma pessoa';
  end if;
  insert into payments(event_id, from_id, to_id, amount_cents)
    values (v_event, v_from, v_to, v_cents) returning id into v_id;
  return json_build_object('ok', true, 'payment_id', v_id, 'amount_cents', v_cents);
end;
$$;

create or replace function public.api_add_shopping_item(
  p_token text, p_name text, p_qty text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_event uuid; v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  v_event := _rachai_event_by_token(p_token);
  if v_name = '' then
    raise exception 'Nome do item é obrigatório';
  end if;
  insert into shopping_items(event_id, name, qty)
    values (v_event, v_name, coalesce(btrim(p_qty), '')) returning id into v_id;
  return json_build_object('ok', true, 'item_id', v_id, 'name', v_name);
end;
$$;

-- Marca/desmarca item de compra como comprado, achando pelo nome.
create or replace function public.api_mark_shopping_bought(
  p_token text, p_name text, p_bought boolean default true)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_event uuid; v_id uuid;
begin
  v_event := _rachai_event_by_token(p_token);
  select id into v_id from shopping_items
   where event_id = v_event and lower(name) = lower(btrim(coalesce(p_name, '')))
   order by created_at limit 1;
  if v_id is null then
    raise exception 'Item "%" não encontrado na lista', p_name;
  end if;
  update shopping_items set bought = coalesce(p_bought, true) where id = v_id;
  return json_build_object('ok', true, 'item_id', v_id, 'bought', coalesce(p_bought, true));
end;
$$;

-- ----------------------------------------------------------------------------
-- Permissões: o token é a credencial; as funções ficam liberadas para anon.
-- ----------------------------------------------------------------------------
grant execute on function
  public.get_api_token(uuid),
  public.rotate_api_token(uuid),
  public.api_get_event(text),
  public.api_add_person(text, text),
  public.api_add_expense(text, text, text, numeric, text[]),
  public.api_add_payment(text, text, text, numeric),
  public.api_add_shopping_item(text, text, text),
  public.api_mark_shopping_bought(text, text, boolean)
to anon, authenticated;

-- helpers internos: não expor à API pública
revoke all on function public._rachai_event_by_token(text)        from anon, authenticated, public;
revoke all on function public._rachai_resolve_person(uuid, text)  from anon, authenticated, public;
