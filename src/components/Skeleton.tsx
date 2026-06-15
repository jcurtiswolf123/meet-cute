export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="grid sm:grid-cols-[200px_1fr]">
        <Skeleton className="h-52 w-full rounded-none" />
        <div className="space-y-3 p-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
      <Skeleton className="h-9 w-9 rounded-full" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="ml-auto h-4 w-24" />
    </div>
  );
}
