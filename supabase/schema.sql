-- ============================================================================
-- Rachaí — schema completo do Supabase
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- Seguro para rodar de novo: usa IF NOT EXISTS / CREATE OR REPLACE / DROP IF.
-- ============================================================================

-- Extensão para gerar UUID v4 (já vem habilitada no Supabase, mas garantimos).
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  currency   text not null default 'BRL',
  closed     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.people (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists people_event_idx on public.people(event_id);

create table if not exists public.groups (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name     text not null
);
create index if not exists groups_event_idx on public.groups(event_id);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (group_id, person_id)
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  payer_id     uuid not null references public.people(id) on delete restrict,
  description  text not null default '',
  amount_cents integer not null check (amount_cents > 0),
  created_at   timestamptz not null default now()
);
create index if not exists expenses_event_idx on public.expenses(event_id);

create table if not exists public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete cascade,
  primary key (expense_id, person_id)
);

-- Lista de compras do evento (independente das despesas).
create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null,
  qty        text not null default '',   -- quantidade planejada (texto livre: "2 kg")
  bought     boolean not null default false,
  leftover   text not null default '',   -- "sobrou" (preenchido após o evento)
  missing    text not null default '',   -- "faltou" (preenchido após o evento)
  created_at timestamptz not null default now()
);
create index if not exists shopping_event_idx on public.shopping_items(event_id);

-- Pagamentos/reembolsos entre pessoas (acerto registrado).
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  from_id      uuid not null references public.people(id) on delete restrict,
  to_id        uuid not null references public.people(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  created_at   timestamptz not null default now(),
  check (from_id <> to_id)
);
create index if not exists payments_event_idx on public.payments(event_id);

-- ----------------------------------------------------------------------------
-- RLS: habilita e NÃO cria policy pública.
-- Assim a anon key (pública) não consegue ler/escrever direto nas tabelas;
-- só consegue chamar as funções SECURITY DEFINER abaixo.
-- ----------------------------------------------------------------------------
alter table public.events         enable row level security;
alter table public.people         enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_shares enable row level security;
alter table public.shopping_items enable row level security;
alter table public.payments       enable row level security;

-- ============================================================================
-- Funções RPC (gateway). SECURITY DEFINER => rodam como dono e ignoram a RLS.
-- ============================================================================

-- Criar evento -----------------------------------------------------------------
create or replace function public.create_event(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Nome do evento é obrigatório';
  end if;
  insert into events(name) values (btrim(p_name)) returning id into v_id;
  return v_id;
end;
$$;

-- Snapshot completo do evento --------------------------------------------------
create or replace function public.get_event(p_event uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select case when e.id is null then null else json_build_object(
    'event',  json_build_object('id', e.id, 'name', e.name,
                                'currency', e.currency, 'closed', e.closed,
                                'created_at', e.created_at),
    'people', coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name)
                                order by p.created_at)
                        from people p where p.event_id = e.id), '[]'::json),
    'groups', coalesce((select json_agg(json_build_object(
                                  'id', g.id, 'name', g.name,
                                  'member_ids', coalesce(
                                    (select json_agg(gm.person_id)
                                     from group_members gm where gm.group_id = g.id),
                                    '[]'::json))
                                order by g.name)
                        from groups g where g.event_id = e.id), '[]'::json),
    'expenses', coalesce((select json_agg(json_build_object(
                                  'id', x.id, 'payer_id', x.payer_id,
                                  'description', x.description,
                                  'amount_cents', x.amount_cents,
                                  'created_at', x.created_at,
                                  'participant_ids', coalesce(
                                    (select json_agg(s.person_id)
                                     from expense_shares s where s.expense_id = x.id),
                                    '[]'::json))
                                order by x.created_at)
                        from expenses x where x.event_id = e.id), '[]'::json),
    'shopping', coalesce((select json_agg(json_build_object(
                                  'id', i.id, 'name', i.name, 'qty', i.qty,
                                  'bought', i.bought, 'leftover', i.leftover,
                                  'missing', i.missing)
                                order by i.created_at)
                        from shopping_items i where i.event_id = e.id), '[]'::json),
    'payments', coalesce((select json_agg(json_build_object(
                                  'id', pm.id, 'from_id', pm.from_id, 'to_id', pm.to_id,
                                  'amount_cents', pm.amount_cents, 'created_at', pm.created_at)
                                order by pm.created_at)
                        from payments pm where pm.event_id = e.id), '[]'::json)
  ) end
  from events e where e.id = p_event;
$$;

-- Pessoas ----------------------------------------------------------------------
create or replace function public.add_person(p_event uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Nome é obrigatório';
  end if;
  insert into people(event_id, name) values (p_event, btrim(p_name)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.rename_person(p_person uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Nome é obrigatório';
  end if;
  update people set name = btrim(p_name) where id = p_person;
end;
$$;

create or replace function public.delete_person(p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from expenses where payer_id = p_person) then
    raise exception 'Esta pessoa pagou despesas. Remova ou edite essas despesas antes de excluí-la.';
  end if;
  if exists (select 1 from expense_shares where person_id = p_person) then
    raise exception 'Esta pessoa participa de despesas. Edite essas despesas (tirando-a do rateio) antes de excluí-la.';
  end if;
  if exists (select 1 from payments where from_id = p_person or to_id = p_person) then
    raise exception 'Esta pessoa tem pagamentos registrados. Remova esses pagamentos antes de excluí-la.';
  end if;
  delete from people where id = p_person;
end;
$$;

-- Grupos -----------------------------------------------------------------------
create or replace function public.add_group(p_event uuid, p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Nome do grupo é obrigatório';
  end if;
  insert into groups(event_id, name) values (p_event, btrim(p_name)) returning id into v_id;
  insert into group_members(group_id, person_id)
    select v_id, unnest(coalesce(p_member_ids, '{}'::uuid[]));
  return v_id;
end;
$$;

create or replace function public.update_group(p_group uuid, p_name text, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Nome do grupo é obrigatório';
  end if;
  update groups set name = btrim(p_name) where id = p_group;
  delete from group_members where group_id = p_group;
  insert into group_members(group_id, person_id)
    select p_group, unnest(coalesce(p_member_ids, '{}'::uuid[]));
end;
$$;

create or replace function public.delete_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from groups where id = p_group;
end;
$$;

-- Despesas ---------------------------------------------------------------------
create or replace function public.add_expense(
  p_event uuid, p_payer uuid, p_description text,
  p_amount_cents integer, p_participant_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor deve ser maior que zero';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    raise exception 'Selecione ao menos um participante';
  end if;
  insert into expenses(event_id, payer_id, description, amount_cents)
    values (p_event, p_payer, coalesce(btrim(p_description), ''), p_amount_cents)
    returning id into v_id;
  insert into expense_shares(expense_id, person_id)
    select v_id, unnest(p_participant_ids);
  return v_id;
end;
$$;

create or replace function public.update_expense(
  p_expense uuid, p_payer uuid, p_description text,
  p_amount_cents integer, p_participant_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor deve ser maior que zero';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    raise exception 'Selecione ao menos um participante';
  end if;
  update expenses
     set payer_id = p_payer,
         description = coalesce(btrim(p_description), ''),
         amount_cents = p_amount_cents
   where id = p_expense;
  delete from expense_shares where expense_id = p_expense;
  insert into expense_shares(expense_id, person_id)
    select p_expense, unnest(p_participant_ids);
end;
$$;

create or replace function public.delete_expense(p_expense uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from expenses where id = p_expense;
end;
$$;

-- Fechar / reabrir evento ------------------------------------------------------
create or replace function public.set_event_closed(p_event uuid, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update events set closed = p_closed where id = p_event;
end;
$$;

-- Lista de compras -------------------------------------------------------------
create or replace function public.add_shopping_item(p_event uuid, p_name text, p_qty text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Nome do item é obrigatório';
  end if;
  insert into shopping_items(event_id, name, qty)
    values (p_event, btrim(p_name), coalesce(btrim(p_qty), ''))
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_shopping_item(
  p_item uuid, p_name text, p_qty text,
  p_bought boolean, p_leftover text, p_missing text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Nome do item é obrigatório';
  end if;
  update shopping_items
     set name = btrim(p_name),
         qty = coalesce(btrim(p_qty), ''),
         bought = coalesce(p_bought, false),
         leftover = coalesce(btrim(p_leftover), ''),
         missing = coalesce(btrim(p_missing), '')
   where id = p_item;
end;
$$;

create or replace function public.delete_shopping_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from shopping_items where id = p_item;
end;
$$;

-- Pagamentos -------------------------------------------------------------------
create or replace function public.add_payment(
  p_event uuid, p_from uuid, p_to uuid, p_amount_cents integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_from = p_to then
    raise exception 'Quem paga e quem recebe não podem ser a mesma pessoa';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor do pagamento deve ser maior que zero';
  end if;
  insert into payments(event_id, from_id, to_id, amount_cents)
    values (p_event, p_from, p_to, p_amount_cents)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_payment(p_payment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from payments where id = p_payment;
end;
$$;

-- ----------------------------------------------------------------------------
-- Permissões: anon e authenticated podem EXECUTAR as funções (e nada mais).
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant execute on function
  public.create_event(text),
  public.get_event(uuid),
  public.add_person(uuid, text),
  public.rename_person(uuid, text),
  public.delete_person(uuid),
  public.add_group(uuid, text, uuid[]),
  public.update_group(uuid, text, uuid[]),
  public.delete_group(uuid),
  public.add_expense(uuid, uuid, text, integer, uuid[]),
  public.update_expense(uuid, uuid, text, integer, uuid[]),
  public.delete_expense(uuid),
  public.set_event_closed(uuid, boolean),
  public.add_shopping_item(uuid, text, text),
  public.update_shopping_item(uuid, text, text, boolean, text, text),
  public.delete_shopping_item(uuid),
  public.add_payment(uuid, uuid, uuid, integer),
  public.delete_payment(uuid)
to anon, authenticated;
