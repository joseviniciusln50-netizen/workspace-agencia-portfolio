-- =====================================================================
-- Workspace · Publicação · Link de nova senha gerado pela administração
-- (sem SMTP: o e-mail do Supabase Free só chega à equipe do painel do Supabase).
--
-- O link em si é gerado pelo servidor (Auth Admin API, chave secreta). Esta função
-- AUTORIZA antes, no banco, e registra no histórico:
-- - admin → só colaboradores; principal → admins e colaboradores;
-- - nunca para o administrador principal nem para si mesmo; nunca para conta desativada.
-- Não altera dados existentes.
-- =====================================================================

-- O histórico passa a aceitar a ação 'senha' (recria a regra de valores permitidos).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.access_audit'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.access_audit drop constraint %I', c);
  end loop;
end;
$$;

alter table public.access_audit
  add constraint access_audit_action_check
  check (action in ('acesso', 'funcoes', 'convite', 'ativacao', 'transferencia', 'senha'));

create function public.admin_authorize_password_reset(target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor public.access_level := private.require_admin();
  t_level public.access_level;
  t_active boolean;
begin
  if target = auth.uid() then
    raise exception 'Para a sua própria senha, use "Esqueci minha senha" na tela de login.' using errcode = '42501';
  end if;
  select access_level, is_active into t_level, t_active from public.profiles where id = target;
  if t_level is null then
    raise exception 'Membro não encontrado.';
  end if;
  if not t_active then
    raise exception 'Reative o acesso antes de gerar um link de nova senha.';
  end if;
  if t_level = 'principal' then
    raise exception 'Não é possível gerar link de nova senha para o administrador principal.' using errcode = '42501';
  end if;
  if actor = 'admin' and t_level <> 'colaborador' then
    raise exception 'Administradores só geram links de nova senha para colaboradores.' using errcode = '42501';
  end if;

  insert into public.access_audit (target_id, actor_id, action, reason)
  values (target, auth.uid(), 'senha', 'Link de nova senha gerado pela administração');
end;
$$;

revoke execute on function public.admin_authorize_password_reset(uuid) from public, anon, authenticated;
grant execute on function public.admin_authorize_password_reset(uuid) to authenticated;
