import { CardSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mx-auto mb-4 h-3 w-56 skeleton" />
      <CardSkeleton />
    </div>
  );
}
