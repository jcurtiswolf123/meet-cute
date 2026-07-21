// Transactional email via Resend's HTTP API (no SDK dependency).
//
// Degrades gracefully: with no RESEND_API_KEY (local dev), it logs the message
// to the server console and returns ok, so the magic-link flow is testable
// without sending real mail. Set RESEND_API_KEY + RESEND_FROM in production.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Escape untrusted values before interpolating them into email HTML. Names,
// emails, phones, and free-text notes are member-supplied, so an unescaped
// interpolation would let one member inject markup into another's inbox.
function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type SendArgs = { to: string; subject: string; html: string; text?: string };

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Meet Cute <hello@meet-cute.app>";
  const isProd = process.env.NODE_ENV === "production";
  // Dev convenience: surface just the sign-in link to the server console so the
  // flow stays testable locally even when mail does not actually go out (no key,
  // or a send failure such as an unverified sender domain). Never in production.
  const logDevLink = () => {
    if (isProd) return;
    const link = (text || "").match(/https?:\/\/\S+/)?.[0] ?? "(no link)";
    console.log(`[email:dev] to=${to} subject="${subject}" link=${link}`);
  };

  if (!key) {
    // In production a missing key is a misconfiguration: fail loudly, never
    // silently "succeed" (which would strand users without a link) and never
    // log the token-bearing link.
    if (process.env.NODE_ENV === "production") {
      console.error("[email] RESEND_API_KEY is not set; refusing to send in production");
      return { ok: false };
    }
    // Dev only: surface just the sign-in link so the flow can be tested locally.
    logDevLink();
    return { ok: true };
  }

  // Reply-To a real inbox (improves deliverability vs a bare noreply) and a
  // List-Unsubscribe header, both of which lower spam scoring.
  const replyTo = process.env.RESEND_REPLY_TO || "josh@shiftsupportnetwork.com";
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        text,
        reply_to: replyTo,
        headers: { "List-Unsubscribe": `<mailto:${replyTo}>` },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend ${res.status}: ${body.slice(0, 300)}`);
      logDevLink();
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[email] send failed: ${(e as Error).message}`);
    logDevLink();
    return { ok: false };
  }
}

export function eventInviteEmail(args: {
  name: string;
  theme: string;
  city: string;
  venue: string;
  when: string; // human-readable date/time
  link: string;
}): { subject: string; html: string; text: string } {
  const { name, theme, city, venue, when, link } = args;
  const first = name.split(" ")[0];
  const subject = `You're invited: ${theme} (${city})`;
  const text = `Hi ${first},\n\nYou're invited to a Meet Cute dinner.\n\n${theme}\n${when}\n${venue}, ${city}\n\nSign in to see details: ${link}\n\nReply to this email to RSVP or with any questions.`;
  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#2a2320">
    <h1 style="font-size:22px;font-weight:500;color:#7a1f2b">Meet Cute</h1>
    <p style="font-size:15px;line-height:1.6">Hi ${esc(first)}, you're invited to a Meet Cute dinner.</p>
    <div style="margin:16px 0;padding:16px;border:1px solid #ece6df;border-radius:12px">
      <p style="margin:0;font-size:18px;font-weight:500">${esc(theme)}</p>
      <p style="margin:6px 0 0;font-size:14px;color:#6b625c">${esc(when)}</p>
      <p style="margin:2px 0 0;font-size:14px;color:#6b625c">${esc(venue)}, ${esc(city)}</p>
    </div>
    <p style="margin:24px 0">
      <a href="${encodeURI(link)}" style="background:#7a1f2b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px">View &amp; RSVP</a>
    </p>
    <p style="font-size:12px;color:#8a817c">Reply to this email to RSVP or with any questions.</p>
  </div>`;
  return { subject, html, text };
}

// Warm introduction email sent to BOTH people the moment a match becomes mutual.
// It hands each person the other's name and a way to reach them (their email,
// which is the baseline channel; phone only if that person opted in to SMS), so
// two people who said yes are actually connected even with no texting at all.
export function connectionEmail(args: {
  toName: string;
  otherName: string;
  otherEmail?: string | null;
  otherPhone?: string | null;
  city?: string | null;
  note?: string | null;
}): { subject: string; html: string; text: string } {
  const first = (args.toName || "there").split(" ")[0];
  const otherFirst = (args.otherName || "your match").split(" ")[0];
  const subject = `You and ${otherFirst} both said yes`;

  const reach: string[] = [];
  if (args.otherEmail) reach.push(`Email: ${args.otherEmail}`);
  if (args.otherPhone) reach.push(`Text: ${args.otherPhone}`);
  const reachText = reach.length ? reach.join("\n") : "Just reply to this email and we will pass it along.";

  const note = args.note?.trim()
    ? args.note.trim()
    : `Say hello, find a time this week, and keep it easy. A short first message goes a long way.`;

  const text =
    `Hi ${first},\n\n` +
    `Good news: you and ${otherFirst} both said yes to an introduction${args.city ? ` in ${args.city}` : ""}.\n\n` +
    `Here is how to reach ${otherFirst}:\n${reachText}\n\n` +
    `${note}\n\n` +
    `Warmly,\nMeet Cute\n\n` +
    `Reply to this email any time if you would like a hand.`;

  // Build the contact rows from escaped labels + escaped values so a member's
  // own email/phone string cannot smuggle markup into the recipient's inbox.
  const reachRows: string[] = [];
  if (args.otherEmail)
    reachRows.push(
      `<p style="margin:2px 0;font-size:14px;color:#382a20"><span style="color:#7d6f62">Email</span> ${esc(args.otherEmail)}</p>`,
    );
  if (args.otherPhone)
    reachRows.push(
      `<p style="margin:2px 0;font-size:14px;color:#382a20"><span style="color:#7d6f62">Text</span> ${esc(args.otherPhone)}</p>`,
    );
  const reachHtml = reachRows.length
    ? reachRows.join("")
    : `<p style="margin:2px 0;font-size:14px;color:#7d6f62">Just reply to this email and we will pass it along.</p>`;

  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#382a20">
    <h1 style="font-size:22px;font-weight:500;color:#d76a45">Meet Cute</h1>
    <p style="font-size:15px;line-height:1.6">Hi ${esc(first)}, you and <strong>${esc(otherFirst)}</strong> both said yes to an introduction${args.city ? ` in ${esc(args.city)}` : ""}.</p>
    <div style="margin:16px 0;padding:16px;border:1px solid #ecdcc7;border-radius:12px;background:#fffdf8">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7d6f62">How to reach ${esc(otherFirst)}</p>
      ${reachHtml}
    </div>
    <p style="font-size:15px;line-height:1.6;color:#382a20">${esc(note)}</p>
    <p style="font-size:12px;color:#8a817c">Warmly, Meet Cute. Reply to this email any time if you would like a hand.</p>
  </div>`;
  return { subject, html, text };
}

export function magicLinkEmail(link: string): { subject: string; html: string; text: string } {
  const subject = "Your Meet Cute sign-in link";
  const text = `Sign in to Meet Cute:\n${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.`;
  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#2a2320">
    <h1 style="font-size:22px;font-weight:500;color:#7a1f2b">Meet Cute</h1>
    <p style="font-size:15px;line-height:1.6">Tap to sign in. This link expires in 15 minutes and can be used once.</p>
    <p style="margin:24px 0">
      <a href="${encodeURI(link)}" style="background:#7a1f2b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px">Sign in to Meet Cute</a>
    </p>
    <p style="font-size:12px;color:#8a817c">If you did not request this, ignore this email.</p>
  </div>`;
  return { subject, html, text };
}
