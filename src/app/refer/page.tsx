import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getCurrentPerson } from "@/lib/auth";
import { NOMINATION_NOTE_MIN } from "@/lib/nominations";
import { ReferForm } from "./ReferForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Recommend someone",
  description: "Put a friend forward for Mutuals. We write to them once, and say it came from you.",
};

// The referral, going the other way.
//
// Everything else in this product starts with somebody applying and then being
// vouched for. The thing people say first, unprompted, is "you should meet my
// friend" - and until 2026-08-06 there was nowhere on the site to say it.
export default async function Refer() {
  const me = await getCurrentPerson();

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="container-mc min-h-screen py-12 md:py-20">
        <div className="max-w-[62ch]">
          <p className="public-label text-muted">Recommend someone</p>
          <h1 className="mt-5 font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-6xl">
            Know somebody worth meeting?
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted">
            Put them forward. We write to them once, say it came from you, and quote what you wrote.
            They decide from there, and if they are not interested they never hear from us again.
          </p>
        </div>

        <ReferForm
          me={me && me.email ? { name: me.name, email: me.email } : null}
          noteMin={NOMINATION_NOTE_MIN}
        />

        <div className="mt-16 max-w-[62ch] border-t border-line pt-8">
          <h2 className="font-display text-2xl">What happens to them</h2>
          <p className="mt-3 text-base leading-7 text-muted">
            A matchmaker introduces them to one person at a time, by email, and they decide for
            themselves. Getting in takes two friends who will say something about them, which is the
            whole review. What you write here is one of the two, so the friend you put forward only
            has to ask one person of their own.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
