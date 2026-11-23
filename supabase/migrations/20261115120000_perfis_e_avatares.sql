-- =====================================================================
-- Workspace · Reorganização · ETAPA 2
-- Fotos de perfil (Supabase Storage) e edição do próprio perfil.
--
-- - Bucket PRIVADO "avatars": só membros ativos logados veem as fotos.
-- - Cada pessoa só grava/substitui/remove arquivos na PRÓPRIA pasta: avatars/<seu id>/...
-- - profiles.avatar_url passa a ser editável pelo próprio usuário, mas o banco só aceita
--   um caminho dentro da pasta dele (regra no banco, não só na interface).
-- - Não altera níveis de acesso, administradores nem dados existentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bucket: privado, até 2 MB, só JPEG/PNG/WebP (o app envia ~512×512, normalmente < 150 KB)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Políticas do Storage (storage.objects já tem RLS ligado pelo Supabase)
-- ---------------------------------------------------------------------
create policy "avatares: leitura por membros ativos"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (select private.is_active_member()));

create policy "avatares: envio só na própria pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_member())
  );

create policy "avatares: substituição só na própria pasta"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_member())
  );

create policy "avatares: remoção só da própria pasta"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- profiles.avatar_url: caminho do arquivo no bucket (não uma URL externa)
-- ---------------------------------------------------------------------
-- Formato: <id do usuário>/<nome aleatório>.<webp|jpg|png>
alter table public.profiles
  add constraint profiles_avatar_path_format
  check (avatar_url is null or avatar_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{8,64}\.(webp|jpg|png)$');

-- Só a PRÓPRIA pasta (impede apontar para a foto de outra pessoa).
alter table public.profiles
  add constraint profiles_avatar_own_folder
  check (avatar_url is null or split_part(avatar_url, '/', 1) = id::text);

-- O usuário pode editar a própria foto (a política "perfis: edição do próprio" já limita ao próprio perfil).
grant update (avatar_url) on public.profiles to authenticated;
