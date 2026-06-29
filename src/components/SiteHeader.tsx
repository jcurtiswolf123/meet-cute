import Link from "next/link";
import { Logo } from "@/components/ui";

// Shared top bar. On mobile the secondary text links collapse so the logo never
// wraps and the primary action (Apply) stays uncramped; the full nav returns at
// sm and up. Secondary destinations stay reachable on mobile via SiteFooter.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/85 backdrop-blur">
      {/* thin ember rule along the very top: a masthead signature, not a SaaS bar */}
      <div className="rule-ember" />
      <div className="container-mc flex items-center justify-between gap-4 py-4">
        <div className="flex items-baseline gap-3">
          <Logo />
          <span className="kicker hidden sm:inline">By introduction only</span>
        </div>
        <nav className="flex items-center gap-5 text-sm sm:gap-7">
          <Link href="/dinners" className="hidden -my-2 py-2 text-muted transition-colors hover:text-ink sm:inline">
            Dinners
          </Link>
          <Link href="/coaching" className="hidden -my-2 py-2 text-muted transition-colors hover:text-ink sm:inline">
            Coaching
          </Link>
          <Link href="/login" className="hidden -my-2 py-2 text-muted transition-colors hover:text-ink sm:inline">
            Sign in
          </Link>
          <Link href="/studio/login" className="hidden -my-2 py-2 text-muted transition-colors hover:text-ink sm:inline">
            Studio
          </Link>
          <Link href="/apply" className="btn-primary">
            Apply
          </Link>
        </nav>
      </div>
    </header>
  );
}
