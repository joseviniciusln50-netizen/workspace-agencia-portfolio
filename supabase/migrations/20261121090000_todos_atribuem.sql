-- Todos atribuem responsáveis (pedido do usuário em 18/11/2026: "os social medias não estão conseguindo
-- adicionar uma tarefa pros designers").
-- Antes: colaborador só criava tarefa para si e só a administração trocava responsáveis.
-- Agora: qualquer membro ATIVO escolhe os responsáveis ao criar e troca os responsáveis de qualquer tarefa.
-- Continuam valendo: no máximo 10, só perfis ativos, lista vazia = quem cria; tudo registrado em task_events
-- (e por isso avisado no sininho e no celular).

create or replace function private.check_assignees(lvl public.access_level, p_assignees uuid[])
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare result uuid[] := coalesce((select array_agg(distinct a) from unnest(p_assignees) a where a is not null), '{}');
begin
  if cardinality(result) = 0 then
    result := array[auth.uid()];
  end if;
  if cardinality(result) > 10 then
    raise exception 'No máximo 10 responsáveis por tarefa.';
  end if;
  if exists (
    select 1 from unnest(result) a
    where not exists (select 1 from public.profiles p where p.id = a and p.is_active)
  ) then
    raise exception 'Responsável inválido ou desativado.';
  end if;
  return result;
end;
$$;

create or replace function public.task_set_assignees(p_task uuid, p_assignees uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  who uuid[];
  before uuid[];
begin
  if not exists (select 1 from public.tasks where id = p_task) then raise exception 'Tarefa não encontrada.'; end if;
  if cardinality(coalesce(p_assignees, '{}')) = 0 then
    raise exception 'Escolha pelo menos um responsável.';
  end if;
  who := private.check_assignees(lvl, p_assignees);
  before := coalesce((select array_agg(profile_id) from public.task_assignees where task_id = p_task), '{}');

  delete from public.task_assignees where task_id = p_task and not (profile_id = any (who));
  insert into public.task_assignees (task_id, profile_id, assigned_by)
    select p_task, a, auth.uid() from unnest(who) a on conflict do nothing;

  insert into public.task_events (task_id, actor_id, kind, details)
  values (p_task, auth.uid(), 'responsaveis', jsonb_build_object('antes', before, 'depois', who));
end;
$$;
