import Link from "next/link";
import { Logo } from "@/components/ui";

// Shared top bar. On mobile the browse-oriented links (Dinners, Coaching, Studio)
// collapse so the logo never wraps and the primary action (Apply) stays uncramped;
// the full nav returns at sm and up. Sign in stays in the header at every width so
// a returning member never has to scroll to the footer to get back in. The rest
// stay reachable on mobile via SiteFooter.
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-cream/80 backdrop-blur">
      <div className="container-mc flex items-center justify-between gap-4 py-5">
        <div className="shrink-0 whitespace-nowrap">
          <Logo />
        </div>
        <nav className="flex items-center gap-5 text-sm sm:gap-7">
          <Link href="/dinners" className="hidden -my-2 py-2 text-muted transition-colors hover:text-ink sm:inline">
            Dinners
          </Link>
          <Link href="/coaching" className="hidden -my-2 py-2 text-muted transition-colors hover:text-ink sm:inline">
            Coaching
          </Link>
          <Link href="/login" className="-my-2 py-2 text-muted transition-colors hover:text-ink">
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
