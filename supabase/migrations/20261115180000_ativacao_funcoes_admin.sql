-- =====================================================================
-- Workspace · Reorganização · ETAPA 3
-- Funções profissionais, convites com código de ativação (sem SMTP) e
-- administração de acessos — TUDO validado no banco (funções SECURITY DEFINER
-- com checagem de quem chama), não só na interface.
--
-- Regras:
-- - Funções profissionais: administradores (principal/admin) atribuem; ninguém edita as próprias pelo perfil.
-- - Nível de acesso: SÓ o administrador principal concede/remove "admin". Ninguém altera o próprio.
-- - Desativar: principal desativa admins e colaboradores; admin desativa só colaboradores; ninguém a si mesmo.
-- - Transferir o principal: só o principal, com LOGIN RECENTE (≤ 10 min) — conferido no token.
-- - Convite: código de uso único (guardado só como hash SHA-256), válido 7 dias, até 5 tentativas.
--   A conta é criada pelo servidor (chave secreta), SEMPRE como colaborador. Cadastro público segue desligado.
-- - Toda mudança vai para public.access_audit.
-- Não altera administradores nem perfis existentes.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Funções profissionais
-- ---------------------------------------------------------------------
create table public.professional_roles (
  code   text primary key check (code ~ '^[a-z_]{2,40}$'),
  label  text not null unique,
  sort   smallint not null
);

-- Catálogo fixo definido pela direção (configuração, não dados de pessoas).
insert into public.professional_roles (code, label, sort) values
  ('ceo', 'CEO', 1),
  ('diretor_criativo', 'Diretor Criativo', 2),
  ('designer', 'Designer', 3),
  ('videomaker', 'Videomaker', 4),
  ('editor', 'Editor', 5),
  ('social_media', 'Social Media', 6),
  ('storymaker', 'Storymaker', 7),
  ('desenvolvedor', 'Desenvolvedor', 8),
  ('motion_designer', 'Motion Designer', 9),
  ('ia_automacao', 'Especialista em IA e Automação', 10);

create table public.profile_roles (
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  role_code    text not null references public.professional_roles (code),
  assigned_by  uuid,
  assigned_at  timestamptz not null default now(),
  primary key (profile_id, role_code)
);

-- ---------------------------------------------------------------------
-- Histórico: passa a registrar também funções, convites e ativações
-- ---------------------------------------------------------------------
alter table public.access_audit
  add column action text not null default 'acesso'
    check (action in ('acesso', 'funcoes', 'convite', 'ativacao', 'transferencia')),
  add column details jsonb;

-- ---------------------------------------------------------------------
-- Convites (código de ativação)
-- ---------------------------------------------------------------------
create table public.activation_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and char_length(email) between 3 and 254),
  code_hash   text not null,
  invited_by  uuid not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  attempts    smallint not null default 0,
  used_at     timestamptz,
  used_by     uuid,
  revoked_at  timestamptz
);

-- No máximo um convite em aberto por e-mail.
create unique index activation_invites_one_open
  on public.activation_invites (email) where used_at is null and revoked_at is null;

-- ---------------------------------------------------------------------
-- Auxiliares internas
-- ---------------------------------------------------------------------
create function private.require_admin()
returns public.access_level
language plpgsql stable security definer set search_path = ''
as $$
declare lvl public.access_level := private.current_access_level();
begin
  if lvl is null or lvl not in ('principal', 'admin') then
    raise exception 'Sem permissão para esta ação.' using errcode = '42501';
  end if;
  return lvl;
end;
$$;

create function private.hash_code(code text)
returns text
language sql immutable set search_path = ''
as $$
  select encode(extensions.digest(upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------
-- Ações administrativas (chamadas pelo app com a sessão do administrador)
-- ---------------------------------------------------------------------

-- Define o conjunto de funções profissionais de um membro.
create function public.admin_set_roles(target uuid, roles text[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  before text[];
  after text[] := coalesce((select array_agg(distinct r order by r) from unnest(roles) r), '{}');
begin
  perform private.require_admin();
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'Membro não encontrado.';
  end if;
  if exists (select r from unnest(after) r except select code from public.professional_roles) then
    raise exception 'Função profissional inválida.';
  end if;

  before := coalesce((select array_agg(role_code order by role_code) from public.profile_roles where profile_id = target), '{}');
  delete from public.profile_roles where profile_id = target and not (role_code = any (after));
  insert into public.profile_roles (profile_id, role_code, assigned_by)
    select target, r, auth.uid() from unnest(after) r
    on conflict do nothing;

  if before is distinct from after then
    insert into public.access_audit (target_id, actor_id, action, details, reason)
    values (target, auth.uid(), 'funcoes', jsonb_build_object('antes', before, 'depois', after), 'Funções profissionais alteradas');
  end if;
end;
$$;

-- Concede/remove "admin". Só o PRINCIPAL. Nunca no próprio usuário; "principal" só por transferência.
create function public.admin_set_access_level(target uuid, new_level public.access_level)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if private.current_access_level() is distinct from 'principal' then
    raise exception 'Só o administrador principal altera níveis de acesso.' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'Você não pode alterar o próprio nível de acesso.' using errcode = '42501';
  end if;
  if new_level not in ('admin', 'colaborador') then
    raise exception 'Para nomear outro principal, use a transferência de função.';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'Membro não encontrado.';
  end if;

  perform set_config('ajm.audit_reason',
    case new_level when 'admin' then 'Promovido a administrador' else 'Administrador removido' end, true);
  update public.profiles set access_level = new_level where id = target;
end;
$$;

-- Desativa/reativa um acesso (o histórico de tarefas é preservado: nada é apagado).
create function public.admin_set_active(target uuid, active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor public.access_level := private.require_admin();
  target_level public.access_level;
begin
  if target = auth.uid() then
    raise exception 'Você não pode desativar o próprio acesso.' using errcode = '42501';
  end if;
  select access_level into target_level from public.profiles where id = target;
  if target_level is null then
    raise exception 'Membro não encontrado.';
  end if;
  if target_level = 'principal' then
    raise exception 'O administrador principal não pode ser desativado. Transfira a função antes.' using errcode = '42501';
  end if;
  if actor = 'admin' and target_level <> 'colaborador' then
    raise exception 'Administradores só desativam colaboradores.' using errcode = '42501';
  end if;

  perform set_config('ajm.audit_reason', case when active then 'Acesso reativado' else 'Acesso desativado' end, true);
  update public.profiles set is_active = active where id = target;
end;
$$;

-- Transfere a função de administrador principal. Exige ter digitado a senha há no máximo 10 minutos.
create function public.transfer_principal(target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  last_password_login bigint;
begin
  if private.current_access_level() is distinct from 'principal' then
    raise exception 'Só o administrador principal pode transferir a função.' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'Escolha outra pessoa.';
  end if;
  if not exists (select 1 from public.profiles where id = target and is_active) then
    raise exception 'Membro não encontrado ou desativado.';
  end if;

  select max((m ->> 'timestamp')::bigint) into last_password_login
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m
  where m ->> 'method' = 'password';
  if last_password_login is null or last_password_login < extract(epoch from now()) - 600 then
    raise exception 'Confirme sua senha para transferir a função.' using errcode = '42501';
  end if;

  perform set_config('ajm.audit_reason', 'Transferência da função de administrador principal', true);
  -- Ordem livre: a regra "sempre um principal ativo" é conferida no COMMIT.
  update public.profiles set access_level = 'admin' where id = auth.uid();
  update public.profiles set access_level = 'principal' where id = target;

  insert into public.access_audit (target_id, actor_id, action, details, reason)
  values (target, auth.uid(), 'transferencia', jsonb_build_object('de', auth.uid(), 'para', target),
          'Transferência da função de administrador principal');
end;
$$;

-- Cria um convite e devolve o CÓDIGO (mostrado uma única vez; o banco guarda só o hash).
create function public.admin_create_invite(p_email text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  e text := lower(trim(p_email));
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sem 0/O, 1/I/L
  raw bytea := extensions.gen_random_bytes(8);
  code text := '';
  i int;
begin
  perform private.require_admin();
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(e) > 254 then
    raise exception 'E-mail inválido.';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = e) then
    raise exception 'Já existe uma conta com este e-mail.';
  end if;

  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(raw, i) % 31) + 1, 1);
  end loop;

  update public.activation_invites set revoked_at = now()
  where email = e and used_at is null and revoked_at is null;

  insert into public.activation_invites (email, code_hash, invited_by)
  values (e, private.hash_code(code), auth.uid());

  insert into public.access_audit (target_id, actor_id, action, details, reason)
  values (auth.uid(), auth.uid(), 'convite', jsonb_build_object('email', e), 'Convite criado');

  return substr(code, 1, 4) || '-' || substr(code, 5, 4);
end;
$$;

create function public.admin_revoke_invite(invite uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.activation_invites set revoked_at = now()
  where id = invite and used_at is null and revoked_at is null;
end;
$$;

-- ---------------------------------------------------------------------
-- Ativação (SÓ o servidor, com a chave secreta — service_role)
-- ---------------------------------------------------------------------

-- Confere e-mail + código; se válido, RESERVA o convite (uso único) e devolve o id.
-- Código errado conta tentativa (máx. 5). Sempre a mesma resposta (null) para qualquer falha.
create function public.claim_invite(p_email text, p_code text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare inv public.activation_invites;
begin
  select * into inv from public.activation_invites
  where email = lower(trim(p_email)) and used_at is null and revoked_at is null
  for update;

  if not found or inv.expires_at < now() or inv.attempts >= 5 then
    return null;
  end if;
  if inv.code_hash <> private.hash_code(p_code) then
    update public.activation_invites set attempts = attempts + 1 where id = inv.id;
    return null;
  end if;

  update public.activation_invites set used_at = now() where id = inv.id;
  return inv.id;
end;
$$;

-- Desfaz a reserva se a criação da conta falhar.
create function public.release_invite(invite uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.activation_invites set used_at = null where id = invite and used_by is null;
$$;

-- Conclui: liga o convite à conta criada e registra no histórico.
create function public.finish_invite(invite uuid, new_user uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.activation_invites set used_by = new_user where id = invite;
  insert into public.access_audit (target_id, actor_id, action, reason)
  values (new_user, new_user, 'ativacao', 'Conta ativada com código de convite');
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.current_access_level() to authenticated;

revoke execute on function
  public.admin_set_roles(uuid, text[]),
  public.admin_set_access_level(uuid, public.access_level),
  public.admin_set_active(uuid, boolean),
  public.transfer_principal(uuid),
  public.admin_create_invite(text),
  public.admin_revoke_invite(uuid),
  public.claim_invite(text, text),
  public.release_invite(uuid),
  public.finish_invite(uuid, uuid)
from public, anon, authenticated;

-- Administradores logados (cada função confere o nível de quem chama):
grant execute on function
  public.admin_set_roles(uuid, text[]),
  public.admin_set_access_level(uuid, public.access_level),
  public.admin_set_active(uuid, boolean),
  public.transfer_principal(uuid),
  public.admin_create_invite(text),
  public.admin_revoke_invite(uuid)
to authenticated;

-- Só o servidor (chave secreta):
grant execute on function
  public.claim_invite(text, text),
  public.release_invite(uuid),
  public.finish_invite(uuid, uuid)
to service_role;

-- ---------------------------------------------------------------------
-- RLS das tabelas novas
-- ---------------------------------------------------------------------
alter table public.professional_roles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.activation_invites enable row level security;

revoke all on public.professional_roles, public.profile_roles, public.activation_invites from anon, authenticated;
grant select on public.professional_roles, public.profile_roles to authenticated;
-- Convites: administradores veem a lista, MAS nunca o hash do código.
grant select (id, email, invited_by, created_at, expires_at, attempts, used_at, revoked_at)
  on public.activation_invites to authenticated;

create policy "funções: leitura por membros ativos"
  on public.professional_roles for select to authenticated
  using ((select private.is_active_member()));

create policy "funções dos membros: leitura por membros ativos"
  on public.profile_roles for select to authenticated
  using ((select private.is_active_member()));

create policy "convites: leitura por administradores"
  on public.activation_invites for select to authenticated
  using ((select private.current_access_level()) in ('principal', 'admin'));
