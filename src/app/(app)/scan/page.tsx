import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ScanStation } from "@/components/scan/scan-station";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage({ searchParams }: PageProps<"/scan">) {
  return (
    <>
      <PageHeader title="Scan" description="Use your phone's camera, or type the barcode." />
      <Suspense fallback={<div className="aspect-[4/3] animate-pulse rounded-xl bg-muted/40" />}>
        <Station searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Station({ searchParams }: Pick<PageProps<"/scan">, "searchParams">) {
  await requireUser();
  const { mode } = await searchParams;
  return <ScanStation key={String(mode)} crate={mode === "crate"} />;
}
