import Link from "next/link";
import { Logo } from "@/components/ui";

// Shared top bar. On mobile the browse-oriented links (Dinners, Coaching, Studio)
// collapse so the logo never wraps and the primary action (Apply) stays uncramped;
// the full nav returns at sm and up. Sign in stays in the header at every width so
// a returning member never has to scroll to the footer to get back in. The rest
// stay reachable on mobile via SiteFooter.
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  // overlay: float transparently over a full-bleed hero (home page). A soft top
  // scrim keeps the nav legible over the video without a hard bar. Default: the
  // normal opaque bar with a hairline divider used on every other page.
  return (
    <header
      className={
        overlay
          ? "absolute inset-x-0 top-0 z-50 bg-gradient-to-b from-cream/85 via-cream/45 to-transparent"
          : "border-b border-line bg-cream/80 backdrop-blur"
      }
    >
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-panel px-4 py-2 text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <div className="container-mc flex items-center justify-between gap-4 py-5">
        <div className="shrink-0 whitespace-nowrap">
          <Logo />
        </div>
        <nav aria-label="Primary navigation" className="flex items-center gap-5 text-sm sm:gap-7">
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
