-- =====================================================================
-- Workspace · LEMBRETE DAS 8H COM GRAVAÇÕES (pedido do usuário em 18/11/2026)
--
-- agenda_claim faz o mesmo que reminders_claim (uma vez por pessoa por dia, registrado em
-- reminder_log), mas devolve também as GRAVAÇÕES AGENDADAS em que a pessoa está na equipe,
-- de hoje até p_until (amanhã; na sexta, até segunda). Gravações realizadas/canceladas não entram.
-- Só acrescenta: reminders_claim continua existindo (a versão publicada antes desta usa ela),
-- então aplicar esta migration antes ou depois da publicação não quebra o lembrete.
-- =====================================================================

create function public.agenda_claim(p_today date, p_until date)
returns table (profile_id uuid, kind text, title text, day date, start_time time)
language sql volatile security definer set search_path = ''
as $$
  with candidates as (
    select a.profile_id, 'tarefa'::text as kind, t.title, t.due as day, null::time as start_time
    from public.task_assignees a
    join public.tasks t on t.id = a.task_id
    where t.due is not null
      and t.due <= p_until
      and t.status not in ('aprovado', 'entregue')
    union all
    select m.profile_id, 'gravacao'::text, r.title, r.scheduled_date, r.start_time
    from public.recording_team m
    join public.recordings r on r.id = m.recording_id
    where r.status = 'agendada'
      and r.scheduled_date between p_today and p_until
  ),
  eligible as (
    select c.*
    from candidates c
    join public.profiles p on p.id = c.profile_id and p.is_active
    where p_until between p_today and p_today + 3
      and exists (select 1 from public.push_subscriptions s where s.profile_id = c.profile_id)
      and not exists (select 1 from public.reminder_log l where l.profile_id = c.profile_id and l.day = p_today)
  ),
  claimed as (
    insert into public.reminder_log (profile_id, day)
    select distinct e.profile_id, p_today from eligible e
    on conflict do nothing
    returning reminder_log.profile_id as claimed_id
  )
  select e.profile_id, e.kind, e.title, e.day, e.start_time
  from eligible e
  join claimed k on k.claimed_id = e.profile_id;
$$;

revoke execute on function public.agenda_claim(date, date) from public, anon, authenticated;
grant execute on function public.agenda_claim(date, date) to service_role;
