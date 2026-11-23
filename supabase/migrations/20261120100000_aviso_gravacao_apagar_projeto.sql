-- =====================================================================
-- Workspace · AVISO DA EQUIPE DA GRAVAÇÃO + APAGAR PROJETOS CONCLUÍDOS (pedido de 18/11/2026)
--
-- 1. Sininho: quem é colocado na equipe de uma gravação por OUTRA pessoa recebe aviso.
--    Sem tabela de mensagens: o aviso é derivado da própria equipe (recording_team ganha
--    added_by/added_at). Editar a gravação mantém quem já estava (não gera aviso de novo);
--    só quem ENTRA é registrado agora.
-- 2. project_delete: só a administração, e só projetos CONCLUÍDOS. Tarefas e gravações do
--    projeto continuam (perdem o vínculo com o projeto pela chave estrangeira, "on delete set null").
-- Depende de 20261119120000_gravacoes.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Equipe da gravação: quem colocou e quando
-- ---------------------------------------------------------------------
alter table public.recording_team
  add column added_by uuid references public.profiles (id) on delete set null,
  add column added_at timestamptz;

-- equipes já existentes: colocadas por quem agendou, quando agendou
update public.recording_team m
   set added_by = r.created_by, added_at = r.created_at
  from public.recordings r
 where r.id = m.recording_id;

alter table public.recording_team
  alter column added_by set default auth.uid(),
  alter column added_at set default now(),
  alter column added_at set not null;

create index recording_team_profile_added_idx on public.recording_team (profile_id, added_at desc);

-- mesma assinatura e regras; muda só a troca da equipe (antes apagava todos e inseria de novo)
create or replace function public.recording_update(
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
  -- sai quem não está mais; entra (com added_by/added_at de agora) só quem é novo
  delete from public.recording_team where recording_id = p_recording and profile_id <> all (who);
  insert into public.recording_team (recording_id, profile_id, added_by, added_at)
  select p_recording, a, auth.uid(), now() from unnest(who) a
  on conflict (recording_id, profile_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Apagar projeto concluído
-- ---------------------------------------------------------------------
create function public.project_delete(p_project uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare st public.project_status;
begin
  perform private.require_admin_member();
  select status into st from public.projects where id = p_project;
  if st is null then raise exception 'Projeto não encontrado.'; end if;
  if st <> 'concluido' then
    raise exception 'Só dá para apagar projetos concluídos. Marque o projeto como concluído primeiro.';
  end if;
  -- tarefas e gravações do projeto ficam sem projeto (on delete set null)
  delete from public.projects where id = p_project;
end;
$$;

revoke execute on function public.project_delete(uuid) from public, anon;
grant execute on function public.project_delete(uuid) to authenticated;
