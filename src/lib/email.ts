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

type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  // Per-message overrides. replyTo lets the caller route replies to a
  // token-bearing inbound address (the email double opt-in). headers lets the
  // caller thread messages (Message-ID / References) so a follow-up lands in the
  // same conversation as the invite.
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
};

export type EmailSendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; retryable: boolean; error: string };

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  headers,
  idempotencyKey,
}: SendArgs): Promise<EmailSendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Meet Cute <hello@meet-cute.app>";
  const isProd = process.env.NODE_ENV === "production";
  const toList = Array.isArray(to) ? to : [to];
  const toLabel = toList.join(", ");
  // Dev convenience: surface just the sign-in link to the server console so the
  // flow stays testable locally even when mail does not actually go out (no key,
  // or a send failure such as an unverified sender domain). Never in production.
  const logDevLink = () => {
    if (isProd) return;
    const link = (text || "").match(/https?:\/\/\S+/)?.[0] ?? "(no link)";
    console.log(`[email:dev] to=${toLabel} subject="${subject}" link=${link}`);
  };

  if (!key) {
    // In production a missing key is a misconfiguration: fail loudly, never
    // silently "succeed" (which would strand users without a link) and never
    // log the token-bearing link.
    if (process.env.NODE_ENV === "production") {
      console.error("[email] RESEND_API_KEY is not set; refusing to send in production");
      return { ok: false, retryable: false, error: "RESEND_API_KEY is not configured" };
    }
    // Dev only: surface just the sign-in link so the flow can be tested locally.
    logDevLink();
    return { ok: true, providerMessageId: "dev" };
  }

  // Reply-To a real inbox (improves deliverability vs a bare noreply) and a
  // List-Unsubscribe header, both of which lower spam scoring. A caller-supplied
  // replyTo (the token-bearing opt-in address) wins.
  const replyToAddr = replyTo || process.env.RESEND_REPLY_TO || "josh@shiftsupportnetwork.com";
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: toList,
        subject,
        html,
        text,
        reply_to: replyToAddr,
        headers: { "List-Unsubscribe": `<mailto:${replyToAddr}>`, ...(headers || {}) },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend ${res.status}: ${body.slice(0, 300)}`);
      logDevLink();
      return {
        ok: false,
        retryable: res.status === 429 || res.status >= 500,
        error: `Resend returned ${res.status}`,
      };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: unknown };
    return {
      ok: true,
      ...(typeof body.id === "string" ? { providerMessageId: body.id } : {}),
    };
  } catch (e) {
    console.error(`[email] send failed: ${(e as Error).message}`);
    logDevLink();
    return { ok: false, retryable: true, error: (e as Error).message };
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
  city?: string | null;
  note?: string | null;
}): { subject: string; html: string; text: string } {
  const first = (args.toName || "there").split(" ")[0];
  const otherFirst = (args.otherName || "your match").split(" ")[0];
  const subject = `You and ${otherFirst} both said yes`;

  const reach: string[] = [];
  if (args.otherEmail) reach.push(`Email: ${args.otherEmail}`);
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

// First email of the double opt-in. Sent to ONE person when a match is made. It
// names the other person, links to a token-gated page showing their profile with
// Yes/Pass buttons, and invites a plain "Y"/"N" reply (the reply address carries
// the same token, so the inbound webhook maps the reply back to this exact
// invite). No contact info is shared yet: that only happens if BOTH say yes.
export function matchInviteEmail(args: {
  toName: string;
  otherName: string;
  otherHeadline?: string | null;
  city?: string | null;
  profileUrl: string;
}): { subject: string; html: string; text: string } {
  const first = (args.toName || "there").split(" ")[0];
  const otherFirst = (args.otherName || "someone").split(" ")[0];
  const subject = `You've been matched with ${otherFirst}`;
  const headline = args.otherHeadline?.trim() ? args.otherHeadline.trim() : null;

  const text =
    `Hi ${first},\n\n` +
    `We think you and ${otherFirst}${args.city ? ` in ${args.city}` : ""} could hit it off.\n\n` +
    (headline ? `${otherFirst}: "${headline}"\n\n` : "") +
    `See ${otherFirst}'s profile and decide:\n${args.profileUrl}\n\n` +
    `Want the introduction? Just reply Y (yes) or N (no) to this email, or use the buttons on the page.\n\n` +
    `If you both say yes, we'll connect you. If either passes, nothing happens and no one is told.\n\n` +
    `Warmly,\nMeet Cute`;

  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#382a20">
    <h1 style="font-size:22px;font-weight:500;color:#d76a45">Meet Cute</h1>
    <p style="font-size:15px;line-height:1.6">Hi ${esc(first)}, we think you and <strong>${esc(otherFirst)}</strong>${args.city ? ` in ${esc(args.city)}` : ""} could hit it off.</p>
    ${headline ? `<p style="margin:12px 0;padding:12px 16px;border-left:3px solid #d76a45;font-size:15px;font-style:italic;color:#5c4f45">&ldquo;${esc(headline)}&rdquo;</p>` : ""}
    <p style="margin:20px 0">
      <a href="${encodeURI(args.profileUrl)}" style="background:#d76a45;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px">See ${esc(otherFirst)}&rsquo;s profile &amp; decide</a>
    </p>
    <p style="font-size:15px;line-height:1.6">Want the introduction? <strong>Reply Y</strong> for yes or <strong>N</strong> to pass, or use the buttons on the page.</p>
    <p style="font-size:13px;line-height:1.6;color:#8a817c">If you both say yes, we&rsquo;ll connect you. If either passes, nothing happens and no one is told.</p>
  </div>`;
  return { subject, html, text };
}

// Second email of the double opt-in, sent to BOTH people at once (a single send
// with both on the To line) the moment the match goes mutual. Because it is one
// message to both, it is literally the same email thread: either can reply-all
// and they are talking directly. No brokering of private numbers needed.
export function matchThreadEmail(args: {
  aName: string;
  bName: string;
  city?: string | null;
}): { subject: string; html: string; text: string } {
  const aFirst = (args.aName || "there").split(" ")[0];
  const bFirst = (args.bName || "there").split(" ")[0];
  const subject = `${aFirst} + ${bFirst}: you both said yes`;

  const text =
    `Hi ${aFirst} and ${bFirst},\n\n` +
    `You both said yes to an introduction${args.city ? ` in ${args.city}` : ""}, so here you are on one thread.\n\n` +
    `Just hit reply-all to say hello and find a time this week. A short first message goes a long way.\n\n` +
    `Warmly,\nMeet Cute`;

  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#382a20">
    <h1 style="font-size:22px;font-weight:500;color:#d76a45">Meet Cute</h1>
    <p style="font-size:15px;line-height:1.6">Hi <strong>${esc(aFirst)}</strong> and <strong>${esc(bFirst)}</strong>: you both said yes to an introduction${args.city ? ` in ${esc(args.city)}` : ""}, so here you are on one thread.</p>
    <p style="font-size:15px;line-height:1.6">Just hit <strong>reply-all</strong> to say hello and find a time this week. A short first message goes a long way.</p>
    <p style="font-size:12px;color:#8a817c">Warmly, Meet Cute. Reply any time if you would like a hand.</p>
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
