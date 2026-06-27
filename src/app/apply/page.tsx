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
  // 18+ gate computed at render time so the max date never goes stale.
  const today = new Date();
  const maxBirthdate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
    .toISOString()
    .slice(0, 10);
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
              <label className="label" htmlFor="phone">Mobile number</label>
              <input id="phone" className="field mt-1.5" name="phone" type="tel" required autoComplete="tel" defaultValue={me.phone ?? ""} placeholder="(555) 123-4567" />
              <p className="mt-1 text-xs text-muted">Your matchmaker texts introductions here. Reply Y to opt in.</p>
            </div>
            <div>
              <label className="label" htmlFor="city">City</label>
              <select id="city" className="field mt-1.5" name="city" defaultValue={me.city === "SF" ? "SF" : "NYC"}>
                <option value="NYC">New York</option>
                <option value="SF">San Francisco</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="birthdate">Date of birth</label>
            <input id="birthdate" className="field mt-1.5" name="birthdate" type="date" required max={maxBirthdate} />
            <p className="mt-1 text-xs text-muted">You must be 18 or older to join.</p>
          </div>
          <div>
            <label className="label" htmlFor="lookingFor">What are you looking for?</label>
            <textarea
              id="lookingFor"
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
      <label className="label" htmlFor={name}>{label}</label>
      <input
        id={name}
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
