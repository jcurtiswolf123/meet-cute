import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="container-mc flex min-h-screen flex-col items-start justify-center">
      <Logo />
      <p className="mt-8 font-display text-7xl text-claret/30">404</p>
      <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">We couldn&rsquo;t find that page.</h1>
      <p className="mt-2 text-muted">The best introductions are the ones you can actually get to.</p>
      <Link href="/" className="btn-primary mt-7 px-7 py-3">Back home</Link>
    </main>
  );
}
