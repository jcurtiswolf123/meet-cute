import Link from "next/link";
import { Logo } from "@/components/ui";
import { getCurrentPerson } from "@/lib/auth";
import { completeApplication, requestMagicLink } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Apply() {
  const me = await getCurrentPerson();

  // Not signed in yet: collect an email and send a magic link to begin.
  if (!me) {
    return (
      <main className="container-mc min-h-screen py-12">
        <Logo />
        <div className="mx-auto mt-10 max-w-xl">
          <p className="label mb-3">Application</p>
          <h1 className="font-display text-4xl font-medium tracking-tight">Start your application.</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Enter your email and we will send a one-time link to begin. We read every application by
            hand and accept a fraction of them.
          </p>
          <form action={requestMagicLink} className="mt-8 space-y-3">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="field mt-1.5" placeholder="you@email.com" />
            <button className="btn-primary w-full py-3" type="submit">
              Send me a link
            </button>
            <p className="text-center text-xs text-muted">
              Already a member?{" "}
              <Link href="/login" className="text-claret underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </main>
    );
  }

  // Signed in: complete the application (name, age, city, what you want, consent).
  const [first = "", last = ""] = (me.name || "").split(" ");
  return (
    <main className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mx-auto mt-10 max-w-xl">
        <p className="label mb-3">Application</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Tell us about you.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Signed in as {me.email}. The more specific you are, the better the introductions.
        </p>

        <form className="mt-8 space-y-5" action={completeApplication}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" name="first" defaultValue={first} required />
            <Field label="Last name" name="last" defaultValue={last} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Date of birth</label>
              <input className="field mt-1.5" name="birthdate" type="date" required max="2008-01-01" />
              <p className="mt-1 text-xs text-muted">You must be 18 or older to join.</p>
            </div>
            <div>
              <label className="label">City</label>
              <select className="field mt-1.5" name="city" defaultValue={me.city === "SF" ? "San Francisco" : "New York"}>
                <option>New York</option>
                <option>San Francisco</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">What are you looking for?</label>
            <textarea
              className="field mt-1.5 min-h-28"
              name="lookingFor"
              defaultValue={me.lookingFor ?? ""}
              placeholder="Be honest. The more specific, the better the introductions."
            />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="agree" required className="mt-1" />
            <span className="text-muted">
              I am 18 or older and I agree to the{" "}
              <Link href="/terms" className="text-claret underline" target="_blank">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-claret underline" target="_blank">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          <button className="btn-primary w-full py-3" type="submit">
            Submit application
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="field mt-1.5"
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
      />
    </div>
  );
}
