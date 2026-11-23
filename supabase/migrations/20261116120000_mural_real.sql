-- =====================================================================
-- Workspace · MURAL REAL — tarefas, responsáveis, checklists, post-its,
-- briefings e histórico, compartilhados pela equipe.
--
-- Decisões do usuário (16/11/2026):
-- 1. Toda a equipe ATIVA vê o mural inteiro (tarefas, post-its, briefings).
-- 2. Administradores criam e atribuem tarefas a QUALQUER membro ativo (inclusive a si mesmos);
--    colaboradores criam tarefas SÓ PARA SI.
-- 3. Todos registram briefings (e geram tarefas a partir deles, seguindo a regra 2).
-- 4. Só administradores marcam "Aprovado" e "Entregue". O colaborador leva a própria tarefa até
--    "Em revisão". Checklist concluído NÃO aprova a tarefa.
--
-- Segurança: o cliente só LÊ as tabelas (RLS: membros ativos). Toda gravação passa por funções
-- SECURITY DEFINER que conferem quem chama (auth.uid()) — requisição manipulada não pula as regras.
-- Perfis com histórico não podem ser apagados (on delete restrict): desative em vez de apagar.
-- Não altera dados existentes.
-- =====================================================================

create type public.task_status as enum ('a_fazer', 'em_producao', 'em_revisao', 'ajustes', 'aprovado', 'entregue');
create type public.task_priority as enum ('baixa', 'media', 'alta');

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table public.briefings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 2 and 140),
  client        text not null default '' check (char_length(client) <= 80),
  meeting_date  date not null default current_date,
  notes         text not null default '' check (char_length(notes) <= 10000),
  decisions     text not null default '' check (char_length(decisions) <= 5000),
  created_by    uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.briefing_participants (
  briefing_id  uuid not null references public.briefings (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete restrict,
  primary key (briefing_id, profile_id)
);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 2 and 140),
  client       text not null default '' check (char_length(client) <= 80),
  brief        text not null default '' check (char_length(brief) <= 5000),
  status       public.task_status not null default 'a_fazer',
  priority     public.task_priority not null default 'media',
  due          date,
  briefing_id  uuid references public.briefings (id) on delete set null,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tasks_status_idx on public.tasks (status, due);

create table public.task_assignees (
  task_id      uuid not null references public.tasks (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete restrict,
  assigned_by  uuid,
  assigned_at  timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create index task_assignees_profile_idx on public.task_assignees (profile_id);

create table public.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 200),
  done        boolean not null default false,
  position    integer not null default 0,
  done_by     uuid,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index checklist_items_task_idx on public.checklist_items (task_id, position);

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 1 and 280),
  color       text not null default 'paper' check (color in ('paper', 'mist', 'red', 'ink')),
  author_id   uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);

-- Histórico de cada tarefa (quem fez o quê).
create table public.task_events (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  actor_id    uuid,
  kind        text not null check (kind in ('criada', 'editada', 'status', 'responsaveis', 'checklist')),
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index task_events_task_idx on public.task_events (task_id, created_at desc);

create trigger tasks_touch_updated_at before update on public.tasks
  for each row execute function private.touch_updated_at();
create trigger briefings_touch_updated_at before update on public.briefings
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------
-- Membro ativo logado (devolve o nível) — senão, erro.
create function private.require_member()
returns public.access_level
language plpgsql stable security definer set search_path = ''
as $$
declare lvl public.access_level := private.current_access_level();
begin
  if lvl is null then
    raise exception 'Sessão inválida ou acesso desativado.' using errcode = '42501';
  end if;
  return lvl;
end;
$$;

create function private.is_task_assignee(p_task uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.task_assignees where task_id = p_task and profile_id = (select auth.uid()));
$$;

-- Valida a lista de responsáveis conforme o nível de quem cria/atribui.
create function private.check_assignees(lvl public.access_level, p_assignees uuid[])
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare result uuid[] := coalesce((select array_agg(distinct a) from unnest(p_assignees) a where a is not null), '{}');
begin
  if cardinality(result) = 0 then
    result := array[auth.uid()];
  end if;
  if lvl = 'colaborador' and result <> array[auth.uid()] then
    raise exception 'Colaboradores criam tarefas apenas para si mesmos.' using errcode = '42501';
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

-- ---------------------------------------------------------------------
-- Tarefas
-- ---------------------------------------------------------------------
create function public.task_create(
  p_title text, p_client text, p_brief text, p_priority public.task_priority, p_due date,
  p_assignees uuid[], p_checklist text[], p_briefing uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  who uuid[] := private.check_assignees(lvl, p_assignees);
  new_id uuid;
  item text;
  pos int := 0;
begin
  if p_briefing is not null and not exists (select 1 from public.briefings where id = p_briefing) then
    raise exception 'Briefing não encontrado.';
  end if;
  if cardinality(coalesce(p_checklist, '{}')) > 50 then
    raise exception 'No máximo 50 itens de checklist.';
  end if;

  insert into public.tasks (title, client, brief, priority, due, briefing_id, created_by)
  values (trim(p_title), trim(coalesce(p_client, '')), trim(coalesce(p_brief, '')),
          coalesce(p_priority, 'media'), p_due, p_briefing, auth.uid())
  returning id into new_id;

  insert into public.task_assignees (task_id, profile_id, assigned_by)
  select new_id, a, auth.uid() from unnest(who) a;

  foreach item in array coalesce(p_checklist, '{}') loop
    if char_length(trim(item)) > 0 then
      insert into public.checklist_items (task_id, label, position) values (new_id, left(trim(item), 200), pos);
      pos := pos + 1;
    end if;
  end loop;

  insert into public.task_events (task_id, actor_id, kind, details)
  values (new_id, auth.uid(), 'criada', jsonb_build_object('responsaveis', who));
  return new_id;
end;
$$;

-- Editar dados (título, cliente, briefing, prioridade, prazo):
-- administradores em qualquer tarefa; colaborador só nas que ELE criou (para si) e ainda não aprovadas.
create function public.task_update(
  p_task uuid, p_title text, p_client text, p_brief text, p_priority public.task_priority, p_due date
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if lvl = 'colaborador' and (t.created_by <> auth.uid() or t.status in ('aprovado', 'entregue')) then
    raise exception 'Você só edita tarefas que criou para si (antes da aprovação).' using errcode = '42501';
  end if;

  update public.tasks
     set title = trim(p_title), client = trim(coalesce(p_client, '')), brief = trim(coalesce(p_brief, '')),
         priority = coalesce(p_priority, t.priority), due = p_due
   where id = p_task;

  insert into public.task_events (task_id, actor_id, kind, details)
  values (p_task, auth.uid(), 'editada', jsonb_build_object(
    'prazo_antes', t.due, 'prazo_depois', p_due, 'prioridade_antes', t.priority, 'prioridade_depois', p_priority));
end;
$$;

-- Trocar responsáveis: só administradores.
create function public.task_set_assignees(p_task uuid, p_assignees uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  who uuid[];
  before uuid[];
begin
  if lvl not in ('principal', 'admin') then
    raise exception 'Só administradores alteram responsáveis.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tasks where id = p_task) then raise exception 'Tarefa não encontrada.'; end if;
  who := private.check_assignees(lvl, p_assignees);
  before := coalesce((select array_agg(profile_id) from public.task_assignees where task_id = p_task), '{}');

  delete from public.task_assignees where task_id = p_task and not (profile_id = any (who));
  insert into public.task_assignees (task_id, profile_id, assigned_by)
    select p_task, a, auth.uid() from unnest(who) a on conflict do nothing;

  insert into public.task_events (task_id, actor_id, kind, details)
  values (p_task, auth.uid(), 'responsaveis', jsonb_build_object('antes', before, 'depois', who));
end;
$$;

-- Mudar status. Administradores: qualquer status. Colaborador: só tarefas em que é responsável,
-- só entre "A fazer", "Em produção" e "Em revisão" (inclusive saindo de "Ajustes solicitados"),
-- e nunca mexe em tarefa já aprovada/entregue.
create function public.task_set_status(p_task uuid, p_status public.task_status)
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

  if lvl = 'colaborador' then
    if not private.is_task_assignee(p_task) then
      raise exception 'Você só move tarefas em que é responsável.' using errcode = '42501';
    end if;
    if p_status not in ('a_fazer', 'em_producao', 'em_revisao') or current_status in ('aprovado', 'entregue') then
      raise exception 'Aprovar, pedir ajustes e entregar são ações da administração.' using errcode = '42501';
    end if;
  end if;

  update public.tasks set status = p_status where id = p_task;
  insert into public.task_events (task_id, actor_id, kind, details)
  values (p_task, auth.uid(), 'status', jsonb_build_object('de', current_status, 'para', p_status));
end;
$$;

-- Excluir: administradores; colaborador só a tarefa que criou para si, antes da aprovação.
create function public.task_delete(p_task uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if lvl = 'colaborador' and (t.created_by <> auth.uid() or t.status in ('aprovado', 'entregue')) then
    raise exception 'Você só exclui tarefas que criou para si (antes da aprovação).' using errcode = '42501';
  end if;
  delete from public.tasks where id = p_task;
end;
$$;

-- ---------------------------------------------------------------------
-- Checklist: administradores e responsáveis pela tarefa
-- ---------------------------------------------------------------------
create function private.require_task_editor(p_task uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare lvl public.access_level := private.require_member();
begin
  if not exists (select 1 from public.tasks where id = p_task) then raise exception 'Tarefa não encontrada.'; end if;
  if lvl = 'colaborador' and not private.is_task_assignee(p_task) then
    raise exception 'Só os responsáveis pela tarefa (ou a administração) alteram o checklist.' using errcode = '42501';
  end if;
end;
$$;

create function public.checklist_add(p_task uuid, p_label text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  perform private.require_task_editor(p_task);
  if (select count(*) from public.checklist_items where task_id = p_task) >= 50 then
    raise exception 'No máximo 50 itens de checklist.';
  end if;
  insert into public.checklist_items (task_id, label, position)
  values (p_task, left(trim(p_label), 200),
          coalesce((select max(position) + 1 from public.checklist_items where task_id = p_task), 0))
  returning id into new_id;
  return new_id;
end;
$$;

create function public.checklist_toggle(p_item uuid, p_done boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare tid uuid;
begin
  select task_id into tid from public.checklist_items where id = p_item;
  if tid is null then raise exception 'Item não encontrado.'; end if;
  perform private.require_task_editor(tid);
  update public.checklist_items
     set done = p_done, done_by = case when p_done then auth.uid() end, done_at = case when p_done then now() end
   where id = p_item;
  insert into public.task_events (task_id, actor_id, kind, details)
  values (tid, auth.uid(), 'checklist', jsonb_build_object('item', p_item, 'feito', p_done));
end;
$$;

create function public.checklist_remove(p_item uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare tid uuid;
begin
  select task_id into tid from public.checklist_items where id = p_item;
  if tid is null then raise exception 'Item não encontrado.'; end if;
  perform private.require_task_editor(tid);
  delete from public.checklist_items where id = p_item;
end;
$$;

-- ---------------------------------------------------------------------
-- Post-its: todos criam; só o autor ou a administração apagam
-- ---------------------------------------------------------------------
create function public.note_create(p_text text, p_color text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  perform private.require_member();
  insert into public.notes (text, color, author_id)
  values (trim(p_text), coalesce(p_color, 'paper'), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create function public.note_delete(p_note uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
begin
  select author_id into author from public.notes where id = p_note;
  if author is null then raise exception 'Post-it não encontrado.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin') then
    raise exception 'Só quem escreveu (ou a administração) remove o post-it.' using errcode = '42501';
  end if;
  delete from public.notes where id = p_note;
end;
$$;

-- ---------------------------------------------------------------------
-- Briefings: todos registram; edita/exclui o autor ou a administração
-- ---------------------------------------------------------------------
create function private.check_participants(p uuid[])
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare result uuid[] := coalesce((select array_agg(distinct a) from unnest(p) a where a is not null), '{}');
begin
  if cardinality(result) > 30 then raise exception 'No máximo 30 participantes.'; end if;
  if exists (select 1 from unnest(result) a where not exists (select 1 from public.profiles x where x.id = a)) then
    raise exception 'Participante inválido.';
  end if;
  return result;
end;
$$;

create function public.briefing_create(
  p_title text, p_client text, p_date date, p_notes text, p_decisions text, p_participants uuid[]
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
  who uuid[];
begin
  perform private.require_member();
  who := private.check_participants(p_participants);
  insert into public.briefings (title, client, meeting_date, notes, decisions, created_by)
  values (trim(p_title), trim(coalesce(p_client, '')), coalesce(p_date, current_date),
          trim(coalesce(p_notes, '')), trim(coalesce(p_decisions, '')), auth.uid())
  returning id into new_id;
  insert into public.briefing_participants (briefing_id, profile_id) select new_id, a from unnest(who) a;
  return new_id;
end;
$$;

create function public.briefing_update(
  p_briefing uuid, p_title text, p_client text, p_date date, p_notes text, p_decisions text, p_participants uuid[]
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
  who uuid[];
begin
  select created_by into author from public.briefings where id = p_briefing;
  if author is null then raise exception 'Briefing não encontrado.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin') then
    raise exception 'Só quem registrou (ou a administração) edita o briefing.' using errcode = '42501';
  end if;
  who := private.check_participants(p_participants);
  update public.briefings
     set title = trim(p_title), client = trim(coalesce(p_client, '')), meeting_date = coalesce(p_date, meeting_date),
         notes = trim(coalesce(p_notes, '')), decisions = trim(coalesce(p_decisions, ''))
   where id = p_briefing;
  delete from public.briefing_participants where briefing_id = p_briefing;
  insert into public.briefing_participants (briefing_id, profile_id) select p_briefing, a from unnest(who) a;
end;
$$;

create function public.briefing_delete(p_briefing uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
begin
  select created_by into author from public.briefings where id = p_briefing;
  if author is null then raise exception 'Briefing não encontrado.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin') then
    raise exception 'Só quem registrou (ou a administração) exclui o briefing.' using errcode = '42501';
  end if;
  delete from public.briefings where id = p_briefing; -- tarefas geradas ficam (briefing_id vira null)
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.current_access_level() to authenticated;

revoke execute on function
  public.task_create(text, text, text, public.task_priority, date, uuid[], text[], uuid),
  public.task_update(uuid, text, text, text, public.task_priority, date),
  public.task_set_assignees(uuid, uuid[]),
  public.task_set_status(uuid, public.task_status),
  public.task_delete(uuid),
  public.checklist_add(uuid, text),
  public.checklist_toggle(uuid, boolean),
  public.checklist_remove(uuid),
  public.note_create(text, text),
  public.note_delete(uuid),
  public.briefing_create(text, text, date, text, text, uuid[]),
  public.briefing_update(uuid, text, text, date, text, text, uuid[]),
  public.briefing_delete(uuid)
from public, anon;

grant execute on function
  public.task_create(text, text, text, public.task_priority, date, uuid[], text[], uuid),
  public.task_update(uuid, text, text, text, public.task_priority, date),
  public.task_set_assignees(uuid, uuid[]),
  public.task_set_status(uuid, public.task_status),
  public.task_delete(uuid),
  public.checklist_add(uuid, text),
  public.checklist_toggle(uuid, boolean),
  public.checklist_remove(uuid),
  public.note_create(text, text),
  public.note_delete(uuid),
  public.briefing_create(text, text, date, text, text, uuid[]),
  public.briefing_update(uuid, text, text, date, text, text, uuid[]),
  public.briefing_delete(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- RLS: membros ATIVOS leem tudo; ninguém grava direto (só pelas funções acima)
-- ---------------------------------------------------------------------
alter table public.briefings enable row level security;
alter table public.briefing_participants enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.checklist_items enable row level security;
alter table public.notes enable row level security;
alter table public.task_events enable row level security;

revoke all on public.briefings, public.briefing_participants, public.tasks, public.task_assignees,
  public.checklist_items, public.notes, public.task_events from anon, authenticated;
grant select on public.briefings, public.briefing_participants, public.tasks, public.task_assignees,
  public.checklist_items, public.notes, public.task_events to authenticated;

create policy "briefings: leitura por membros ativos" on public.briefings
  for select to authenticated using ((select private.is_active_member()));
create policy "participantes: leitura por membros ativos" on public.briefing_participants
  for select to authenticated using ((select private.is_active_member()));
create policy "tarefas: leitura por membros ativos" on public.tasks
  for select to authenticated using ((select private.is_active_member()));
create policy "responsáveis: leitura por membros ativos" on public.task_assignees
  for select to authenticated using ((select private.is_active_member()));
create policy "checklist: leitura por membros ativos" on public.checklist_items
  for select to authenticated using ((select private.is_active_member()));
create policy "post-its: leitura por membros ativos" on public.notes
  for select to authenticated using ((select private.is_active_member()));
create policy "histórico de tarefas: leitura por membros ativos" on public.task_events
  for select to authenticated using ((select private.is_active_member()));
