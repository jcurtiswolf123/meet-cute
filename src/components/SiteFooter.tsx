import Link from "next/link";
import { Logo } from "@/components/ui";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-cream">
      <div className="container-mc grid gap-16 py-16 md:grid-cols-12 md:py-section-md">
        <div className="md:col-span-5">
          <Logo light />
          <p className="mt-6 max-w-[28ch] font-display text-3xl leading-tight text-cream/85">
            Real introductions, for people ready to meet in real life.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 text-sm md:col-span-5 md:col-start-8">
          <nav aria-label="Footer navigation" className="flex flex-col items-start gap-3 text-cream/65">
            <Link href="/dinners" className="inline-flex min-h-11 items-center transition-colors duration-200 hover:text-cream">
              Dinners
            </Link>
            <Link href="/coaching" className="inline-flex min-h-11 items-center transition-colors duration-200 hover:text-cream">
              Coaching
            </Link>
            <Link href="/login" className="inline-flex min-h-11 items-center transition-colors duration-200 hover:text-cream">
              Member sign in
            </Link>
            <Link href="/apply" className="inline-flex min-h-11 items-center transition-colors duration-200 hover:text-cream">
              Apply
            </Link>
            <Link href="/refer" className="inline-flex min-h-11 items-center transition-colors duration-200 hover:text-cream">
              Recommend someone
            </Link>
          </nav>
          <nav aria-label="Legal navigation" className="flex flex-col items-start gap-3 text-cream/65">
            <Link href="/privacy" className="inline-flex min-h-11 items-center transition-colors duration-200 hover:text-cream">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center transition-colors duration-200 hover:text-cream">
              Terms
            </Link>
            <Link href="/sms-opt-in" className="inline-flex min-h-11 items-center transition-colors duration-200 hover:text-cream">
              SMS opt-in
            </Link>
          </nav>
        </div>
      </div>

      <div className="container-mc flex flex-col gap-3 border-t border-cream/15 py-6 text-xs text-cream/55 sm:flex-row sm:items-center sm:justify-between">
        <p>New York + San Francisco + Los Angeles</p>
        <p>&copy; {new Date().getFullYear()} Mutuals</p>
      </div>
    </footer>
  );
}
