import type { Metadata } from "next";
import { WithMural } from "@/components/mural/with-mural";
import { DashboardView } from "@/components/views/dashboard-view";

export const metadata: Metadata = { title: "Início" };

export default function DashboardPage() {
  return (
    <WithMural>
      <DashboardView />
    </WithMural>
  );
}
