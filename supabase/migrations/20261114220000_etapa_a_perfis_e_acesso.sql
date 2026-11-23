-- =====================================================================
-- Workspace · Fase 2 · ETAPA A
-- Perfis, níveis de acesso, proteção do administrador principal e
-- histórico de auditoria de privilégios.
--
-- Princípios:
-- - Ninguém recebe privilégio automaticamente: todo perfil nasce "colaborador".
-- - O cliente (chave publicável) NÃO consegue alterar nível de acesso nem "ativo":
--   permissões por coluna + RLS. Mudanças de privilégio só por funções do servidor
--   (Etapa B) ou pelo SQL Editor (nomeação inicial do principal).
-- - Sempre existe exatamente um administrador principal ativo depois de nomeado.
-- - Toda mudança de privilégio é registrada em public.access_audit.
-- =====================================================================

-- Esquema não exposto pela API (Data API expõe só "public").
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- O serviço de Auth dispara o gatilho de criação de perfil (private.handle_new_user).
grant usage on schema private to supabase_auth_admin;

-- ---------------------------------------------------------------------
-- Tipos e tabelas
-- ---------------------------------------------------------------------
create type public.access_level as enum ('principal', 'admin', 'colaborador');

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null default '' check (char_length(full_name) <= 120),
  bio           text not null default '' check (char_length(bio) <= 500),
  avatar_url    text check (avatar_url is null or char_length(avatar_url) <= 500),
  access_level  public.access_level not null default 'colaborador',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de cada usuário do Auth. Criado automaticamente, sempre como colaborador.';
comment on column public.profiles.access_level is 'Nível de acesso. Não editável pelo cliente (sem GRANT de coluna).';
comment on column public.profiles.is_active is 'false = acesso desativado; o histórico é preservado.';

-- Histórico de mudanças de privilégio (sem FK: sobrevive à exclusão do usuário).
create table public.access_audit (
  id                bigint generated always as identity primary key,
  target_id         uuid not null,
  actor_id          uuid,              -- null = SQL Editor / sistema
  old_access_level  public.access_level,
  new_access_level  public.access_level,
  old_is_active     boolean,
  new_is_active     boolean,
  reason            text check (reason is null or char_length(reason) <= 300),
  created_at        timestamptz not null default now()
);

create index access_audit_target_idx on public.access_audit (target_id, created_at desc);

-- ---------------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER, search_path vazio)
-- ---------------------------------------------------------------------

-- O usuário da sessão é membro ativo?
create function private.is_active_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

-- Nível de acesso do usuário da sessão (null se inativo ou sem perfil).
create function private.current_access_level()
returns public.access_level
language sql stable security definer set search_path = ''
as $$
  select p.access_level from public.profiles p
  where p.id = (select auth.uid()) and p.is_active;
$$;

-- Mantém updated_at.
create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Cria o perfil quando um usuário surge no Auth (convite ou criação manual).
-- NUNCA lê nível de acesso de metadados: sempre "colaborador".
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Registra no histórico toda criação de perfil e mudança de nível/ativo.
-- O motivo pode ser informado pela transação: set_config('ajm.audit_reason', '...', true).
create function private.log_access_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.access_audit (target_id, actor_id, new_access_level, new_is_active, reason)
    values (new.id, auth.uid(), new.access_level, new.is_active,
            coalesce(nullif(current_setting('ajm.audit_reason', true), ''), 'Perfil criado'));
  elsif new.access_level is distinct from old.access_level or new.is_active is distinct from old.is_active then
    insert into public.access_audit
      (target_id, actor_id, old_access_level, new_access_level, old_is_active, new_is_active, reason)
    values (new.id, auth.uid(), old.access_level, new.access_level, old.is_active, new.is_active,
            nullif(current_setting('ajm.audit_reason', true), ''));
  end if;
  return null;
end;
$$;

-- Invariante do administrador principal (verificada no COMMIT):
-- 1) no máximo um principal;
-- 2) se um principal ativo foi rebaixado, desativado ou removido, outro precisa
--    existir ao final da transação (transferência atômica). O sistema nunca fica sem.
create function private.enforce_principal_invariant()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  total_principals int;
  active_principals int;
begin
  select count(*), count(*) filter (where is_active)
    into total_principals, active_principals
  from public.profiles where access_level = 'principal';

  if total_principals > 1 then
    raise exception 'Só pode existir um administrador principal.'
      using errcode = 'check_violation';
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and old.access_level = 'principal' and old.is_active
     and active_principals = 0 then
    raise exception 'O sistema não pode ficar sem um administrador principal ativo. Transfira a função antes.'
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

-- Nomeação INICIAL do administrador principal. Só funciona se ainda não existir nenhum.
-- Uso exclusivo no SQL Editor do Supabase (não exposto à API):
--   select private.bootstrap_principal('email@da.pessoa');
create function private.bootstrap_principal(target_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  target uuid;
begin
  if exists (select 1 from public.profiles where access_level = 'principal') then
    raise exception 'Já existe um administrador principal. Use a transferência de função.';
  end if;

  select u.id into target from auth.users u where lower(u.email) = lower(trim(target_email));
  if target is null then
    raise exception 'Nenhum usuário com o e-mail informado.';
  end if;

  perform set_config('ajm.audit_reason', 'Nomeação inicial do administrador principal (manual, SQL Editor)', true);
  update public.profiles set access_level = 'principal', is_active = true where id = target;
end;
$$;

-- Funções: ninguém executa por padrão; liberamos só o necessário.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.current_access_level() to authenticated;

-- ---------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

create trigger profiles_log_access_change
  after insert or update of access_level, is_active on public.profiles
  for each row execute function private.log_access_change();

create constraint trigger profiles_principal_invariant
  after insert or update of access_level, is_active or delete on public.profiles
  deferrable initially deferred
  for each row execute function private.enforce_principal_invariant();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Permissões e Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.access_audit enable row level security;

-- Nada para visitantes sem login.
revoke all on public.profiles, public.access_audit from anon;
-- Usuário logado: só leitura + edição de colunas permitidas do PRÓPRIO perfil.
revoke all on public.profiles, public.access_audit from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, bio) on public.profiles to authenticated;
grant select on public.access_audit to authenticated;

-- Leitura de perfis:
-- - o próprio perfil, sempre (o app precisa saber se a conta foi desativada);
-- - membros ATIVOS veem perfis ativos;
-- - administradores veem também os desativados.
create policy "perfis: leitura"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      (select private.is_active_member())
      and (is_active or (select private.current_access_level()) in ('principal', 'admin'))
    )
  );

-- Edição: apenas o próprio perfil, com a conta ativa (colunas limitadas pelo GRANT acima).
create policy "perfis: edição do próprio"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()));

-- Histórico de privilégios: apenas administradores ativos leem. Ninguém escreve pela API.
create policy "auditoria: leitura por administradores"
  on public.access_audit for select to authenticated
  using ((select private.current_access_level()) in ('principal', 'admin'));

-- ---------------------------------------------------------------------
-- Perfis para usuários que já existiam antes desta migration (ex.: usuário de teste).
-- FICA NO FIM: o INSERT dispara o gatilho adiado (conferido no COMMIT) e, com eventos
-- pendentes, o PostgreSQL não permite mais ALTER TABLE em profiles na mesma transação.
-- ---------------------------------------------------------------------
insert into public.profiles (id, full_name)
select u.id, left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1), ''), 120)
from auth.users u
on conflict (id) do nothing;
