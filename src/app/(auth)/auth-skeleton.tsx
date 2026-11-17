import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AuthCardSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading">
      <CardHeader>
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-9 animate-pulse rounded bg-muted" />
        <div className="h-9 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
