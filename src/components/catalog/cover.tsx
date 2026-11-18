/* eslint-disable @next/next/no-img-element -- images come from our own /api/images routes */
import { Disc3 } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  /** Stored image id (served by /api/images/[id]). */
  imageId?: string | null;
  /** Remote cover URL for search results (proxied through /api/images/remote). */
  remoteUrl?: string | null;
  alt: string;
  size?: 600 | 1200;
  className?: string;
  priority?: boolean;
};

export function coverSrc(imageId: string, size: 600 | 1200 = 600) {
  return `/api/images/${imageId}?size=${size}`;
}

/** Square album art with a record-shaped placeholder. */
export function Cover({ imageId, remoteUrl, alt, size = 600, className, priority }: Props) {
  const src = imageId
    ? coverSrc(imageId, size)
    : remoteUrl
      ? `/api/images/remote?url=${encodeURIComponent(remoteUrl)}`
      : null;
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-md bg-gradient-to-br from-secondary to-muted shadow-sm ring-1 ring-border/50",
        className,
      )}
    >
      <Disc3 aria-hidden className="absolute inset-0 m-auto size-1/2 text-muted-foreground/30" />
      {src && (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="relative size-full object-cover"
        />
      )}
    </div>
  );
}
