"use client";

import { PushToggle } from "@/components/push/push-toggle";
import { SectionTitle } from "@/components/ui/primitives";
import { useSessionUser } from "@/components/shell/session-context";
import { AccessLabel, SignOutButton } from "@/components/shell/user-badge";

/**
 * Configurações da conta (só para a própria pessoa): e-mail de login e nível de acesso.
 * O e-mail NÃO aparece para outros funcionários. Nível de acesso não é editável aqui.
 */
export function AccountPanel() {
  const user = useSessionUser();
  return (
    <section aria-labelledby="conta">
      <SectionTitle>
        <span id="conta">Minha conta</span>
      </SectionTitle>
      <dl className="divide-y divide-hairline rounded-card border border-hairline bg-paper px-5 text-sm">
        <div className="flex flex-col gap-0.5 py-3.5">
          <dt className="text-[10px] font-bold tracking-[0.18em] text-muted uppercase">E-mail de login</dt>
          <dd className="truncate font-medium">{user.email}</dd>
          <dd className="text-xs font-light text-muted">Visível só para você.</dd>
        </div>
        <div className="flex flex-col gap-0.5 py-3.5">
          <dt className="text-[10px] font-bold tracking-[0.18em] text-muted uppercase">Nível de acesso</dt>
          <dd className="font-medium">
            <AccessLabel user={user} />
          </dd>
          <dd className="text-xs font-light text-muted">Definido pela administração.</dd>
        </div>
        <div className="py-3.5">
          <PushToggle />
        </div>
      </dl>
      <SignOutButton className="mt-4 h-11 w-full justify-center rounded-tile border border-hairline bg-paper px-5 text-xs font-bold tracking-wide uppercase transition-colors hover:border-ink/30" />
    </section>
  );
}
