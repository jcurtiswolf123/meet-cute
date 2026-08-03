import Link from "next/link";
import { Logo } from "@/components/ui";
import { ShareLink } from "@/components/ShareLink";

export const metadata = { title: "Application received" };

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
}

export default function Thanks() {
  // Jess's ask, 2026-08-02: the thing to do after applying is bring your single
  // friends, not wait. The dinner is still here, one step down.
  return (
    <main className="container-mc flex min-h-screen flex-col items-start justify-center">
      <Logo />
      <h1 className="mt-8 font-display text-4xl font-medium tracking-tight">Thank you.</h1>
      <p className="mt-3 max-w-[48ch] text-lg text-muted">
        We read every application by hand, so hang tight. You will hear from us soon.
      </p>
      <p className="mt-6 max-w-[48ch] text-lg text-ink">
        In the meantime, send this link to your single friends. The more mutuals, the better the
        matches.
      </p>
      <div className="mt-5 w-full">
        <ShareLink url={`${appBase()}/apply`} />
      </div>
      <div className="mt-10 flex gap-3">
        <Link href="/dinners" className="btn-ghost px-7 py-3">See upcoming dinners</Link>
        <Link href="/" className="btn-ghost px-7 py-3">Back home</Link>
      </div>
    </main>
  );
}
