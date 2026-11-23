import type { Metadata } from "next";
import { WithMural } from "@/components/mural/with-mural";
import { ClientsView } from "@/components/views/clients-view";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientesPage() {
  return (
    <WithMural>
      <ClientsView />
    </WithMural>
  );
}
