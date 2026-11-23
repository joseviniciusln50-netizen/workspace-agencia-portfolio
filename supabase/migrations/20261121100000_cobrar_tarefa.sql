-- Cobrar tarefa atrasada (regras confirmadas pelo usuário em 19/11:
-- qualquer pessoa da equipe cobra, com uma frase opcional).
-- A cobrança é um evento da tarefa ('cobranca'), como comentário e link: vira aviso no sininho e no celular
-- dos RESPONSÁVEIS e fica no histórico. Sem tabela de mensagens.
-- Regras: só tarefa atrasada (prazo antes de hoje, no horário de Brasília) e ainda não aprovada/postada;
-- precisa ter outro responsável além de quem cobra; uma cobrança por tarefa a cada 3 horas; frase com até 140 caracteres.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.task_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.task_events drop constraint %I', c);
  end loop;
end;
$$;

alter table public.task_events
  add constraint task_events_kind_check
  check (kind in ('criada', 'editada', 'status', 'responsaveis', 'checklist', 'comentario', 'link', 'cobranca'));

create function public.task_nudge(p_task uuid, p_message text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.tasks;
  msg text := left(trim(coalesce(p_message, '')), 140);
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform private.require_member();
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if t.due is null or t.due >= today or t.status in ('aprovado', 'entregue') then
    raise exception 'Só dá para cobrar tarefas atrasadas.';
  end if;
  if not exists (select 1 from public.task_assignees where task_id = p_task and profile_id <> auth.uid()) then
    raise exception 'A tarefa não tem outro responsável para cobrar.';
  end if;
  if exists (
    select 1 from public.task_events
    where task_id = p_task and kind = 'cobranca' and created_at > now() - interval '3 hours'
  ) then
    raise exception 'Esta tarefa já foi cobrada há pouco. Espere algumas horas para cobrar de novo.';
  end if;

  insert into public.task_events (task_id, actor_id, kind, details)
  values (p_task, auth.uid(), 'cobranca', case when msg = '' then null else jsonb_build_object('mensagem', msg) end);
end;
$$;

revoke all on function public.task_nudge(uuid, text) from public, anon;
grant execute on function public.task_nudge(uuid, text) to authenticated;
