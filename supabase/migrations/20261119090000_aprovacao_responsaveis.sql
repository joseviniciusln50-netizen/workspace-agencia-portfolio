-- Aprovação pelos responsáveis (pedido do usuário em 17/11/2026).
-- Antes: o colaborador só levava a própria tarefa até "Em revisão"; aprovar, pedir ajustes e entregar
-- eram ações da administração. Agora quem é RESPONSÁVEL pela tarefa move para qualquer etapa
-- (inclusive "Aprovado" e "Entregue", por exemplo quando o cliente aprovou direto com a designer)
-- e pode corrigir um clique errado. Tarefas de outras pessoas continuam fora do alcance do colaborador.
-- Editar/excluir continua travado após a aprovação (regras de task_update/task_delete, inalteradas).
create or replace function public.task_set_status(p_task uuid, p_status public.task_status)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  current_status public.task_status;
begin
  select status into current_status from public.tasks where id = p_task;
  if current_status is null then raise exception 'Tarefa não encontrada.'; end if;
  if current_status = p_status then return; end if;

  if lvl = 'colaborador' and not private.is_task_assignee(p_task) then
    raise exception 'Você só move tarefas em que é responsável.' using errcode = '42501';
  end if;

  update public.tasks set status = p_status where id = p_task;
  insert into public.task_events (task_id, actor_id, kind, details)
  values (p_task, auth.uid(), 'status', jsonb_build_object('de', current_status, 'para', p_status));
end;
$$;
