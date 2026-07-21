import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "Privacy Policy | Meet Cute" };

export default function Privacy() {
  return (
    <main className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mx-auto mt-10 max-w-2xl">
        <Link href="/" className="text-sm text-claret underline">
          ← Back to home
        </Link>

        <p className="label mt-8 mb-3">Privacy</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted">Last updated: 2026-07-16</p>

        <p className="mt-6 text-sm leading-relaxed text-muted">
          Meet Cute is a curated, invitation-only matchmaking service. To introduce you to people
          you might actually want to date, we collect and use personal information. This policy
          explains what we collect, why we collect it, who we share it with, how long we keep it,
          and the choices and rights you have. We have written it to be read, not to be skipped.
        </p>

        <Section title="1. Who we are">
          <p>
            Meet Cute (&quot;Meet Cute,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
            operates the Meet Cute matchmaking service and website. If you have a question about your
            data or this policy, contact us using the details in the Contact section below.
          </p>
        </Section>

        <Section title="2. The data we collect">
          <p>We collect the following categories of personal information:</p>
          <List
            items={[
              "Account data: your name, email address, password (stored as a secure hash, never in plain text), and the city you join under.",
              "Profile data: the details you add to your profile, including the things you are looking for in a partner, relationship goals, lifestyle notes, and any free-text you choose to share with us.",
              "Photos: images you upload to your profile. Photos can reveal your appearance and, in some cases, locations or other people, so treat them as sensitive.",
              "Age and birthdate: your date of birth or age, which we use to confirm you are at least 18 and to make age-appropriate introductions.",
              "Location data: the city or area you live in or want to date in. We do not collect precise GPS location unless you explicitly provide it.",
              "Dating preferences: the attributes, interests, and dealbreakers you tell us about, which our matchmakers and systems use to suggest introductions.",
              "Vouches from friends: when someone you know vouches for you, we collect what they submit about you, and we collect the references you provide for others. Tell the people you list that you are sharing them with us.",
              "Usage data: how you interact with the service, including pages viewed, introductions you accept or pass on, messages and scheduling activity, device and browser type, and approximate location derived from your IP address.",
              "Communications: messages you send to our team, your matchmaker, or support, and records of bookings the concierge arranges for you.",
            ]}
          />
          <p>
            Some of this information, such as photos and details that may reveal aspects of your
            personal life, can be sensitive. We handle it accordingly and ask you to share only what
            you are comfortable sharing.
          </p>
        </Section>

        <Section title="3. How we use your data">
          <List
            items={[
              "Matchmaking: to build your profile, suggest introductions, and let our human matchmakers curate matches for you. This is the core of the service.",
              "Concierge booking: to arrange dates, reservations, and logistics on your behalf when you ask us to.",
              "Safety and trust: to verify accounts, review vouches, screen for fake or abusive profiles, investigate reports, and keep members safe.",
              "Service operation: to run, maintain, secure, and improve the product, and to provide customer support.",
              "Communications: to send you introductions, scheduling details, account notices, and, where permitted, occasional updates about the service. You can opt out of non-essential messages.",
              "Legal and compliance: to comply with applicable law, enforce our Terms of Service, and protect our rights and the rights of our members.",
            ]}
          />
          <p>We do not use your data to train external advertising profiles, and we do not sell it.</p>
        </Section>

        <Section title="4. Legal bases for processing">
          <p>
            Where data-protection laws such as the GDPR or similar frameworks apply, we rely on these
            legal bases:
          </p>
          <List
            items={[
              "Contract: to provide the matchmaking and concierge service you signed up for.",
              "Consent: for optional features and any sensitive data you choose to share, such as certain profile details and photos. You can withdraw consent at any time.",
              "Legitimate interests: to keep the service safe, prevent fraud and abuse, and improve the product, balanced against your rights.",
              "Legal obligation: to meet our legal and regulatory duties.",
            ]}
          />
        </Section>

        <Section title="5. How we share your data">
          <p>
            We share information only as needed to run the service. We do not sell your personal
            information.
          </p>
          <List
            items={[
              "Other members: when you accept an introduction, we share the relevant parts of your profile with the person you are introduced to, and theirs with you. We do not reveal your contact details until you choose to share them.",
              "Service providers: trusted vendors who process data on our behalf under contract, such as cloud hosting and storage, email and SMS delivery, payment processing, error monitoring, and AI tools we use to help organize profiles and suggest matches. They may use your data only to provide their service to us.",
              "Safety and legal: parties involved in investigating reports or abuse, and authorities where we are legally required to disclose or where disclosure is needed to protect someone's safety.",
              "Business transfers: a successor entity if Meet Cute is involved in a merger, acquisition, or sale of assets, subject to this policy.",
            ]}
          />
          <p className="font-medium text-ink">We never sell your personal information.</p>
        </Section>

        <Section title="6. SMS, text messaging, and your mobile information">
          <p>
            Meet Cute sends text messages (SMS/MMS) as part of the service, such as introduction
            invites you can accept or decline, connection details once both people say yes, scheduling
            notes, and account notices. You provide your mobile number and agree to receive these
            messages when you apply or join, and you can opt out at any time.
          </p>
          <p className="font-medium text-ink">
            No mobile information (including your phone number and SMS opt-in or consent) will be
            shared with third parties or affiliates for marketing or promotional purposes. Text
            messaging originator opt-in data and consent are never shared with any third parties.
          </p>
          <p>
            The only parties that ever receive your mobile number are the vendors that deliver the
            messaging service to us (for example, our SMS provider), and only so they can send the
            messages you asked for on our behalf. They may not use it for their own or any marketing
            purpose.
          </p>
          <p>
            You are always in control: reply <span className="font-medium text-ink">STOP</span> to any
            message to opt out of further texts, and reply{" "}
            <span className="font-medium text-ink">HELP</span> for help. Message and data rates may
            apply. Message frequency varies with your introductions and activity.
          </p>
        </Section>

        <Section title="7. AI and automated tools">
          <p>
            We use software, including AI tools, to help organize profiles and surface possible
            matches. A human matchmaker remains involved in curating introductions. These tools act
            on the data described above and operate under contract; they do not receive your data for
            their own unrelated purposes.
          </p>
        </Section>

        <Section title="8. Data retention">
          <p>
            We keep your personal information for as long as your account is active and as long as we
            need it to provide the service. After you close your account, we delete or anonymize your
            data within a reasonable period, except where we must keep limited records to comply with
            legal obligations, resolve disputes, prevent abuse, or enforce our agreements. Vouches and
            references may be retained in aggregate or de-identified form for safety purposes.
          </p>
        </Section>

        <Section title="9. Security">
          <p>
            We protect your data with administrative, technical, and physical safeguards, including
            encryption in transit, hashed passwords, access controls, and limits on who on our team
            can view member data. No system is perfectly secure, so we cannot guarantee absolute
            security, but we work to protect your information and to notify you and the relevant
            authorities if a breach affecting your data occurs, as required by law.
          </p>
        </Section>

        <Section title="10. Your rights and choices">
          <p>Depending on where you live, you may have the right to:</p>
          <List
            items={[
              "Access the personal information we hold about you.",
              "Correct information that is inaccurate or incomplete.",
              "Delete your account and personal information.",
              "Export a copy of your data in a portable format.",
              "Object to or restrict certain processing, and withdraw consent where we rely on it.",
              "Opt out of non-essential communications at any time.",
            ]}
          />
          <p>
            To exercise any of these rights, use the tools in the app or contact us. We will respond
            within the timeframes required by applicable law. We will not discriminate against you for
            exercising your rights.
          </p>
        </Section>

        <Section title="11. Account and data deletion">
          <p>
            You can delete your account at any time from your account settings in the app. Deleting
            your account removes your profile from circulation and starts the deletion of your
            personal data, subject to the limited retention described above. You can also contact us
            and we will delete your data on your behalf.
          </p>
        </Section>

        <Section title="12. Age requirement">
          <p>
            Meet Cute is only for adults. You must be at least 18 years old to create an account or
            use the service. We do not knowingly collect personal information from anyone under 18. If
            we learn that we have collected data from someone under 18, we will delete it.
          </p>
        </Section>

        <Section title="13. Cookies and sessions">
          <p>
            We use cookies and similar technologies to keep you signed in, remember your preferences,
            keep the service secure, and understand how the product is used so we can improve it. You
            can control cookies through your browser settings, though some features may not work
            without them. We do not use cookies to build third-party advertising profiles.
          </p>
        </Section>

        <Section title="14. Changes to this policy">
          <p>
            We may update this policy as the service evolves or the law changes. When we make material
            changes, we will update the date above and, where appropriate, notify you in the app or by
            email. Your continued use of the service after an update means you accept the revised
            policy.
          </p>
        </Section>

        <Section title="15. Contact us">
          <p>
            Questions about your privacy or this policy? Email us at{" "}
            <a href="mailto:privacy@meetcute.com" className="text-claret underline">
              privacy@meetcute.com
            </a>
            . We read every message.
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
