-- =====================================================================
-- Lembrete diário de prazos (notificação no celular, dias úteis às 8h de Brasília).
-- A função agendada da Netlify (chave secreta = service_role) chama reminders_claim, que numa
-- só operação: acha quem tem tarefa ABERTA (antes de Aprovado) vencendo até p_until (ou atrasada),
-- com notificação ativada e ainda não lembrado em p_today, e REGISTRA o lembrete — então
-- ninguém recebe duas vezes no mesmo dia, mesmo se a função rodar de novo.
-- Só acrescenta: não altera tabelas nem funções existentes.
-- =====================================================================

create table public.reminder_log (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (profile_id, day)
);

alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
-- sem políticas: nenhum acesso pela API; só a função abaixo (security definer) mexe na tabela

create function public.reminders_claim(p_today date, p_until date)
returns table (profile_id uuid, task_title text, due date)
language sql volatile security definer set search_path = ''
as $$
  with candidates as (
    select a.profile_id, t.title as task_title, t.due
    from public.task_assignees a
    join public.tasks t on t.id = a.task_id
    join public.profiles p on p.id = a.profile_id and p.is_active
    where t.due is not null
      and t.due <= p_until
      and t.status not in ('aprovado', 'entregue')
      and p_until between p_today and p_today + 3
      and exists (select 1 from public.push_subscriptions s where s.profile_id = a.profile_id)
      and not exists (select 1 from public.reminder_log l where l.profile_id = a.profile_id and l.day = p_today)
  ),
  claimed as (
    insert into public.reminder_log (profile_id, day)
    select distinct c.profile_id, p_today from candidates c
    on conflict do nothing
    returning reminder_log.profile_id as claimed_id
  )
  select c.profile_id, c.task_title, c.due
  from candidates c
  join claimed k on k.claimed_id = c.profile_id;
$$;

revoke execute on function public.reminders_claim(date, date) from public, anon, authenticated;
grant execute on function public.reminders_claim(date, date) to service_role;
