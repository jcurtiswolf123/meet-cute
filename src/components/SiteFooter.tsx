import Link from "next/link";
import { Logo } from "@/components/ui";

// Shared footer. Carries the secondary nav so mobile users (where the header
// collapses those links) still have a path to Dinners, Coaching, and Sign in.
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-cream">
      <div className="container-mc flex flex-col gap-8 py-section-md sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Logo subtle />
          <nav className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <Link href="/dinners" className="-my-1 py-1 transition-colors hover:text-ink">Dinners</Link>
            <Link href="/coaching" className="-my-1 py-1 transition-colors hover:text-ink">Coaching</Link>
            <Link href="/login" className="-my-1 py-1 transition-colors hover:text-ink">Sign in</Link>
            <Link href="/studio/login" className="-my-1 py-1 transition-colors hover:text-ink">Studio</Link>
            <Link href="/apply" className="-my-1 py-1 transition-colors hover:text-ink">Apply</Link>
          </nav>
        </div>
        <div className="text-sm text-muted sm:text-right">
          <p className="font-medium text-ink">NYC &middot; San Francisco</p>
          <p className="mt-1">&copy; {new Date().getFullYear()} Meet Cute</p>
        </div>
      </div>
    </footer>
  );
}
