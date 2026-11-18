import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { SearchPanel } from "@/components/search/search-panel";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <PageHeader title="Search" description="Everything you own and want." />
      <Suspense fallback={<div className="h-12 animate-pulse rounded-md bg-muted/40" />}>
        <Panel searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Panel({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const { q } = await searchParams;
  return <SearchPanel initial={typeof q === "string" ? q : ""} />;
}
