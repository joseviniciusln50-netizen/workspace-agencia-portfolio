-- =====================================================================
-- Workspace · APAGAR CLIENTES (pedido do usuário em 18/11/2026)
--
-- "Caso algum cliente deixe a agência, nós apagamos a aba dele."
-- Regras:
-- 1. Só a administração apaga, e precisa confirmar digitando o NOME do cliente (conferido aqui no banco).
-- 2. Somem o cliente (a página dele) e os PROJETOS dele.
-- 3. Tarefas, briefings e gravações continuam no histórico: perdem o vínculo (client_id/project_id
--    viram null pelas chaves estrangeiras), mas guardam o nome do cliente em texto.
-- Também: renomear um cliente atualiza o nome guardado nas gravações (como já acontecia em tarefas/briefings).
-- Depende de 20261119120000_gravacoes.sql.
-- =====================================================================

create or replace function public.client_update(p_client uuid, p_name text, p_notes text, p_active boolean)
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
  update public.recordings set client = trim(p_name) where client_id = p_client;
end;
$$;

create function public.client_delete(p_client uuid, p_confirm text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare cname text;
begin
  perform private.require_admin_member();
  select name into cname from public.clients where id = p_client;
  if cname is null then raise exception 'Cliente não encontrado.'; end if;
  if lower(trim(coalesce(p_confirm, ''))) <> lower(cname) then
    raise exception 'Para apagar, digite o nome do cliente exatamente como está no cadastro.';
  end if;
  -- projetos do cliente (tarefas e gravações ligadas a eles ficam sem projeto)
  delete from public.projects where client_id = p_client;
  -- o cliente (tarefas, briefings e gravações ficam sem vínculo, com o nome em texto)
  delete from public.clients where id = p_client;
end;
$$;

revoke execute on function public.client_delete(uuid, text) from public, anon;
grant execute on function public.client_delete(uuid, text) to authenticated;
