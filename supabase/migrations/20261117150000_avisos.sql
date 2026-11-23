-- =====================================================================
-- Avisos (sininho): guarda só QUANDO cada pessoa abriu os avisos pela última vez.
-- Os avisos em si são derivados do histórico das tarefas (task_events), que já existe.
-- Só acrescenta: não altera tabelas nem funções existentes.
-- =====================================================================

create table public.notification_state (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  seen_at     timestamptz not null default now()
);

-- busca dos eventos recentes de todas as tarefas
create index task_events_recent_idx on public.task_events (created_at desc);

alter table public.notification_state enable row level security;
revoke all on public.notification_state from anon, authenticated;
grant select on public.notification_state to authenticated;

-- cada pessoa lê só o próprio registro
create policy "avisos: cada um lê o seu" on public.notification_state
  for select to authenticated using (profile_id = (select auth.uid()) and (select private.is_active_member()));

-- Marca os avisos como vistos AGORA (para quem chama). Gravação só por esta função.
create function public.notifications_mark_seen()
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  t timestamptz := now();
begin
  perform private.require_member();
  insert into public.notification_state (profile_id, seen_at) values (auth.uid(), t)
  on conflict (profile_id) do update set seen_at = excluded.seen_at;
  return t;
end;
$$;

revoke execute on function public.notifications_mark_seen() from public, anon;
grant execute on function public.notifications_mark_seen() to authenticated;
