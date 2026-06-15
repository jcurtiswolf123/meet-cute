import Link from "next/link";
import { Logo } from "@/components/ui";

export default function Apply() {
  return (
    <main className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mx-auto mt-10 max-w-xl">
        <p className="label mb-3">Application</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Tell us about you.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          We read every application by hand. We accept a fraction of them. If a member referred you,
          add their code and you will skip the queue.
        </p>

        <form className="mt-8 space-y-5" action="/apply/thanks">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" name="first" />
            <Field label="Last name" name="last" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" name="email" type="email" />
            <div>
              <label className="label">City</label>
              <select className="field mt-1.5" name="city">
                <option>New York</option>
                <option>San Francisco</option>
              </select>
            </div>
          </div>
          <Field label="Referral code (optional)" name="code" placeholder="MC-XXXX-0000" />
          <div>
            <label className="label">What are you looking for?</label>
            <textarea className="field mt-1.5 min-h-28" name="lookingFor" placeholder="Be honest. The more specific, the better the introductions." />
          </div>
          <button className="btn-primary w-full py-3" type="submit">Submit application</button>
          <p className="text-center text-xs text-muted">
            Already a member? <Link href="/login" className="text-claret underline">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({ label, name, type = "text", placeholder }: { label: string; name: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-1.5" name={name} type={type} placeholder={placeholder} />
    </div>
  );
}
