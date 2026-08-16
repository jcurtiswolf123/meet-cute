import Link from "next/link";
import { Logo } from "@/components/ui";

// The two content sections plus how-it-works. Kept in one place so the desktop
// row and the small-screen row can never drift apart.
const SECTIONS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/dinners", label: "Dinners" },
  { href: "/coaching", label: "Coaching" },
];

// `overlay` floats the header over a hero; `light` styles it for a dark hero
// (cream logo and links). Off a dark hero it stays on the cream surface.
export function SiteHeader({ overlay = false, light = false }: { overlay?: boolean; light?: boolean }) {
  const linkBase = "py-3 transition-colors duration-200";
  const linkColor = light
    ? "text-cream/70 hover:text-cream"
    : "text-muted hover:text-ink";
  const cta = light
    ? "btn inline-flex bg-cream text-ink hover:bg-cream/85"
    : "btn-primary";

  return (
    // Marked so the iOS shell can hide it: /refer, /dinners, and /coaching are
    // public pages that a signed-in member reaches from a native tab, and this
    // header offers them Sign in and Apply inside an app they are already
    // signed into. See the [data-native="ios"] block in globals.css.
    <header
      data-site-header
      className={overlay ? "absolute inset-x-0 top-0 z-50" : "border-b border-line bg-cream"}
    >
      <a
        href="#main-content"
        className="sr-only z-[60] bg-ink px-4 py-3 text-cream focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <div className="container-mc flex h-20 items-center justify-between gap-5">
        <Logo light={light} />
        <nav aria-label="Primary navigation" className="flex items-center gap-5 text-sm sm:gap-7">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={`hidden ${linkBase} ${linkColor} md:inline`}
            >
              {section.label}
            </Link>
          ))}
          <Link href="/login" className={`${linkBase} ${linkColor}`}>
            Sign in
          </Link>
          <Link href="/apply" className={cta}>
            Apply
          </Link>
        </nav>
      </div>

      {/* Below md the main row only has space for Sign in and Apply, which used
          to leave Dinners and Coaching unreachable from the header entirely: the
          two pages the site is actually about. A hamburger would bury them one
          tap deeper, so give them their own quiet row instead. */}
      <nav
        aria-label="Sections"
        className="container-mc -mt-2 flex items-center gap-6 pb-3 text-sm md:hidden"
      >
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className={`${linkBase} ${linkColor}`}>
            {section.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
