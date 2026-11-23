-- =====================================================================
-- Notificações no celular (Web Push): aparelhos inscritos.
-- - Cada pessoa grava/remove SÓ os próprios aparelhos (funções push_subscribe/push_unsubscribe).
-- - Ler os aparelhos de OUTRAS pessoas (para enviar) é exclusivo do servidor com a chave
--   secreta (service_role): push_targets / push_drop. Nenhum membro lê endpoint alheio.
-- - O endereço do serviço de push é conferido (só https de serviços conhecidos) — o servidor
--   não pode ser usado para chamar URLs arbitrárias.
-- Só acrescenta: não altera tabelas nem funções existentes.
-- =====================================================================

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id, created_at desc);

create function private.valid_push_endpoint(p text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null
     and length(p) <= 1000
     and p ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)(/|$)';
$$;

-- Inscreve (ou atualiza) ESTE aparelho para quem chama. Máximo de 10 aparelhos por pessoa.
create function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_member();
  if not private.valid_push_endpoint(p_endpoint) then
    raise exception 'Endereço de notificação inválido.';
  end if;
  if coalesce(length(p_p256dh), 0) not between 40 and 200 or coalesce(length(p_auth), 0) not between 10 and 100 then
    raise exception 'Chaves de notificação inválidas.';
  end if;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();

  delete from public.push_subscriptions
  where profile_id = auth.uid()
    and id not in (select id from public.push_subscriptions where profile_id = auth.uid() order by created_at desc limit 10);
end;
$$;

-- Remove a inscrição deste aparelho (só se for de quem chama).
create function public.push_unsubscribe(p_endpoint text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_member();
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
end;
$$;

-- SÓ O SERVIDOR: aparelhos das pessoas indicadas (apenas membros ativos).
create function public.push_targets(p_profiles uuid[])
returns table (profile_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = ''
as $$
  select s.profile_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.profile_id and p.is_active
  where s.profile_id = any (coalesce(p_profiles, '{}'))
    and cardinality(coalesce(p_profiles, '{}')) <= 50;
$$;

-- SÓ O SERVIDOR: descarta inscrição que o serviço de push disse não existir mais (404/410).
create function public.push_drop(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- ---------------------------------------------------------------------
-- Permissões e RLS
-- ---------------------------------------------------------------------
revoke execute on function private.valid_push_endpoint(text) from public, anon, authenticated;

revoke execute on function
  public.push_subscribe(text, text, text, text),
  public.push_unsubscribe(text),
  public.push_targets(uuid[]),
  public.push_drop(text)
from public, anon, authenticated;

grant execute on function
  public.push_subscribe(text, text, text, text),
  public.push_unsubscribe(text)
to authenticated;

grant execute on function
  public.push_targets(uuid[]),
  public.push_drop(text)
to service_role;

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, endpoint, user_agent, created_at) on public.push_subscriptions to authenticated;

create policy "aparelhos: cada um vê os seus" on public.push_subscriptions
  for select to authenticated using (profile_id = (select auth.uid()) and (select private.is_active_member()));
