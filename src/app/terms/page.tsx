import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "Terms of Service | Meet Cute" };

export default function Terms() {
  return (
    <main className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mx-auto mt-10 max-w-2xl">
        <Link href="/" className="text-sm text-claret underline">
          ← Back to home
        </Link>

        <div className="card mt-6 border-claret/30 bg-claret/5 px-5 py-4">
          <p className="text-sm font-medium text-claret">Draft for review.</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            This is not legal advice; have counsel review before launch.
          </p>
        </div>

        <p className="label mt-8 mb-3">Terms</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Terms of Service</h1>
        <p className="mt-3 text-sm text-muted">Last updated: 2026-06-15</p>

        <p className="mt-6 text-sm leading-relaxed text-muted">
          These Terms of Service (&quot;Terms&quot;) are an agreement between you and Meet Cute
          (&quot;Meet Cute,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). They govern
          your use of the Meet Cute matchmaking service and website. By creating an account or using
          the service, you agree to these Terms. If you do not agree, do not use the service.
        </p>

        <Section title="1. Eligibility">
          <p>
            You must be at least 18 years old to use Meet Cute. By using the service you confirm that
            you are 18 or older, that you are legally able to enter into this agreement, and that you
            are not barred from using the service under any applicable law. Meet Cute is an
            invitation-only, curated service, and acceptance of an application is at our discretion.
          </p>
        </Section>

        <Section title="2. Your account">
          <p>You are responsible for your account. That means:</p>
          <List
            items={[
              "Providing accurate, current, and complete information about yourself, and keeping it up to date.",
              "Keeping your login credentials confidential and not sharing your account with anyone.",
              "All activity that happens under your account.",
              "Notifying us promptly if you believe your account has been accessed without your permission.",
            ]}
          />
        </Section>

        <Section title="3. Acceptable use and prohibited conduct">
          <p>
            Meet Cute works only when members treat each other with respect. You agree that you will
            not:
          </p>
          <List
            items={[
              "Harass, threaten, intimidate, stalk, or abuse any member, our team, or anyone you are introduced to.",
              "Create fake, misleading, or impersonating profiles, use someone else's photos, or misrepresent your age, identity, intentions, or relationship status.",
              "Solicit money, donations, business, or commercial services from members, or use the service for advertising, recruiting, or any commercial purpose.",
              "Post or share content that is unlawful, hateful, discriminatory, sexually exploitative, or that infringes someone's rights.",
              "Share other members' personal information or private communications without their consent.",
              "Attempt to access accounts or data that are not yours, scrape the service, or interfere with its security or operation.",
              "Use the service to engage in any illegal activity or to facilitate trafficking, exploitation, or abuse of any kind.",
            ]}
          />
          <p>
            Violating these rules may result in removal of content, suspension, or permanent
            termination of your account, and we may report unlawful conduct to the authorities.
          </p>
        </Section>

        <Section title="4. The nature of the service">
          <p>
            Meet Cute is a matchmaking and concierge service. Our matchmakers and systems use the
            information you provide to suggest introductions, and our concierge can help arrange dates
            and logistics when you ask. We curate; we do not control who is a good fit, whether other
            members respond, or how any introduction turns out.
          </p>
        </Section>

        <Section title="5. No guarantee of matches or outcomes">
          <p>
            We do not promise that you will receive any particular number of introductions, that you
            will be matched at all, or that any introduction, date, or relationship will result. The
            service is provided on a reasonable-efforts basis. Outcomes depend on many factors outside
            our control, including the choices and conduct of other members.
          </p>
        </Section>

        <Section title="6. Safety disclaimer">
          <p>
            Meet Cute curates introductions, but we do not conduct criminal background checks on every
            member and we cannot verify everything a member tells us. We are not responsible for the
            conduct of any member or other person you meet through the service, whether online or in
            person.
          </p>
          <p>
            You are responsible for your own safety. Use good judgment, meet in public places, tell a
            friend where you are going, do not share financial information, and trust your instincts.
            If someone behaves inappropriately, report them to us. If you are in immediate danger,
            contact your local emergency services.
          </p>
        </Section>

        <Section title="7. Content, photos, and moderation">
          <p>
            You keep ownership of the content and photos you submit. By submitting them, you grant
            Meet Cute a non-exclusive, worldwide, royalty-free license to host, store, display, and
            use that content as needed to operate the service, including showing your profile to
            members you are introduced to. You confirm that you have the right to share the content
            you submit and that it does not infringe anyone else's rights.
          </p>
          <p>
            We may review, moderate, or remove content and may suspend or terminate accounts that
            violate these Terms or that we reasonably believe harm members or the service. We are not
            obligated to monitor content but may do so to keep the community safe.
          </p>
        </Section>

        <Section title="8. Termination">
          <p>
            You may stop using the service and delete your account at any time from your account
            settings. We may suspend or terminate your access if you violate these Terms, if your
            conduct puts members at risk, or as otherwise permitted by law. On termination, your right
            to use the service ends. Some provisions, including those on content licenses, disclaimers,
            and limitation of liability, survive termination.
          </p>
        </Section>

        <Section title="9. Disclaimers and limitation of liability">
          <p>
            The service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties
            of any kind, whether express or implied, to the fullest extent permitted by law. We do not
            warrant that the service will be uninterrupted, error-free, or that it will meet your
            expectations.
          </p>
          <p>
            To the fullest extent permitted by law, Meet Cute and its officers, employees, and
            partners will not be liable for any indirect, incidental, special, consequential, or
            punitive damages, or for any loss arising out of your use of the service, your
            interactions with other members, or any introduction, date, or relationship. Our total
            liability for any claim relating to the service will not exceed the amount you paid us in
            the twelve months before the claim arose, or one hundred dollars if you paid nothing. Some
            jurisdictions do not allow certain limitations, so some of these may not apply to you.
          </p>
        </Section>

        <Section title="10. Governing law">
          <p>
            These Terms are governed by the laws of [GOVERNING LAW JURISDICTION PLACEHOLDER], without
            regard to its conflict-of-laws rules. Any disputes will be resolved in the courts located
            in [VENUE PLACEHOLDER], unless applicable law requires otherwise. This section is a
            placeholder and must be completed by counsel before launch.
          </p>
        </Section>

        <Section title="11. Changes to these Terms">
          <p>
            We may update these Terms as the service evolves or the law changes. When we make material
            changes, we will update the date above and, where appropriate, notify you in the app or by
            email. Your continued use of the service after an update means you accept the revised
            Terms.
          </p>
        </Section>

        <Section title="12. Contact us">
          <p>
            Questions about these Terms? Email us at{" "}
            <a href="mailto:support@meetcute.com" className="text-claret underline">
              support@meetcute.com
            </a>
            . See also our{" "}
            <Link href="/privacy" className="text-claret underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <div className="mt-12 border-t border-line pt-6">
          <Link href="/" className="text-sm text-claret underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-medium tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-claret" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
