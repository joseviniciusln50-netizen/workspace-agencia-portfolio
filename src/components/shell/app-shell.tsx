"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/logo";
import type { SessionUser } from "@/lib/auth/access";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { MobileDock } from "./dock";
import { MoreSheet } from "./more-sheet";
import { NoticeBell, NoticesProvider } from "./notice-bell";
import {
  ACCOUNT_ITEMS,
  isActive,
  MOBILE_PRIMARY,
  moreItems,
  visibleItems,
  WORK_ITEMS,
  type NavItem,
} from "./nav-items";
import { PageSkeleton } from "./page-skeleton";
import { SessionProvider } from "./session-context";
import { AccessLabel, SignOutButton, UserAvatar } from "./user-badge";


/** `user` vem do servidor (identidade já conferida em src/lib/auth/session.ts). */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const mounted = useMounted();
  const [moreOpen, setMoreOpen] = useState(false);

  const work = visibleItems(WORK_ITEMS, user.accessLevel);
  const account = visibleItems(ACCOUNT_ITEMS, user.accessLevel);
  const primary = work.filter((i) => MOBILE_PRIMARY.includes(i.href));
  const more = moreItems(user.accessLevel);
  const moreActive = more.some((i) => isActive(pathname, i.href));

  return (
    <MotionConfig reducedMotion="user">
      <SessionProvider user={user}>
        <NoticesProvider>
        <>
          <BackgroundDecor />

          {/* Sidebar — desktop. Preta: o logo oficial disponível é a versão negativa. */}
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink px-5 py-7 text-paper lg:flex">
            <div className="brand-grid pointer-events-none absolute inset-0 text-paper/[0.05]" aria-hidden />
            <div className="relative flex items-center justify-between gap-2">
              <Link href="/dashboard" aria-label="Início">
                <BrandLogo eager className="h-7" />
              </Link>
              <NoticeBell className="-mr-1.5" />
            </div>

            <SidebarGroup label="Trabalho" items={work} pathname={pathname} className="mt-9" />
            <SidebarGroup label="Conta" items={account} pathname={pathname} className="mt-7" />

            <div className="relative mt-auto flex items-center gap-1 rounded-card border border-paper/[0.08] bg-paper/[0.04] p-2">
              <Link
                href="/perfil"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-tile px-1 py-1 outline-none transition-colors hover:bg-paper/5 focus-visible:ring-2 focus-visible:ring-paper/50"
              >
                <UserAvatar user={user} className="ring-ink" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{user.name}</span>
                  <span className="block truncate text-xs font-light text-paper/60">
                    <AccessLabel user={user} />
                  </span>
                </span>
              </Link>
              <SignOutButton
                label={false}
                className="size-9 justify-center rounded-tile text-paper/60 hover:bg-paper/10 hover:text-paper"
              />
            </div>
          </aside>

          {/* Topo — mobile */}
          <header className="sticky top-0 z-30 flex items-center justify-between bg-ink/95 px-4 py-3.5 backdrop-blur-xl lg:hidden">
            <Link href="/dashboard" aria-label="Início">
              <BrandLogo eager className="h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <NoticeBell />
              <Link href="/perfil" aria-label="Meu perfil">
                <UserAvatar user={user} className="size-8 text-[10px] ring-ink" />
              </Link>
            </div>
          </header>

          <main className="relative z-10 w-full px-4 pt-7 pb-[calc(8rem+var(--badge-h))] md:px-8 md:pt-10 lg:pt-12 lg:pr-12 lg:pb-[calc(4rem+var(--badge-h))] lg:pl-[calc(16rem+3rem)]">
            <div className="mx-auto max-w-5xl">
              {/* Prazos relativos à data LOCAL do aparelho ("Hoje", "Atrasada") → o conteúdo renderiza no cliente.
                  Os dados em si vêm do servidor (WithMural / páginas com Suspense). */}
              {mounted ? children : <PageSkeleton />}
            </div>
          </main>

          {/* Dock flutuante Liquid Glass — celular/tablet: 3 atalhos + "Mais" (respeita safe-area e a faixa da Netlify) */}
          <MobileDock items={primary} pathname={pathname} moreOpen={moreOpen} moreActive={moreActive} onMore={() => setMoreOpen(true)} />

          <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={more} user={user} pathname={pathname} />
        </>
        </NoticesProvider>
      </SessionProvider>
    </MotionConfig>
  );
}

function SidebarGroup({
  label,
  items,
  pathname,
  className,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.24em] text-paper/45 uppercase">
        {label} <span className="h-px flex-1 bg-paper/15" />
      </p>
      <nav aria-label={label} className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-tile px-3 py-2.5 text-sm outline-none transition-colors duration-200",
                "focus-visible:ring-2 focus-visible:ring-paper/50",
                active ? "font-semibold text-paper" : "font-medium text-paper/60 hover:bg-paper/[0.05] hover:text-paper",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  aria-hidden
                  className="absolute inset-0 rounded-tile bg-paper/[0.08] shadow-[inset_0_1px_0_rgb(255_255_255/0.08),inset_0_0_0_1px_rgb(255_255_255/0.06)]"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                >
                  {/* traço vermelho que desliza com o destaque */}
                  <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand shadow-[0_0_10px_rgb(255_0_0/0.7)]" />
                </motion.span>
              )}
              <Icon
                className={cn("relative size-4.5 transition-colors", active ? "text-brand" : "text-paper/55 group-hover:text-paper/85")}
                strokeWidth={2.2}
              />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}



/** Fundo neutro com o grid editorial da linguagem gráfica (sem manchas coloridas). */
function BackgroundDecor() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="brand-grid absolute inset-0 text-ink/[0.035]" />
    </div>
  );
}
