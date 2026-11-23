import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WithMural } from "@/components/mural/with-mural";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { ClientDetailView } from "@/components/views/client-detail-view";
import { UUID_RE } from "@/lib/profile/rules";

export const metadata: Metadata = { title: "Cliente" };

export default function ClientePage({ params }: PageProps<"/clientes/[id]">) {
  return (
    <WithMural>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </WithMural>
  );
}

async function Detail({ params }: { params: PageProps<"/clientes/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return <ClientDetailView clientId={id} />;
}
