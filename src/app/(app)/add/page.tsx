import { ScanBarcode } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Add" };

export default function AddPage() {
  return (
    <>
      <PageHeader title="Add to collection" description="Search, type a barcode, or scan." />
      <EmptyState icon={ScanBarcode} title="Coming soon">
        <p>Search by artist/title, barcode or catalog number lands in the next phase.</p>
      </EmptyState>
    </>
  );
}
