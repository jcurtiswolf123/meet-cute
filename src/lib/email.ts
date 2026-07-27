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

// --- Brand shell -------------------------------------------------------------
//
// One consistent, restrained wrapper for every transactional email so they read
// like the site (quiet members club) rather than four different templates. Email
// clients ignore external fonts, so we use a serif stack for display and a sans
// stack for controls, and the DESIGN.md palette (cream canvas, ink text, oxblood
// accent). No gradients, no images, one accent.
const BRAND = {
  cream: "#f4f1ea",
  paper: "#ece7dd",
  ink: "#171714",
  muted: "#67635d",
  line: "#d9d3c8",
  oxblood: "#762d38",
} as const;

const SERIF = "'Iowan Old Style', Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function emailButton(label: string, href: string): string {
  return `<a href="${encodeURI(href)}" style="display:inline-block;background:${BRAND.ink};color:${BRAND.cream};text-decoration:none;padding:13px 22px;border-radius:999px;font-family:${SANS};font-size:14px;font-weight:600;letter-spacing:.01em">${esc(label)}</a>`;
}

/** Wrap body HTML in the Meet Cute email shell. `inner` is trusted, pre-escaped
 *  HTML produced by the caller. `preheader` is the hidden inbox-preview line. */
function emailShell(inner: string, preheader = ""): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.cream}">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${BRAND.cream}">
        <tr><td style="padding:4px 4px 20px">
          <span style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink}">Meet&nbsp;Cute</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:14px;padding:32px">
          ${inner}
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.muted}">
          Private matchmaking in New York and San Francisco.<br/>
          Reply to this email any time - a person reads it.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${SERIF};font-size:28px;font-weight:400;line-height:1.15;letter-spacing:-0.01em;color:${BRAND.ink}">${esc(text)}</h1>`;
}
function p(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.65;color:${BRAND.ink}">${text}</p>`;
}
function small(text: string): string {
  return `<p style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${BRAND.muted}">${text}</p>`;
}

// Sent the moment an application is submitted. Reassures the applicant a real
// person will read it - no dashboards, no instant "you're in".
export function applicationReceivedEmail(args: {
  name: string;
  city?: string | null;
}): { subject: string; html: string; text: string } {
  const first = (args.name || "there").split(" ")[0];
  const place = args.city === "SF" ? "San Francisco" : args.city === "NYC" ? "New York" : null;
  const subject = "We have your application";
  const text =
    `Hi ${first},\n\n` +
    `Thank you for applying to Meet Cute${place ? ` in ${place}` : ""}. A matchmaker reads every application by hand, so this takes a little time - that is on purpose.\n\n` +
    `If it is a fit, we will be in touch to welcome you onto the roster and start making introductions. Either way, you will hear from a person, not a form.\n\n` +
    `Warmly,\nMeet Cute`;
  const inner =
    h1("Thank you for applying.") +
    p(`Hi ${esc(first)}, we have your application${place ? ` in ${esc(place)}` : ""}. A matchmaker reads every one by hand, so this takes a little time - that is on purpose.`) +
    p(`If it is a fit, we will be in touch to welcome you and start making introductions. Either way, you will hear from a person, not a form.`) +
    small("You do not need to do anything else right now.");
  return { subject, html: emailShell(inner, "A matchmaker reads every application by hand."), text };
}

// Sent when an operator approves an applicant onto the roster. This is the
// "welcome, you'll start getting matches" moment.
export function applicationApprovedEmail(args: {
  name: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const first = (args.name || "there").split(" ")[0];
  const subject = "You're in - welcome to Meet Cute";
  const text =
    `Hi ${first},\n\n` +
    `Good news: you have been accepted onto the Meet Cute roster. Welcome.\n\n` +
    `From here, a matchmaker introduces you to one person at a time - no public profile, no feed, no endless messaging. When we find someone worth meeting, you will get a private introduction by email and decide for yourself.\n\n` +
    `Take a minute to round out your profile and tell us what you are looking for:\n${args.appUrl}\n\n` +
    `Warmly,\nMeet Cute`;
  const inner =
    h1("Welcome to Meet Cute.") +
    p(`Hi ${esc(first)}, you have been accepted onto the roster. From here a matchmaker introduces you to <strong>one person at a time</strong> - no public profile, no feed, no endless messaging.`) +
    p(`When we find someone worth meeting, you will get a private introduction by email and decide for yourself. If you both say yes, we connect you.`) +
    `<p style="margin:24px 0 0">${emailButton("Round out your profile", args.appUrl)}</p>` +
    small("The more we know about what you are looking for, the better the introductions.");
  return { subject, html: emailShell(inner, "You've been accepted onto the roster."), text };
}

// A gentle nudge sent to one side of a connected match who hasn't taken it
// offline yet: "reminder to meet".
export function matchReminderEmail(args: {
  toName: string;
  otherName: string;
  city?: string | null;
}): { subject: string; html: string; text: string } {
  const first = (args.toName || "there").split(" ")[0];
  const otherFirst = (args.otherName || "your match").split(" ")[0];
  const subject = `A nudge: find a time with ${otherFirst}`;
  const text =
    `Hi ${first},\n\n` +
    `Just a friendly nudge - you and ${otherFirst} both said yes${args.city ? ` in ${args.city}` : ""}, and the best introductions turn into a plan while they are still warm.\n\n` +
    `Reply to your intro thread with a day and place this week. A short first message goes a long way.\n\n` +
    `Rooting for you,\nMeet Cute`;
  const inner =
    h1("Don't let this one cool off.") +
    p(`Hi ${esc(first)}, you and <strong>${esc(otherFirst)}</strong> both said yes${args.city ? ` in ${esc(args.city)}` : ""}. The best introductions turn into a plan while they are still warm.`) +
    p(`Reply to your introduction thread with a day and a place this week - a short first message goes a long way.`) +
    small("Want us to help pick a spot? Just reply and ask.");
  return { subject, html: emailShell(inner, `You and ${otherFirst} still haven't set a time.`), text };
}

// Post-connection check-in: "how was your Meet Cute?" Their reply becomes
// feedback the matchmaker can act on.
export function matchFeedbackEmail(args: {
  toName: string;
  otherName: string;
}): { subject: string; html: string; text: string } {
  const first = (args.toName || "there").split(" ")[0];
  const otherFirst = (args.otherName || "your match").split(" ")[0];
  const subject = `How was your Meet Cute with ${otherFirst}?`;
  const text =
    `Hi ${first},\n\n` +
    `How did it go with ${otherFirst}? A sentence is plenty - did you meet, did you click, should we keep going or try someone new?\n\n` +
    `Just reply to this email. It helps us make your next introduction a better one.\n\n` +
    `Warmly,\nMeet Cute`;
  const inner =
    h1(`How was ${esc(otherFirst)}?`) +
    p(`Hi ${esc(first)}, how did it go with <strong>${esc(otherFirst)}</strong>? A sentence is plenty - did you meet, did you click, should we keep going or try someone new?`) +
    p(`Just reply to this email. Whatever you say stays between us and makes your next introduction a better one.`);
  return { subject, html: emailShell(inner, `Tell us how it went with ${otherFirst}.`), text };
}

// Sent to the operator inbox when someone requests a dinner seat or coaching
// from the public site. Keeps intake in one place until a real CRM is wired.
export function operatorLeadEmail(args: {
  kind: "dinner" | "coaching";
  name: string;
  email: string;
  detail: string;
  context?: string | null;
}): { subject: string; html: string; text: string } {
  const label = args.kind === "dinner" ? "Dinner seat request" : "Coaching request";
  const subject = `${label}: ${args.name}`;
  const lines = [
    `${label}`,
    `Name: ${args.name}`,
    `Email: ${args.email}`,
    args.context ? `For: ${args.context}` : "",
    args.detail ? `Note: ${args.detail}` : "",
  ].filter(Boolean);
  const text = lines.join("\n");
  const inner =
    h1(label) +
    p(`<strong>${esc(args.name)}</strong> &lt;${esc(args.email)}&gt;`) +
    (args.context ? p(`For: ${esc(args.context)}`) : "") +
    (args.detail ? p(esc(args.detail)) : "") +
    small("Reply directly to reach them.");
  return { subject, html: emailShell(inner), text };
}

// Confirmation sent to a member/applicant after they request a dinner seat or
// coaching, so the public action doesn't feel like a dead end.
export function requestReceivedEmail(args: {
  name: string;
  kind: "dinner" | "coaching";
  context?: string | null;
}): { subject: string; html: string; text: string } {
  const first = (args.name || "there").split(" ")[0];
  const thing =
    args.kind === "dinner"
      ? `a seat at ${args.context ? args.context : "an upcoming Meet Cute dinner"}`
      : "Meet Cute coaching";
  const subject = args.kind === "dinner" ? "Your dinner request is in" : "Your coaching request is in";
  const text =
    `Hi ${first},\n\n` +
    `Thanks - we have your request for ${thing}. A matchmaker will follow up personally with next steps.\n\n` +
    `Warmly,\nMeet Cute`;
  const inner =
    h1("We have your request.") +
    p(`Hi ${esc(first)}, thanks for asking about ${esc(thing)}. A matchmaker will follow up personally with next steps.`) +
    small("Questions in the meantime? Just reply.");
  return { subject, html: emailShell(inner), text };
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
  const inner =
    h1("You're invited to dinner.") +
    p(`Hi ${esc(first)}, a seat has opened at a Meet Cute dinner.`) +
    `<div style="margin:16px 0;padding:16px;border:1px solid ${BRAND.line};border-radius:12px;background:${BRAND.cream}">
      <p style="margin:0;font-family:${SERIF};font-size:18px;color:${BRAND.ink}">${esc(theme)}</p>
      <p style="margin:6px 0 0;font-family:${SANS};font-size:14px;color:${BRAND.muted}">${esc(when)}</p>
      <p style="margin:2px 0 0;font-family:${SANS};font-size:14px;color:${BRAND.muted}">${esc(venue)}, ${esc(city)}</p>
    </div>` +
    `<p style="margin:24px 0 0">${emailButton("View & RSVP", link)}</p>` +
    small("Reply to this email to RSVP or with any questions.");
  return { subject, html: emailShell(inner, `${theme} - ${when}`), text };
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
      `<p style="margin:2px 0;font-family:${SANS};font-size:14px;color:${BRAND.ink}"><span style="color:${BRAND.muted}">Email</span> ${esc(args.otherEmail)}</p>`,
    );
  const reachHtml = reachRows.length
    ? reachRows.join("")
    : `<p style="margin:2px 0;font-family:${SANS};font-size:14px;color:${BRAND.muted}">Just reply to this email and we will pass it along.</p>`;

  const inner =
    h1(`You and ${esc(otherFirst)} said yes.`) +
    p(`Hi ${esc(first)}, you and <strong>${esc(otherFirst)}</strong> both said yes to an introduction${args.city ? ` in ${esc(args.city)}` : ""}.`) +
    `<div style="margin:16px 0;padding:16px;border:1px solid ${BRAND.line};border-radius:12px;background:${BRAND.cream}">
      <p style="margin:0 0 6px;font-family:${SANS};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.muted}">How to reach ${esc(otherFirst)}</p>
      ${reachHtml}
    </div>` +
    p(esc(note)) +
    small("Reply to this email any time if you would like a hand.");
  return { subject, html: emailShell(inner, `Here's how to reach ${otherFirst}.`), text };
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

  const inner =
    h1(`Meet ${esc(otherFirst)}.`) +
    p(`Hi ${esc(first)}, we think you and <strong>${esc(otherFirst)}</strong>${args.city ? ` in ${esc(args.city)}` : ""} could hit it off.`) +
    (headline
      ? `<p style="margin:12px 0;padding:12px 16px;border-left:2px solid ${BRAND.oxblood};font-family:${SERIF};font-size:16px;font-style:italic;color:${BRAND.muted}">&ldquo;${esc(headline)}&rdquo;</p>`
      : "") +
    `<p style="margin:22px 0">${emailButton(`See ${otherFirst}'s profile & decide`, args.profileUrl)}</p>` +
    p(`Want the introduction? <strong>Reply Y</strong> for yes or <strong>N</strong> to pass, or use the buttons on the page.`) +
    small("If you both say yes, we'll connect you. If either passes, nothing happens and no one is told.");
  return { subject, html: emailShell(inner, `An introduction to ${otherFirst}.`), text };
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

  const inner =
    h1("You both said yes.") +
    p(`Hi <strong>${esc(aFirst)}</strong> and <strong>${esc(bFirst)}</strong> - you both said yes to an introduction${args.city ? ` in ${esc(args.city)}` : ""}, so here you are on one thread.`) +
    p(`Just hit <strong>reply-all</strong> to say hello and find a time this week. A short first message goes a long way.`) +
    small("Reply any time if you would like a hand.");
  return { subject, html: emailShell(inner, `${aFirst} and ${bFirst}, meet each other.`), text };
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
