import type { ReactNode } from "react";
import { LoginStage } from "@/components/auth/login-stage";

/** Telas de acesso (login, recuperação e definição de senha): telão + card Liquid Glass. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <LoginStage>{children}</LoginStage>;
}
