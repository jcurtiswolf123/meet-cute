import { Skeleton, RowSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="mt-6 h-10 w-full max-w-md" />
      <div className="mt-5 overflow-x-auto rounded-xl2 border border-line bg-panel">
        {Array.from({ length: 8 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
