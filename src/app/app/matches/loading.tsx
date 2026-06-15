import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-9 w-32" />
        </div>
      ))}
    </div>
  );
}
