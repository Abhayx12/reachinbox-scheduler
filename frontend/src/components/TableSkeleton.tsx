export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-paper" />
          <div className="h-3 w-56 animate-pulse rounded bg-paper" />
          <div className="ml-auto h-3 w-20 animate-pulse rounded bg-paper" />
        </div>
      ))}
    </div>
  );
}
