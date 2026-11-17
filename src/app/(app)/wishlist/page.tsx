import { Heart } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage() {
  return (
    <>
      <PageHeader title="Wishlist" description="What you're hunting for." />
      <EmptyState icon={Heart} title="Nothing on your wishlist yet">
        <p>Wishlist tracking arrives in a later release.</p>
      </EmptyState>
    </>
  );
}
