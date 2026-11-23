/** Níveis de acesso (espelham o enum `public.access_level` do banco). */
export type AccessLevel = "principal" | "admin" | "colaborador";

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  principal: "Administrador principal",
  admin: "Administrador",
  colaborador: "Colaborador",
};

/** Dados mínimos do usuário logado que podem ir ao navegador. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  accessLevel: AccessLevel;
  /** Endereço interno da foto (`/avatar/<id>?v=…`) ou null → mostra as iniciais. */
  avatarUrl: string | null;
}
