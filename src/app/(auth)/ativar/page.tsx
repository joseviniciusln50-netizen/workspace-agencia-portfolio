import type { Metadata } from "next";
import { ActivationForm } from "@/components/auth/activation-form";

export const metadata: Metadata = { title: "Ativar minha conta" };

export default function AtivarPage() {
  return <ActivationForm />;
}
