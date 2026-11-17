import { Disc3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" description="Every record, CD and tape on your shelves." />
      <EmptyState icon={Disc3} title="Your library is empty">
        <p>Search or scan to add the exact pressing you own.</p>
        <Button asChild className="mt-4">
          <Link href="/add">Add your first item</Link>
        </Button>
      </EmptyState>
    </>
  );
}
