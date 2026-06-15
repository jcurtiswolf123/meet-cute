import Link from "next/link";
import { Logo } from "@/components/ui";

export default function Thanks() {
  return (
    <main className="container-mc flex min-h-screen flex-col items-start justify-center">
      <Logo />
      <h1 className="mt-8 font-display text-4xl font-medium tracking-tight">Thank you.</h1>
      <p className="mt-3 max-w-[48ch] text-lg text-muted">
        We read every application by hand. If it is a fit, you will hear from Jess or Zoe within a week.
        In the meantime, the best way in is a dinner.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/dinners" className="btn-primary px-7 py-3">See upcoming dinners</Link>
        <Link href="/" className="btn-ghost px-7 py-3">Back home</Link>
      </div>
    </main>
  );
}
