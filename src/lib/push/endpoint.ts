/*
 * Endereços de push permitidos (anti-SSRF) — espelho de private.valid_push_endpoint no banco.
 * SEM imports: usado no app e na função agendada da Netlify.
 */
const PUSH_HOST = /^([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

export function isAllowedEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && PUSH_HOST.test(u.hostname);
  } catch {
    return false;
  }
}
