-- =====================================================================
-- Workspace · CLIENTES E PROJETOS
--
-- - Clientes (nome único, observações, ativo/arquivado) e projetos por cliente
--   (ativo / pausado / concluído, prazo).
-- - Tarefas ganham client_id e project_id; briefings ganham client_id.
-- - Regras: todos os membros ativos VEEM; só ADMINISTRADORES cadastram/editam clientes e projetos.
--   Ligar uma tarefa a cliente/projeto segue a mesma regra de editar a tarefa
--   (administração, ou o colaborador que a criou antes da aprovação).
--
-- COMPATÍVEL com a versão publicada do site: nada é removido; as funções existentes continuam
-- iguais. O texto tasks.client / briefings.client segue preenchido (nome do cliente) para
-- quem ainda lê só esse campo.
-- Leitura: RLS para membros ativos. Gravação: só pelas funções abaixo.
-- =====================================================================

create type public.project_status as enum ('ativo', 'pausado', 'concluido');

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  notes       text not null default '' check (char_length(notes) <= 2000),
  is_active   boolean not null default true,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index clients_name_unique on public.clients (lower(name));

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete restrict,
  name         text not null check (char_length(name) between 2 and 120),
  description  text not null default '' check (char_length(description) <= 2000),
  status       public.project_status not null default 'ativo',
  due          date,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index projects_client_name_unique on public.projects (client_id, lower(name));
create index projects_client_idx on public.projects (client_id);

alter table public.tasks
  add column client_id uuid references public.clients (id) on delete set null,
  add column project_id uuid references public.projects (id) on delete set null;
create index tasks_client_idx on public.tasks (client_id);
create index tasks_project_idx on public.tasks (project_id);

alter table public.briefings
  add column client_id uuid references public.clients (id) on delete set null;

create trigger clients_touch_updated_at before update on public.clients
  for each row execute function private.touch_updated_at();
create trigger projects_touch_updated_at before update on public.projects
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Auxiliar: só administração
-- ---------------------------------------------------------------------
create function private.require_admin_member()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.require_member() not in ('principal', 'admin') then
    raise exception 'Só a administração cadastra e edita clientes e projetos.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create function public.client_create(p_name text, p_notes text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  perform private.require_admin_member();
  if exists (select 1 from public.clients where lower(name) = lower(trim(p_name))) then
    raise exception 'Já existe um cliente com este nome.';
  end if;
  insert into public.clients (name, notes, created_by)
  values (trim(p_name), trim(coalesce(p_notes, '')), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

-- Atualiza (e mantém o nome em texto das tarefas/briefings ligados em dia).
create function public.client_update(p_client uuid, p_name text, p_notes text, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin_member();
  if not exists (select 1 from public.clients where id = p_client) then raise exception 'Cliente não encontrado.'; end if;
  if exists (select 1 from public.clients where lower(name) = lower(trim(p_name)) and id <> p_client) then
    raise exception 'Já existe um cliente com este nome.';
  end if;
  update public.clients
     set name = trim(p_name), notes = trim(coalesce(p_notes, '')), is_active = coalesce(p_active, is_active)
   where id = p_client;
  update public.tasks set client = trim(p_name) where client_id = p_client;
  update public.briefings set client = trim(p_name) where client_id = p_client;
end;
$$;

-- ---------------------------------------------------------------------
-- Projetos
-- ---------------------------------------------------------------------
create function public.project_create(p_client uuid, p_name text, p_description text, p_due date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  perform private.require_admin_member();
  if not exists (select 1 from public.clients where id = p_client) then raise exception 'Cliente não encontrado.'; end if;
  if exists (select 1 from public.projects where client_id = p_client and lower(name) = lower(trim(p_name))) then
    raise exception 'Este cliente já tem um projeto com este nome.';
  end if;
  insert into public.projects (client_id, name, description, due, created_by)
  values (p_client, trim(p_name), trim(coalesce(p_description, '')), p_due, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create function public.project_update(
  p_project uuid, p_name text, p_description text, p_status public.project_status, p_due date
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare cid uuid;
begin
  perform private.require_admin_member();
  select client_id into cid from public.projects where id = p_project;
  if cid is null then raise exception 'Projeto não encontrado.'; end if;
  if exists (select 1 from public.projects where client_id = cid and lower(name) = lower(trim(p_name)) and id <> p_project) then
    raise exception 'Este cliente já tem um projeto com este nome.';
  end if;
  update public.projects
     set name = trim(p_name), description = trim(coalesce(p_description, '')),
         status = coalesce(p_status, status), due = p_due
   where id = p_project;
end;
$$;

-- ---------------------------------------------------------------------
-- Ligar tarefa / briefing a cliente e projeto
-- ---------------------------------------------------------------------
-- Mesma permissão de editar a tarefa. Se houver projeto, o cliente é o do projeto (sempre coerente).
-- p_client = null e p_project = null → "Interno".
create function public.task_set_context(p_task uuid, p_client uuid, p_project uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  t public.tasks;
  cid uuid := p_client;
  cname text := '';
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if lvl = 'colaborador' and (t.created_by <> auth.uid() or t.status in ('aprovado', 'entregue')) then
    raise exception 'Você só edita tarefas que criou para si (antes da aprovação).' using errcode = '42501';
  end if;

  if p_project is not null then
    select client_id into cid from public.projects where id = p_project;
    if cid is null then raise exception 'Projeto não encontrado.'; end if;
  end if;
  if cid is not null then
    select name into cname from public.clients where id = cid;
    if cname is null then raise exception 'Cliente não encontrado.'; end if;
  end if;

  update public.tasks set client_id = cid, project_id = p_project, client = coalesce(cname, '') where id = p_task;
  if t.client_id is distinct from cid or t.project_id is distinct from p_project then
    insert into public.task_events (task_id, actor_id, kind, details)
    values (p_task, auth.uid(), 'editada', jsonb_build_object('cliente', cname, 'projeto', p_project));
  end if;
end;
$$;

create function public.briefing_set_client(p_briefing uuid, p_client uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
  cname text := '';
begin
  select created_by into author from public.briefings where id = p_briefing;
  if author is null then raise exception 'Briefing não encontrado.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin') then
    raise exception 'Só quem registrou (ou a administração) edita o briefing.' using errcode = '42501';
  end if;
  if p_client is not null then
    select name into cname from public.clients where id = p_client;
    if cname is null then raise exception 'Cliente não encontrado.'; end if;
  end if;
  update public.briefings set client_id = p_client, client = coalesce(cname, '') where id = p_briefing;
end;
$$;

-- ---------------------------------------------------------------------
-- Clientes já digitados em texto nas tarefas/briefings → cadastro (sem perder nada)
-- ---------------------------------------------------------------------
insert into public.clients (name, created_by)
select distinct on (lower(trim(src.client))) trim(src.client), src.created_by
from (
  select client, created_by from public.tasks where char_length(trim(client)) >= 2
  union all
  select client, created_by from public.briefings where char_length(trim(client)) >= 2
) src
order by lower(trim(src.client))
on conflict do nothing;

update public.tasks t set client_id = c.id
from public.clients c where t.client_id is null and lower(trim(t.client)) = lower(c.name);
update public.briefings b set client_id = c.id
from public.clients c where b.client_id is null and lower(trim(b.client)) = lower(c.name);

-- ---------------------------------------------------------------------
-- Permissões e RLS
-- ---------------------------------------------------------------------
revoke execute on function private.require_admin_member() from public, anon, authenticated;

revoke execute on function
  public.client_create(text, text),
  public.client_update(uuid, text, text, boolean),
  public.project_create(uuid, text, text, date),
  public.project_update(uuid, text, text, public.project_status, date),
  public.task_set_context(uuid, uuid, uuid),
  public.briefing_set_client(uuid, uuid)
from public, anon;
grant execute on function
  public.client_create(text, text),
  public.client_update(uuid, text, text, boolean),
  public.project_create(uuid, text, text, date),
  public.project_update(uuid, text, text, public.project_status, date),
  public.task_set_context(uuid, uuid, uuid),
  public.briefing_set_client(uuid, uuid)
to authenticated;

alter table public.clients enable row level security;
alter table public.projects enable row level security;
revoke all on public.clients, public.projects from anon, authenticated;
grant select on public.clients, public.projects to authenticated;

create policy "clientes: leitura por membros ativos" on public.clients
  for select to authenticated using ((select private.is_active_member()));
create policy "projetos: leitura por membros ativos" on public.projects
  for select to authenticated using ((select private.is_active_member()));
