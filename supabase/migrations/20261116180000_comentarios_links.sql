-- =====================================================================
-- Workspace · Comentários e links (anexos) nas tarefas
--
-- Anexos = LINKS (Drive, Figma, Canva, WeTransfer, YouTube…). Sem upload de arquivos:
-- o Storage é usado só para fotos de perfil (decisão do usuário, 15/11/2026).
--
-- Regras:
-- - Comentar: qualquer membro ativo, em qualquer tarefa (todos veem o mural).
-- - Editar comentário: só o autor. Apagar: autor ou administração.
-- - Adicionar link: administração, responsáveis pela tarefa ou quem a criou.
-- - Remover link: quem adicionou ou administração.
-- - Links só http(s) (bloqueia javascript:, data: etc.), também no banco.
-- Leitura: membros ativos (RLS). Gravação: só pelas funções abaixo. Não altera dados existentes.
-- =====================================================================

create table public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete restrict,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_links (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  url         text not null check (char_length(url) between 10 and 2000 and url ~* '^https?://[^\s/$.?#][^\s]*$'),
  title       text not null default '' check (char_length(title) <= 120),
  added_by    uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index task_links_task_idx on public.task_links (task_id, created_at);

-- O histórico da tarefa passa a registrar comentários e links (recria a regra de valores).
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
  check (kind in ('criada', 'editada', 'status', 'responsaveis', 'checklist', 'comentario', 'link'));

-- ---------------------------------------------------------------------
-- Comentários
-- ---------------------------------------------------------------------
create function public.comment_add(p_task uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  perform private.require_member();
  if not exists (select 1 from public.tasks where id = p_task) then raise exception 'Tarefa não encontrada.'; end if;
  insert into public.task_comments (task_id, author_id, body) values (p_task, auth.uid(), trim(p_body))
  returning id into new_id;
  insert into public.task_events (task_id, actor_id, kind) values (p_task, auth.uid(), 'comentario');
  return new_id;
end;
$$;

create function public.comment_edit(p_comment uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare author uuid;
begin
  perform private.require_member();
  select author_id into author from public.task_comments where id = p_comment;
  if author is null then raise exception 'Comentário não encontrado.'; end if;
  if author <> auth.uid() then
    raise exception 'Só quem escreveu edita o comentário.' using errcode = '42501';
  end if;
  update public.task_comments set body = trim(p_body), edited_at = now() where id = p_comment;
end;
$$;

create function public.comment_delete(p_comment uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
begin
  select author_id into author from public.task_comments where id = p_comment;
  if author is null then raise exception 'Comentário não encontrado.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin') then
    raise exception 'Só quem escreveu (ou a administração) apaga o comentário.' using errcode = '42501';
  end if;
  delete from public.task_comments where id = p_comment;
end;
$$;

-- ---------------------------------------------------------------------
-- Links (anexos)
-- ---------------------------------------------------------------------
create function public.link_add(p_task uuid, p_url text, p_title text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  creator uuid;
  new_id uuid;
begin
  select created_by into creator from public.tasks where id = p_task;
  if creator is null then raise exception 'Tarefa não encontrada.'; end if;
  if lvl = 'colaborador' and creator <> auth.uid() and not private.is_task_assignee(p_task) then
    raise exception 'Só os responsáveis, quem criou a tarefa ou a administração adicionam links.' using errcode = '42501';
  end if;
  if (select count(*) from public.task_links where task_id = p_task) >= 30 then
    raise exception 'No máximo 30 links por tarefa.';
  end if;
  insert into public.task_links (task_id, url, title, added_by)
  values (p_task, trim(p_url), left(trim(coalesce(p_title, '')), 120), auth.uid())
  returning id into new_id;
  insert into public.task_events (task_id, actor_id, kind, details)
  values (p_task, auth.uid(), 'link', jsonb_build_object('titulo', left(trim(coalesce(p_title, '')), 120)));
  return new_id;
end;
$$;

create function public.link_remove(p_link uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
begin
  select added_by into author from public.task_links where id = p_link;
  if author is null then raise exception 'Link não encontrado.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin') then
    raise exception 'Só quem adicionou (ou a administração) remove o link.' using errcode = '42501';
  end if;
  delete from public.task_links where id = p_link;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões e RLS
-- ---------------------------------------------------------------------
revoke execute on function
  public.comment_add(uuid, text), public.comment_edit(uuid, text), public.comment_delete(uuid),
  public.link_add(uuid, text, text), public.link_remove(uuid)
from public, anon;
grant execute on function
  public.comment_add(uuid, text), public.comment_edit(uuid, text), public.comment_delete(uuid),
  public.link_add(uuid, text, text), public.link_remove(uuid)
to authenticated;

alter table public.task_comments enable row level security;
alter table public.task_links enable row level security;
revoke all on public.task_comments, public.task_links from anon, authenticated;
grant select on public.task_comments, public.task_links to authenticated;

create policy "comentários: leitura por membros ativos" on public.task_comments
  for select to authenticated using ((select private.is_active_member()));
create policy "links: leitura por membros ativos" on public.task_links
  for select to authenticated using ((select private.is_active_member()));
