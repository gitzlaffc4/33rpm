import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Stats" };

export default function StatsPage() {
  return (
    <>
      <PageHeader title="Stats" description="Your collection by the numbers." />
      <EmptyState icon={ChartColumn} title="No stats yet">
        <p>Add a few items and this page will fill up.</p>
      </EmptyState>
    </>
  );
}
