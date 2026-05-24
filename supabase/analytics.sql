-- ============================================================================
-- Rachaí — analytics nativo (privacy-first, sem cookies, sem dados pessoais)
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- Seguro para rodar de novo: usa IF NOT EXISTS / CREATE OR REPLACE.
--
-- Modelo de segurança igual ao schema.sql: RLS ligado e SEM policy pública.
-- A anon key (pública) só consegue chamar track(); o relatório
-- analytics_summary() é restrito ao service_role (chave secreta do servidor).
-- ============================================================================

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  name        text not null,             -- 'pageview', 'donate_copy', 'copy_resume', 'event_create'
  path        text not null default '',  -- rota normalizada: 'home' | 'event' (sem ids, sem PII)
  session_id  text not null default '',  -- id anônimo do navegador (não-PII), p/ contar visitantes
  referrer    text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists analytics_events_name_idx    on public.analytics_events(name);
create index if not exists analytics_events_created_idx  on public.analytics_events(created_at);

alter table public.analytics_events enable row level security;

-- track: registra um evento de uso. SECURITY DEFINER => ignora RLS.
-- Trunca os campos para limitar abuso e nunca lança (analytics não pode quebrar o app).
create or replace function public.track(
  p_name text, p_path text, p_session text, p_referrer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_name), '') = '' then
    return;
  end if;
  insert into analytics_events(name, path, session_id, referrer)
  values (
    left(btrim(p_name), 64),
    left(coalesce(p_path, ''), 64),
    left(coalesce(p_session, ''), 64),
    left(coalesce(p_referrer, ''), 200)
  );
exception when others then
  return; -- jamais propaga erro para o cliente
end;
$$;

-- analytics_summary: relatório agregado dos últimos p_days dias.
-- Restrito ao service_role (não é exposto à anon key), então só quem tem a
-- chave secreta do projeto consegue ler as métricas.
create or replace function public.analytics_summary(p_days integer default 7)
returns json
language sql
security definer
set search_path = public
as $$
  with win as (
    select * from analytics_events
    where created_at >= now() - (greatest(coalesce(p_days, 7), 1) || ' days')::interval
  )
  select json_build_object(
    'days', greatest(coalesce(p_days, 7), 1),
    'total_events', (select count(*) from win),
    'unique_sessions', (select count(distinct session_id) from win where session_id <> ''),
    'by_name', coalesce((
      select json_object_agg(name, c)
      from (select name, count(*) c from win group by name order by count(*) desc) t
    ), '{}'::json),
    'by_day', coalesce((
      select json_agg(json_build_object('day', d, 'events', c, 'sessions', s) order by d)
      from (
        select date_trunc('day', created_at)::date d, count(*) c, count(distinct session_id) s
        from win group by 1
      ) t
    ), '[]'::json)
  );
$$;

-- Permissões.
revoke all on public.analytics_events from anon, authenticated;
-- track: liberado para o client (anon).
grant execute on function public.track(text, text, text, text) to anon, authenticated;
-- relatório: somente service_role (mantém as métricas fora do alcance da chave pública).
revoke all on function public.analytics_summary(integer) from anon, authenticated, public;
grant execute on function public.analytics_summary(integer) to service_role;
