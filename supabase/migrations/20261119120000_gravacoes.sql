-- =====================================================================
-- Workspace · GRAVAÇÕES (pedido do usuário em 18/11/2026)
--
-- Gravações agendadas ganham um registro próprio (aba "Gravações") e aparecem no calendário,
-- para o mural ficar só com as tarefas.
--
-- Regras:
-- 1. Toda a equipe ATIVA vê as gravações.
-- 2. Qualquer membro ativo agenda uma gravação (com a equipe que vai gravar).
-- 3. Editar e excluir: quem agendou ou a administração.
-- 4. Marcar como realizada/cancelada (ou voltar para agendada): quem agendou, quem está na equipe
--    da gravação ou a administração.
-- 5. Cliente e projeto vêm do cadastro (o projeto define o cliente).
--
-- Segurança: o cliente só LÊ (RLS: membros ativos). Toda gravação passa por funções SECURITY DEFINER
-- que conferem quem chama (auth.uid()). Não altera dados existentes.
-- =====================================================================

create type public.recording_status as enum ('agendada', 'realizada', 'cancelada');

create table public.recordings (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 2 and 140),
  client_id       uuid references public.clients (id) on delete set null,
  -- nome do cliente em texto (como em tarefas/briefings): fica no histórico se o cliente for apagado
  client          text not null default '' check (char_length(client) <= 80),
  project_id      uuid references public.projects (id) on delete set null,
  scheduled_date  date not null,
  start_time      time,
  end_time        time,
  location        text not null default '' check (char_length(location) <= 160),
  notes           text not null default '' check (char_length(notes) <= 3000),
  status          public.recording_status not null default 'agendada',
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint recordings_horario check (end_time is null or (start_time is not null and end_time > start_time))
);

create index recordings_date_idx on public.recordings (scheduled_date);

create table public.recording_team (
  recording_id  uuid not null references public.recordings (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete restrict,
  primary key (recording_id, profile_id)
);

create trigger recordings_touch_updated_at before update on public.recordings
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------
-- Cliente final de uma gravação: o projeto (se houver) define o cliente; ambos precisam existir.
-- O nome em texto é preenchido por quem chama (recording_create/update).
create function private.recording_client(p_client uuid, p_project uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare cid uuid := p_client;
begin
  if p_project is not null then
    select client_id into cid from public.projects where id = p_project;
    if cid is null then raise exception 'Projeto não encontrado.'; end if;
  end if;
  if cid is not null and not exists (select 1 from public.clients where id = cid) then
    raise exception 'Cliente não encontrado.';
  end if;
  return cid;
end;
$$;

create function private.check_recording(p_title text, p_location text, p_notes text, p_start time, p_end time)
returns void
language plpgsql immutable security definer set search_path = ''
as $$
begin
  if char_length(trim(coalesce(p_title, ''))) < 2 then raise exception 'Dê um título à gravação (pelo menos 2 caracteres).'; end if;
  if char_length(trim(coalesce(p_title, ''))) > 140 then raise exception 'Título da gravação com no máximo 140 caracteres.'; end if;
  if char_length(trim(coalesce(p_location, ''))) > 160 then raise exception 'Local da gravação com no máximo 160 caracteres.'; end if;
  if char_length(trim(coalesce(p_notes, ''))) > 3000 then raise exception 'Observações da gravação com no máximo 3.000 caracteres.'; end if;
  if p_end is not null and p_start is null then
    raise exception 'Informe o horário de início da gravação (o término sozinho não vale).';
  end if;
  if p_start is not null and p_end is not null and p_end <= p_start then
    raise exception 'O horário de término da gravação precisa ser depois do início.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Funções (únicas portas de gravação)
-- ---------------------------------------------------------------------
create function public.recording_create(
  p_title text, p_date date, p_start time, p_end time, p_location text, p_notes text,
  p_client uuid, p_project uuid, p_team uuid[]
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
  who uuid[];
  cid uuid;
begin
  perform private.require_member();
  if p_date is null then raise exception 'Informe a data da gravação.'; end if;
  perform private.check_recording(p_title, p_location, p_notes, p_start, p_end);
  cid := private.recording_client(p_client, p_project);
  who := private.check_participants(p_team);
  if cardinality(who) = 0 then who := array[auth.uid()]; end if;
  insert into public.recordings (title, client_id, client, project_id, scheduled_date, start_time, end_time, location, notes, created_by)
  values (trim(p_title), cid, coalesce((select name from public.clients where id = cid), ''), p_project, p_date, p_start, p_end,
          trim(coalesce(p_location, '')), trim(coalesce(p_notes, '')), auth.uid())
  returning id into new_id;
  insert into public.recording_team (recording_id, profile_id) select new_id, a from unnest(who) a;
  return new_id;
end;
$$;

create function public.recording_update(
  p_recording uuid, p_title text, p_date date, p_start time, p_end time, p_location text, p_notes text,
  p_client uuid, p_project uuid, p_team uuid[]
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
  who uuid[];
  cid uuid;
begin
  select created_by into author from public.recordings where id = p_recording;
  if author is null then raise exception 'Gravação não encontrada.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin') then
    raise exception 'Só quem agendou (ou a administração) edita a gravação.' using errcode = '42501';
  end if;
  if p_date is null then raise exception 'Informe a data da gravação.'; end if;
  perform private.check_recording(p_title, p_location, p_notes, p_start, p_end);
  cid := private.recording_client(p_client, p_project);
  who := private.check_participants(p_team);
  if cardinality(who) = 0 then who := array[author]; end if;
  update public.recordings
     set title = trim(p_title), scheduled_date = p_date, start_time = p_start, end_time = p_end,
         location = trim(coalesce(p_location, '')), notes = trim(coalesce(p_notes, '')),
         client_id = cid, client = coalesce((select name from public.clients where id = cid), ''), project_id = p_project
   where id = p_recording;
  delete from public.recording_team where recording_id = p_recording;
  insert into public.recording_team (recording_id, profile_id) select p_recording, a from unnest(who) a;
end;
$$;

create function public.recording_set_status(p_recording uuid, p_status public.recording_status)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
begin
  select created_by into author from public.recordings where id = p_recording;
  if author is null then raise exception 'Gravação não encontrada.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin')
     and not exists (select 1 from public.recording_team where recording_id = p_recording and profile_id = auth.uid()) then
    raise exception 'Só quem agendou, a equipe da gravação ou a administração muda o status.' using errcode = '42501';
  end if;
  update public.recordings set status = p_status where id = p_recording;
end;
$$;

create function public.recording_delete(p_recording uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lvl public.access_level := private.require_member();
  author uuid;
begin
  select created_by into author from public.recordings where id = p_recording;
  if author is null then raise exception 'Gravação não encontrada.'; end if;
  if author <> auth.uid() and lvl not in ('principal', 'admin') then
    raise exception 'Só quem agendou (ou a administração) exclui a gravação.' using errcode = '42501';
  end if;
  delete from public.recordings where id = p_recording;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function private.recording_client(uuid, uuid), private.check_recording(text, text, text, time, time)
  from public, anon, authenticated;

revoke execute on function
  public.recording_create(text, date, time, time, text, text, uuid, uuid, uuid[]),
  public.recording_update(uuid, text, date, time, time, text, text, uuid, uuid, uuid[]),
  public.recording_set_status(uuid, public.recording_status),
  public.recording_delete(uuid)
from public, anon;

grant execute on function
  public.recording_create(text, date, time, time, text, text, uuid, uuid, uuid[]),
  public.recording_update(uuid, text, date, time, time, text, text, uuid, uuid, uuid[]),
  public.recording_set_status(uuid, public.recording_status),
  public.recording_delete(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- RLS: membros ATIVOS leem; ninguém grava direto (só pelas funções acima)
-- ---------------------------------------------------------------------
alter table public.recordings enable row level security;
alter table public.recording_team enable row level security;

revoke all on public.recordings, public.recording_team from anon, authenticated;
grant select on public.recordings, public.recording_team to authenticated;

create policy "gravações: leitura por membros ativos" on public.recordings
  for select to authenticated using ((select private.is_active_member()));
create policy "equipe da gravação: leitura por membros ativos" on public.recording_team
  for select to authenticated using ((select private.is_active_member()));
