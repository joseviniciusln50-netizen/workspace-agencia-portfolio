/**
 * Política de senha (espelha a configuração do Supabase: mínimo 10, letras e números).
 * Validada no SERVIDOR antes de chamar o Supabase; o Supabase valida de novo.
 */
export const PASSWORD_MIN = 10;
/** Limite do bcrypt usado pelo Supabase Auth. */
export const PASSWORD_MAX = 72;

export function passwordProblem(password: string, confirmation?: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return "A senha é longa demais.";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Use letras e números na senha.";
  if (confirmation !== undefined && password !== confirmation) return "As senhas não conferem.";
  return null;
}

/** Validação simples de formato (o Supabase faz a verificação definitiva). */
export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
