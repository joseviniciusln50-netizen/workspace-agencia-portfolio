import {
  Building2,
  Clapperboard,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  StickyNote,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AccessLevel } from "@/lib/auth/access";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Só para administradores (a página também confere no servidor). */
  adminOnly?: boolean;
}

/** Trabalho do dia a dia. */
export const WORK_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/tarefas", label: "Tarefas", icon: StickyNote },
  { href: "/gravacoes", label: "Gravações", icon: Clapperboard },
  { href: "/briefings", label: "Briefings", icon: FileText },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/equipe", label: "Equipe", icon: Users },
];

/** Conta e gestão. */
export const ACCOUNT_ITEMS: NavItem[] = [
  { href: "/perfil", label: "Meu perfil", icon: UserRound },
  { href: "/admin", label: "Administração", icon: ShieldCheck, adminOnly: true },
];

/** Barra inferior do celular: 3 atalhos + "Mais" (o resto fica no menu). */
export const MOBILE_PRIMARY = ["/dashboard", "/tarefas", "/briefings"];

export function isAdmin(level: AccessLevel): boolean {
  return level === "principal" || level === "admin";
}

export function visibleItems(items: NavItem[], level: AccessLevel): NavItem[] {
  return items.filter((i) => !i.adminOnly || isAdmin(level));
}

/** Itens que vão no menu "Mais" do celular. */
export function moreItems(level: AccessLevel): NavItem[] {
  return visibleItems([...WORK_ITEMS, ...ACCOUNT_ITEMS], level).filter((i) => !MOBILE_PRIMARY.includes(i.href));
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
