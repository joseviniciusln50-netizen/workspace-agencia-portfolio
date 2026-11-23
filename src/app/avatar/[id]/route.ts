import type { NextRequest } from "next/server";
import { AVATAR_PATH_RE, UUID_RE } from "@/lib/profile/rules";
import { createClient } from "@/lib/supabase/server";

/**
 * Foto de perfil a partir do bucket PRIVADO "avatars".
 * - Exige sessão (o proxy já bloqueia quem não está logado) e o Storage aplica RLS:
 *   só membros ativos leem.
 * - Endereço estável `/avatar/<id>?v=<versão>` → o navegador guarda em cache; nova foto = nova versão.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/avatar/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return new Response(null, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("avatar_url").eq("id", id).maybeSingle();
  const path = profile?.avatar_url as string | null | undefined;
  if (!path || !AVATAR_PATH_RE.test(path)) return new Response(null, { status: 404 });

  const { data: blob, error } = await supabase.storage.from("avatars").download(path);
  if (error || !blob) return new Response(null, { status: 404 });

  return new Response(blob, {
    headers: {
      "Content-Type": blob.type || "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
