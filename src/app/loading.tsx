// Root loading state: shown while any page segment without its own loading.tsx
// resolves. Calm, on-brand, not a jarring spinner.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="flex items-center gap-3 text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-claret" />
        <span className="font-display text-lg">Meet Cute</span>
      </div>
    </div>
  );
}
