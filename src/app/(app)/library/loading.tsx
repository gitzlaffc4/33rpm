export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-48 animate-pulse rounded-md bg-muted/50" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
