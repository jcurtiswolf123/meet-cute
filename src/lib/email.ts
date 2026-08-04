// Transactional email via Resend's HTTP API (no SDK dependency).
//
// Degrades gracefully: with no RESEND_API_KEY (local dev), it logs the message
// to the server console and returns ok, so the magic-link flow is testable
// without sending real mail. Set RESEND_API_KEY + RESEND_FROM in production.

import type { DateIdeas } from "./date-ideas";
import { dateIdeasBlock, type PickUrlFor } from "./email-date-ideas";

import { cityLabel } from "./cities";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** The addr-spec out of either `Name <user@host>` or a bare `user@host`.
 *  Headers such as List-Unsubscribe take the bare address, never the display
 *  form. Returns the input unchanged when there is no angle-bracketed address. */
export function bareAddress(address: string): string {
  return address.match(/<([^<>]+@[^<>]+)>/)?.[1]?.trim() ?? address.trim();
}

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
  /**
   * True only for mail sent to a list rather than to one person about their own
   * account. Bulk mail gets the List-Unsubscribe pair; nothing else does.
   *
   * This used to be unconditional, which is why match emails landed in
   * Promotions. List-Unsubscribe is how a sender tells Gmail "this is a
   * mailing", and Gmail files it accordingly. Putting it on a one-to-one
   * introduction, or on a sign-in link the recipient just asked for, is
   * declaring your transactional mail to be a newsletter. Gmail only requires
   * the header of senders above 5,000 messages a day, which this is nowhere
   * near.
   */
  bulk?: boolean;
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
  bulk = false,
}: SendArgs): Promise<EmailSendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Mutuals <hello@hellomutuals.com>";
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

  // Reply-To a real inbox, which reads as correspondence rather than a
  // broadcast. A caller-supplied replyTo (the token-bearing opt-in address)
  // wins.
  const replyToAddr = replyTo || process.env.RESEND_REPLY_TO || "josh@shiftsupportnetwork.com";
  // List-Unsubscribe takes a bare addr-spec. Interpolating replyToAddr directly
  // produced `<mailto:Mutuals <r+token@...>>` for every invite, which is not a
  // parseable header, and a malformed List-Unsubscribe counts against inbox
  // placement at Gmail rather than for it. It also pointed unsubscribe requests
  // at a single invite's token address. Unsubscribes go to a stable mailbox.
  const unsubscribeAddr = bareAddress(
    process.env.RESEND_UNSUBSCRIBE_TO || process.env.RESEND_REPLY_TO || replyToAddr,
  );
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
        headers: {
          ...(bulk
            ? {
                "List-Unsubscribe": `<mailto:${unsubscribeAddr}>`,
                // RFC 8058 one-click, which Gmail's bulk sender guidelines
                // expect alongside List-Unsubscribe.
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : {}),
          ...(headers || {}),
        },
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

// --- Provider verification ---------------------------------------------------
//
// A queued job reads `sent` once Resend accepted it and returned a message id.
// Accepted is not the same as landed in the inbox, so this asks Resend what
// actually happened to that exact message (delivered, bounced, complained,
// delayed). Read-only, one HTTP GET, used by the studio Delivery log and the
// `delivery:status --check` script.

export type EmailProviderStatus =
  | { ok: true; lastEvent: string; to: string[]; subject: string | null }
  | { ok: false; error: string };

export async function fetchEmailProviderStatus(messageId: string): Promise<EmailProviderStatus> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not configured" };
  if (messageId === "dev") return { ok: false, error: "Local development send, never handed to a provider" };
  try {
    const res = await fetch(`${RESEND_ENDPOINT}/${encodeURIComponent(messageId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `Resend returned ${res.status}` };
    }
    const body = (await res.json().catch(() => ({}))) as {
      last_event?: unknown;
      to?: unknown;
      subject?: unknown;
    };
    return {
      ok: true,
      lastEvent: typeof body.last_event === "string" ? body.last_event : "unknown",
      to: Array.isArray(body.to) ? body.to.filter((t): t is string => typeof t === "string") : [],
      subject: typeof body.subject === "string" ? body.subject : null,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
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

/** Wrap body HTML in the Mutuals email shell. `inner` is trusted, pre-escaped
 *  HTML produced by the caller. `preheader` is the hidden inbox-preview line. */
function emailShell(inner: string, preheader = ""): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.cream}">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${BRAND.cream}">
        <tr><td style="padding:4px 4px 20px">
          <span style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink}">Mutuals</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:14px;padding:32px">
          ${inner}
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.muted}">
          Curated matchmaking in New York and San Francisco.<br/>
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

// Sent the moment an application is submitted. It has one job now: tell the
// applicant the ball is in their friends' court, and name the friends, so the
// wait is something they can act on rather than something they endure.
export function applicationReceivedEmail(args: {
  name: string;
  city?: string | null;
  /** The friends they named. Empty for an application taken before the gate. */
  recommenders?: { name: string; status: string }[];
  statusUrl?: string;
}): { subject: string; html: string; text: string } {
  const first = (args.name || "there").split(" ")[0];
  const place = args.city ? cityLabel(args.city) : null;
  const waiting = (args.recommenders ?? []).filter((r) => r.status !== "submitted");
  const names = waiting.map((r) => r.name.split(" ")[0]).filter(Boolean);
  const nameList =
    names.length === 0
      ? ""
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const subject = names.length ? "We have your application (now it's up to your friends)" : "We have your application";

  const text = names.length
    ? `Hi ${first},\n\n` +
      `We have your application to Mutuals${place ? ` in ${place}` : ""}.\n\n` +
      `We have emailed ${nameList} to ask what they would say about you. The moment both write back, you are in - that is the whole review. Nudging them is the fastest way to move this along.\n\n` +
      (args.statusUrl ? `See where it stands: ${args.statusUrl}\n\n` : "") +
      `Warmly,\nMutuals`
    : `Hi ${first},\n\n` +
      `Thank you for applying to Mutuals${place ? ` in ${place}` : ""}. A matchmaker reads every application by hand, so this takes a little time - that is on purpose.\n\n` +
      `If it is a fit, we will be in touch to welcome you in and start making introductions. Either way, you will hear from a person, not a form.\n\n` +
      `Warmly,\nMutuals`;

  const inner = names.length
    ? h1("Now it's up to your friends.") +
      p(`Hi ${esc(first)}, we have your application${place ? ` in ${esc(place)}` : ""}.`) +
      p(`We have emailed <strong>${esc(nameList)}</strong> to ask what they would say about you. The moment both write back, you are in - that is the whole review.`) +
      (args.statusUrl ? `<p style="margin:24px 0 0">${emailButton("See where it stands", args.statusUrl)}</p>` : "") +
      small("A nudge from you is the fastest way to move this along.")
    : h1("Thank you for applying.") +
      p(`Hi ${esc(first)}, we have your application${place ? ` in ${esc(place)}` : ""}. A matchmaker reads every one by hand, so this takes a little time - that is on purpose.`) +
      p(`If it is a fit, we will be in touch to welcome you and start making introductions. Either way, you will hear from a person, not a form.`) +
      small("You do not need to do anything else right now.");

  return {
    subject,
    html: emailShell(inner, names.length ? `We asked ${nameList} to vouch for you.` : "A matchmaker reads every application by hand."),
    text,
  };
}

// Sent to a friend an applicant named. This is the email the whole gate rests
// on, so it is written to be answered: it says who asked, what is being asked,
// how long it takes, and that the applicant does not get in until they reply.
//
// It goes to someone who never signed up for anything, so it names the person
// who caused it in the first line and asks for nothing but a few sentences.
export function recommendationRequestEmail(args: {
  recommenderName: string;
  applicantName: string;
  applicantCity?: string | null;
  link: string;
  /** True when this is the nudge rather than the first ask. */
  reminder?: boolean;
  /** One line from the applicant themselves, which converts better than any
   *  system copy because it is the only part of this email they wrote. */
  applicantNote?: string | null;
  /** Tell them they can simply reply. Set when the message carries a
   *  token-bearing Reply-To that the inbound webhook can route. */
  replyToVouch?: boolean;
  /** The applicant is already a member, so "they are not in until you write"
   *  would be a lie. Nine friends were asked before an operator approved the
   *  person anyway, and the honest version of that ask is a different email. */
  applicantAccepted?: boolean;
}): { subject: string; html: string; text: string } {
  const first = (args.recommenderName || "there").split(" ")[0];
  const applicantFirst = (args.applicantName || "your friend").split(" ")[0];
  const place = args.applicantCity ? cityLabel(args.applicantCity) : null;
  const subject = args.applicantAccepted
    ? `${applicantFirst} is in. Your words are the missing piece`
    : args.reminder
      ? `Still waiting on you: ${applicantFirst}'s recommendation`
      : `${applicantFirst} asked you to vouch for them`;

  // What is actually at stake, told straight. Either they are waiting on you,
  // or they are not and this is about what the person they meet will read.
  const stakesText = args.applicantAccepted
    ? `${applicantFirst} is already a member, so nothing is blocked on you. What is still missing is your words: they go on ${applicantFirst}'s profile and they are what the one person we introduce them to actually reads.`
    : `${applicantFirst} is not accepted until two friends write back, so this genuinely decides it.`;
  const stakesHtml = args.applicantAccepted
    ? p(`${esc(applicantFirst)} is already a member, so nothing is blocked on you. What is still missing is your words: they go on ${esc(applicantFirst)}&rsquo;s profile and they are what the one person we introduce them to actually reads.`)
    : p(`${esc(applicantFirst)} is <strong>not accepted until two friends write back</strong>, so this genuinely decides it.`);

  const note = args.applicantNote?.trim();
  const text =
    `Hi ${first},\n\n` +
    `${args.applicantName} applied to Mutuals${place ? ` in ${place}` : ""} - curated matchmaking, where a matchmaker introduces you to one person at a time - and named you as someone who knows them well.\n\n` +
    (note ? `${applicantFirst} says: "${note}"\n\n` : "") +
    `${stakesText}\n\n` +
    (args.replyToVouch
      ? `The fastest way: just hit reply and type a few sentences. Whatever you write comes straight back to us and goes on ${applicantFirst}'s profile.\n\n`
      : "") +
    `Or use the page, where one tap vouches for them and the words are optional:\n${args.link}\n\n` +
    `A few sentences is plenty: what they are like, what makes them worth meeting, and anything you would tell a friend before setting them up.\n\n` +
    `Thank you,\nMutuals`;

  const inner =
    h1(args.applicantAccepted ? `${applicantFirst} is in.` : `${applicantFirst} asked you to vouch for them.`) +
    p(`Hi ${esc(first)}, <strong>${esc(args.applicantName)}</strong> applied to Mutuals${place ? ` in ${esc(place)}` : ""} and named you as someone who knows them well.`) +
    (note
      ? `<p style="margin:0 0 16px;padding:12px 16px;border-left:2px solid ${BRAND.oxblood};font-family:${SERIF};font-size:16px;font-style:italic;line-height:1.55;color:${BRAND.ink}">${esc(applicantFirst)} says: &ldquo;${esc(note)}&rdquo;</p>`
      : "") +
    stakesHtml +
    (args.replyToVouch
      ? p(`The fastest way: <strong>just hit reply</strong> and type a few sentences. Whatever you write comes straight back to us and goes on ${esc(applicantFirst)}&rsquo;s profile.`)
      : "") +
    `<p style="margin:24px 0 0">${emailButton(args.reminder ? "Vouch now" : `Vouch for ${applicantFirst}`, args.link)}</p>` +
    small(`One tap vouches for them; the words are optional but they are what shows on the profile. No account needed.`);

  return {
    subject,
    html: emailShell(
      inner,
      args.applicantAccepted
        ? `Your words are what ${applicantFirst}'s match will read.`
        : `${applicantFirst} is not in until two friends write back.`,
    ),
    text,
  };
}

// Sent to the applicant when one friend writes back and they still need
// another. Turns a silent wait into a visible one, and asks for the nudge.
export function recommendationReceivedEmail(args: {
  name: string;
  recommenderName: string;
  remaining: number;
  statusUrl: string;
}): { subject: string; html: string; text: string } {
  const first = (args.name || "there").split(" ")[0];
  const from = (args.recommenderName || "your friend").split(" ")[0];
  const subject = `${from} vouched for you`;
  const need =
    args.remaining === 1
      ? "One more recommendation and you are in."
      : `${args.remaining} more recommendations and you are in.`;
  const text =
    `Hi ${first},\n\n` +
    `${from} just wrote your recommendation. ${need}\n\n` +
    `See it, and who we are still waiting on:\n${args.statusUrl}\n\n` +
    `Warmly,\nMutuals`;
  const inner =
    h1(`${from} vouched for you.`) +
    p(`Hi ${esc(first)}, <strong>${esc(from)}</strong> just wrote your recommendation. ${esc(need)}`) +
    `<p style="margin:24px 0 0">${emailButton("See where it stands", args.statusUrl)}</p>` +
    small("A nudge from you is the fastest way to finish this.");
  return { subject, html: emailShell(inner, need), text };
}

// Sent to a friend after they write a recommendation. They did the applicant a
// favour and got nothing out of it; this is the thank-you, and the one place it
// is fair to tell them Mutuals exists for them too.
export function recommendationThanksEmail(args: {
  recommenderName: string;
  applicantName: string;
  accepted: boolean;
  applyUrl: string;
}): { subject: string; html: string; text: string } {
  const first = (args.recommenderName || "there").split(" ")[0];
  const applicantFirst = (args.applicantName || "your friend").split(" ")[0];
  const subject = `Thank you for vouching for ${applicantFirst}`;
  const outcome = args.accepted
    ? `That was the one they needed - ${applicantFirst} is in, and your words are on their profile.`
    : `It is on ${applicantFirst}'s profile now. They need one more friend to write back before they are in.`;
  const text =
    `Hi ${first},\n\n` +
    `Thank you - that helps more than you would think. ${outcome}\n\n` +
    `If you would like introductions of your own, this is how Mutuals works: a matchmaker introduces you to one person at a time, by email, and you decide for yourself.\n${args.applyUrl}\n\n` +
    `Warmly,\nMutuals`;
  const inner =
    h1("Thank you.") +
    p(`Hi ${esc(first)}, that helps more than you would think. ${esc(outcome)}`) +
    p(`If you would like introductions of your own: a matchmaker introduces you to <strong>one person at a time</strong>, by email, and you decide for yourself.`) +
    `<p style="margin:24px 0 0">${emailButton("See how it works", args.applyUrl)}</p>`;
  return { subject, html: emailShell(inner, `${applicantFirst} will be glad you did.`), text };
}

// Sent when an operator approves an applicant. This is the "welcome, you'll
// start getting matches" moment.
export function applicationApprovedEmail(args: {
  name: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const first = (args.name || "there").split(" ")[0];
  const subject = "You're in - welcome to Mutuals";
  const text =
    `Hi ${first},\n\n` +
    `Good news: you are in. Welcome to Mutuals.\n\n` +
    `From here, a matchmaker introduces you to one person at a time - no public profile, no feed, no endless messaging. When we find someone we think you should meet, the introduction comes by email and you decide for yourself.\n\n` +
    `Take a minute to round out your profile and tell us what you are looking for:\n${args.appUrl}\n\n` +
    `Warmly,\nMutuals`;
  const inner =
    h1("Welcome to Mutuals.") +
    p(`Hi ${esc(first)}, you are in. From here a matchmaker introduces you to <strong>one person at a time</strong> - no public profile, no feed, no endless messaging.`) +
    p(`When we find someone we think you should meet, the introduction comes by email and you decide for yourself. If you both say yes, we connect you.`) +
    `<p style="margin:24px 0 0">${emailButton("Round out your profile", args.appUrl)}</p>` +
    small("The more we know about what you are looking for, the better the introductions.");
  return { subject, html: emailShell(inner, "You're in - welcome to Mutuals."), text };
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
    `Just a friendly nudge - you and ${otherFirst} both said yes, and the best introductions turn into a plan while they are still warm.\n\n` +
    `Reply to your intro thread with a day and place this week. A short first message goes a long way.\n\n` +
    `Rooting for you,\nMutuals`;
  const inner =
    h1("Don't let this one cool off.") +
    p(`Hi ${esc(first)}, you and <strong>${esc(otherFirst)}</strong> both said yes. The best introductions turn into a plan while they are still warm.`) +
    p(`Reply to your introduction thread with a day and a place this week - a short first message goes a long way.`) +
    small("Want us to help pick a spot? Just reply and ask.");
  return { subject, html: emailShell(inner, `You and ${otherFirst} still haven't set a time.`), text };
}

// Post-connection check-in: "how did the date go?" Their reply becomes
// feedback the matchmaker can act on.
export function matchFeedbackEmail(args: {
  toName: string;
  otherName: string;
}): { subject: string; html: string; text: string } {
  const first = (args.toName || "there").split(" ")[0];
  const otherFirst = (args.otherName || "your match").split(" ")[0];
  const subject = `How was your date with ${otherFirst}?`;
  const text =
    `Hi ${first},\n\n` +
    `How did it go with ${otherFirst}? A sentence is plenty - did you meet, did you click, should we keep going or try someone new?\n\n` +
    `Just reply to this email. It helps us make your next introduction a better one.\n\n` +
    `Warmly,\nMutuals`;
  const inner =
    h1(`How was ${otherFirst}?`) +
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
      ? `a seat at ${args.context ? args.context : "an upcoming Mutuals dinner"}`
      : "Mutuals coaching";
  const subject = args.kind === "dinner" ? "Your dinner request is in" : "Your coaching request is in";
  const text =
    `Hi ${first},\n\n` +
    `Thanks - we have your request for ${thing}. A matchmaker will follow up personally with next steps.\n\n` +
    `Warmly,\nMutuals`;
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
  const text = `Hi ${first},\n\nYou're invited to a Mutuals dinner.\n\n${theme}\n${when}\n${venue}, ${city}\n\nSign in to see details: ${link}\n\nReply to this email to RSVP or with any questions.`;
  const inner =
    h1("You're invited to dinner.") +
    p(`Hi ${esc(first)}, a seat has opened at a Mutuals dinner.`) +
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
    `Good news: you and ${otherFirst} both said yes to an introduction.\n\n` +
    `Here is how to reach ${otherFirst}:\n${reachText}\n\n` +
    `${note}\n\n` +
    `Warmly,\nMutuals\n\n` +
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
    h1(`You and ${otherFirst} said yes.`) +
    p(`Hi ${esc(first)}, you and <strong>${esc(otherFirst)}</strong> both said yes to an introduction.`) +
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
/** The other person's profile, exactly as THEY wrote it. Nothing here is
 *  operator-authored: the matchmaker chooses the pair, the members describe
 *  themselves. `matchmakerNote` is the one optional operator line, and it is a
 *  note about the pairing, not a description of either person. */
export type InviteProfile = {
  name: string;
  age?: number | null;
  // Neighbourhood only. Both people are matched inside one market, so restating
  // the city back at them reads like a listing rather than an introduction.
  neighborhood?: string | null;
  headline?: string | null;
  bio?: string | null;
  lookingFor?: string | null;
  dealBreakers?: string | null;
  recommendation?: string | null;
  voucherName?: string | null;
  prompts?: { question: string; answer: string }[];
  /** Lead photo. Kept for callers that only have one. */
  photoUrl?: string | null;
  /** Every approved photo, lead first. Preferred over photoUrl when present. */
  photoUrls?: string[] | null;
};

/** A labelled block of the member's own words. */
function profileSection(label: string, body: string): string {
  return (
    `<p style="margin:20px 0 4px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.muted}">${esc(label)}</p>` +
    `<p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.65;color:${BRAND.ink}">${esc(body)}</p>`
  );
}

// The introduction invite. The whole profile travels in the email itself so the
// recipient can decide without clicking anything; the link exists for the photo,
// the Yes/Pass buttons, and anyone who prefers a page.
export function matchInviteEmail(args: {
  toName: string;
  other: InviteProfile;
  matchmakerNote?: string | null;
  profileUrl: string;
}): { subject: string; html: string; text: string } {
  const { other } = args;
  const first = (args.toName || "there").split(" ")[0];
  const otherFirst = (other.name || "someone").split(" ")[0];
  const subject = `An introduction to ${otherFirst}`;

  const clean = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
  const headline = clean(other.headline);
  const bio = clean(other.bio);
  const lookingFor = clean(other.lookingFor);
  const dealBreakers = clean(other.dealBreakers);
  const recommendation = clean(other.recommendation);
  const voucherName = clean(other.voucherName);
  const note = clean(args.matchmakerNote);
  const prompts = (other.prompts ?? []).filter((q) => q.question?.trim() && q.answer?.trim());

  // "31, Cobble Hill" with every missing piece dropped. City is deliberately
  // absent: both people were matched inside the same market, so restating it
  // reads like a listing ("Joshua in NYC") rather than an introduction.
  const meta = [other.age ? String(other.age) : null, clean(other.neighborhood)]
    .filter(Boolean)
    .join(", ");

  const text = [
    `Hi ${first},`,
    "",
    `We'd like to introduce you to ${otherFirst}.`,
    note ? `\n${note}` : null,
    "",
    `${otherFirst}${meta ? ` (${meta})` : ""}`,
    headline ? `"${headline}"` : null,
    bio ? `\nAbout\n${bio}` : null,
    lookingFor ? `\nLooking for\n${lookingFor}` : null,
    dealBreakers ? `\nDeal-breakers\n${dealBreakers}` : null,
    recommendation
      ? `\nRecommendation\n"${recommendation}"${voucherName ? `\nVouched for by ${voucherName}` : ""}`
      : null,
    ...prompts.map((q) => `\n${q.question}\n${q.answer}`),
    "",
    `Want the introduction? Reply Y (yes) or N (no) to this email, or use the buttons here:`,
    args.profileUrl,
    "",
    `If you both say yes, we'll connect you. If either passes, nothing happens and no one is told.`,
    "",
    `Warmly,`,
    `Mutuals`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  // Photos, not a photo. This email is where most people actually decide, and
  // an 88px circle beside a name is an avatar, not a look at someone. The lead
  // photo is 240px square; any others follow underneath at 104px.
  //
  // Every URL is token-scoped and approved-only. Widths and heights are set as
  // attributes as well as CSS because Outlook ignores the CSS, and each image
  // has real alt text for the many clients that block remote images by default.
  const gallery = (other.photoUrls?.length ? other.photoUrls : other.photoUrl ? [other.photoUrl] : []).slice(0, 3);
  const lead = gallery[0];
  const rest = gallery.slice(1);

  const photo = lead
    ? `<img src="${encodeURI(lead)}" width="240" height="240" alt="${esc(otherFirst)}" style="display:block;width:240px;max-width:100%;height:auto;border-radius:14px;object-fit:cover;border:1px solid ${BRAND.line}" />` +
      (rest.length
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>${rest
            .map(
              (url, i) =>
                `<td style="padding-right:8px"><img src="${encodeURI(url)}" width="104" height="104" alt="${esc(otherFirst)}, photo ${i + 2}" style="display:block;width:104px;height:104px;border-radius:10px;object-fit:cover;border:1px solid ${BRAND.line}" /></td>`
            )
            .join("")}</tr></table>`
        : "")
    : "";

  const inner =
    h1(`Meet ${otherFirst}.`) +
    p(`Hi ${esc(first)}, we think you two could hit it off. Everything below is in ${esc(otherFirst)}&rsquo;s own words.`) +
    (note
      ? `<p style="margin:0 0 20px;padding:12px 16px;background:${BRAND.paper};border-radius:10px;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink}">${esc(note)}</p>`
      : "") +
    // Photos above the name rather than in a narrow cell beside it. At 88px a
    // photo fits next to the text; at the size you can actually judge someone
    // by, it has to lead.
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${BRAND.line};padding-top:8px">
      ${photo ? `<tr><td style="padding:20px 0 0">${photo}</td></tr>` : ""}
      <tr>
        <td valign="top" style="padding-top:${photo ? "16px" : "20px"}">
          <p style="margin:0;font-family:${SERIF};font-size:24px;line-height:1.2;color:${BRAND.ink}">${esc(otherFirst)}</p>
          ${meta ? `<p style="margin:4px 0 0;font-family:${SANS};font-size:14px;color:${BRAND.muted}">${esc(meta)}</p>` : ""}
          ${headline ? `<p style="margin:8px 0 0;font-family:${SERIF};font-size:17px;font-style:italic;line-height:1.4;color:${BRAND.oxblood}">${esc(headline)}</p>` : ""}
        </td>
      </tr>
    </table>` +
    (bio ? profileSection("About", bio) : "") +
    (lookingFor ? profileSection("Looking for", lookingFor) : "") +
    (dealBreakers ? profileSection("Deal-breakers", dealBreakers) : "") +
    (recommendation
      ? `<p style="margin:20px 0 4px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.muted}">Recommendation</p>` +
        `<p style="margin:0;padding:12px 16px;border-left:2px solid ${BRAND.oxblood};font-family:${SERIF};font-size:16px;font-style:italic;line-height:1.55;color:${BRAND.ink}">&ldquo;${esc(recommendation)}&rdquo;</p>` +
        (voucherName
          ? `<p style="margin:6px 0 0;font-family:${SANS};font-size:12px;color:${BRAND.muted}">Vouched for by ${esc(voucherName)}</p>`
          : "")
      : "") +
    prompts
      .map(
        (q) =>
          `<p style="margin:20px 0 4px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.muted}">${esc(q.question)}</p>` +
          `<p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.65;color:${BRAND.ink}">${esc(q.answer)}</p>`,
      )
      .join("") +
    `<p style="margin:28px 0 16px;padding-top:24px;border-top:1px solid ${BRAND.line}">${emailButton("Yes, introduce us", args.profileUrl)}</p>` +
    p(`Prefer to answer right here? <strong>Reply Y</strong> for yes or <strong>N</strong> to pass.`) +
    small("If you both say yes, we'll connect you. If either passes, nothing happens and no one is told.");

  return {
    subject,
    html: emailShell(inner, `An introduction to ${otherFirst}, in their own words.`),
    text,
  };
}

// Second email of the double opt-in, sent to BOTH people at once (a single send
// with both on the To line) the moment the match goes mutual. Because it is one
// message to both, it is literally the same email thread: either can reply-all
// and they are talking directly. No brokering of private numbers needed.
export function matchThreadEmail(args: {
  aName: string;
  bName: string;
  city?: string | null;
  // Optional "a few ideas" block: grounded venue suggestions for this pair. Both
  // are omitted everywhere except the live connection send, so every other
  // caller and every test renders exactly the email this sent before.
  ideas?: DateIdeas;
  pickUrlFor?: PickUrlFor;
}): { subject: string; html: string; text: string } {
  // Full names here, unlike every earlier email. Before this point the product
  // withholds the surname on purpose: someone deciding whether to meet you
  // should not be able to look you up first. Once both have said yes they are
  // on one thread and about to meet, so the surname is what makes the
  // introduction usable, and withholding it made two members of the same
  // family read as "Jess + Jessica" with no way to tell who was who.
  const aFull = (args.aName || "there").trim();
  const bFull = (args.bName || "there").trim();
  const aFirst = aFull.split(" ")[0];
  const bFirst = bFull.split(" ")[0];
  const subject = `${aFull} + ${bFull}: you both said yes`;
  const block = dateIdeasBlock(args.ideas, args.pickUrlFor);

  const text =
    `Hi ${aFirst} and ${bFirst},\n\n` +
    `You both said yes to an introduction, so here you are on one thread.\n\n` +
    `${aFull} and ${bFull}, meet each other.\n\n` +
    `Just hit reply-all to say hello and find a time this week. A short first message goes a long way.\n\n` +
    (block.text ? `${block.text}\n\n` : "") +
    `Warmly,\nMutuals`;

  const inner =
    h1("You both said yes.") +
    p(`Hi <strong>${esc(aFull)}</strong> and <strong>${esc(bFull)}</strong> - you both said yes to an introduction, so here you are on one thread.`) +
    p(`Just hit <strong>reply-all</strong> to say hello and find a time this week. A short first message goes a long way.`) +
    block.html +
    small("Reply any time if you would like a hand.");
  return { subject, html: emailShell(inner, `${aFull} and ${bFull}, meet each other.`), text };
}

// Sent to a friend a day and a half after they wrote a recommendation, once,
// and only if they have not already applied.
//
// This is the whole growth loop in one message, and it is the only mail this
// system sends to someone who did not ask to hear from Mutuals. It earns the
// send by reporting the outcome of the thing they actually did, it makes the
// offer once, and it never repeats. There is no drip and no list.
export function recommenderFollowUpEmail(args: {
  recommenderName: string;
  applicantName: string;
  accepted: boolean;
  applyUrl: string;
}): { subject: string; html: string; text: string } {
  const first = (args.recommenderName || "there").split(" ")[0];
  const applicantFirst = (args.applicantName || "your friend").split(" ")[0];
  const subject = args.accepted
    ? `${applicantFirst} is in, and you are why`
    : `Thank you for vouching for ${applicantFirst}`;
  const outcome = args.accepted
    ? `${applicantFirst} is in. Your words are on their profile, and they are the reason a matchmaker is now looking for someone worth introducing them to.`
    : `${applicantFirst} is still waiting on one more friend to write back, but your part is done.`;

  const text =
    `Hi ${first},\n\n` +
    `${outcome}\n\n` +
    `Since you clearly know how to pick people: this works for you too. A matchmaker introduces you to one person at a time, by email, and you decide for yourself. No profile to maintain, no feed, no swiping.\n\n` +
    `And because you have already vouched for ${applicantFirst}, they count as one of the two recommendations you would need. You would only have to ask one friend.\n\n` +
    `${args.applyUrl}\n\n` +
    `If this is not for you, ignore this and you will not hear from us again.\n\n` +
    `Warmly,\nMutuals`;

  const inner =
    h1(args.accepted ? `${applicantFirst} is in.` : "Thank you for that.") +
    p(`Hi ${esc(first)}, ${esc(outcome)}`) +
    p(`Since you clearly know how to pick people, this works for you too: a matchmaker introduces you to <strong>one person at a time</strong>, by email, and you decide for yourself. No profile to maintain, no feed, no swiping.`) +
    `<div style="margin:16px 0;padding:16px;border:1px solid ${BRAND.line};border-radius:12px;background:${BRAND.cream}">
      <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink}">You have already vouched for <strong>${esc(applicantFirst)}</strong>, so they count as one of the two recommendations you would need. You would only have to ask one friend.</p>
    </div>` +
    `<p style="margin:24px 0 0">${emailButton("See how it works", args.applyUrl)}</p>` +
    small("If this is not for you, ignore this and you will not hear from us again.");

  return { subject, html: emailShell(inner, "You would only have to ask one friend."), text };
}

// Sent to a member when someone they were vouched for by is now applying, and
// is counting on them to write one back. High odds of a reply: they already
// know the person, and the person already did this for them.
export function vouchBackRequestEmail(args: {
  memberName: string;
  applicantName: string;
  link: string;
}): { subject: string; html: string; text: string } {
  const first = (args.memberName || "there").split(" ")[0];
  const applicantFirst = (args.applicantName || "your friend").split(" ")[0];
  const subject = `${applicantFirst} vouched for you. Return the favour?`;
  const text =
    `Hi ${first},\n\n` +
    `${args.applicantName} wrote your recommendation when you applied to Mutuals, and is now applying too.\n\n` +
    `You count as one of their two recommendations. A few sentences from you and they are most of the way in.\n\n` +
    `${args.link}\n\n` +
    `Warmly,\nMutuals`;
  const inner =
    h1(`${applicantFirst} vouched for you.`) +
    p(`Hi ${esc(first)}, <strong>${esc(args.applicantName)}</strong> wrote your recommendation when you applied, and is now applying too.`) +
    p(`You count as one of their two. A few sentences from you and they are most of the way in.`) +
    `<p style="margin:24px 0 0">${emailButton(`Vouch for ${applicantFirst}`, args.link)}</p>` +
    small("Two minutes. What you write shows on their profile, in your words.");
  return { subject, html: emailShell(inner, `Return the favour for ${applicantFirst}.`), text };
}

// Sent to someone who signed in, started an application, and stopped.
//
// On 3 August, 18 people completed an application and 18 signed in and never
// did. Seven of those had already uploaded photos, so they had done the part
// most people find hardest and left before the part that takes a minute. Not
// one of them heard from us again. This is that email, and it is sent once.
//
// It names what they already did, because a person who uploaded five photos is
// not a lead to be re-pitched, they are someone who was nearly finished. And it
// says what is actually left, which is short, rather than asking them to
// "complete your profile" as though the work were unbounded.
export function unfinishedApplicationEmail(args: {
  name: string;
  photos: number;
  applyUrl: string;
  /** They saved the first half and stopped at the friends. That is a different
   *  email: they are one screen from being a member, not halfway up a form. */
  basicsSaved?: boolean;
}): { subject: string; html: string; text: string } {
  const first = (args.name || "there").split(" ")[0];
  const got = args.photos > 0;

  const subject = args.basicsSaved
    ? "Two names and you are a member"
    : got
      ? `Your ${args.photos === 1 ? "photo is" : "photos are"} saved. One step left`
      : "You started an application to Mutuals";

  const opener = args.basicsSaved
    ? `Everything about you is saved: your details${got ? `, and your ${args.photos === 1 ? "photo" : `${args.photos} photos`}` : ""}. The only thing missing is the two friends who vouch for you.`
    : got
      ? `You uploaded ${args.photos === 1 ? "a photo" : `${args.photos} photos`} and then the application stopped. ${args.photos === 1 ? "It is" : "They are"} still saved, so nothing you did is lost.`
      : `You signed in to apply to Mutuals and did not finish. Whatever you filled in is still there.`;

  const remaining = args.basicsSaved
    ? `That is two names and two email addresses. We do the asking: they answer in a couple of sentences or with one tap, and the moment both have, you are a member.`
    : `What is left is short: your city, your date of birth, and the two friends who will vouch for you. We email them, they answer in a couple of sentences or with one tap, and when both have, you are a member.`;

  const text =
    `Hi ${first},\n\n` +
    `${opener}\n\n` +
    `${remaining}\n\n` +
    `Pick up where you left off:\n${args.applyUrl}\n\n` +
    `If you have changed your mind, ignore this and you will not hear from us again.\n\n` +
    `Warmly,\nMutuals`;

  const inner =
    h1(args.basicsSaved ? "Two names and you are in." : got ? "You were nearly done." : "You started an application.") +
    p(`Hi ${esc(first)}, ${esc(opener)}`) +
    p(esc(remaining)) +
    `<p style="margin:24px 0 0">${emailButton(args.basicsSaved ? "Name your two friends" : "Pick up where you left off", args.applyUrl)}</p>` +
    small("If you have changed your mind, ignore this and you will not hear from us again.");

  return {
    subject,
    html: emailShell(
      inner,
      args.basicsSaved
        ? "Everything else is saved. Two names left."
        : got
          ? "Your photos are saved. One step left."
          : "Pick up where you left off.",
    ),
    text,
  };
}

export function magicLinkEmail(link: string): { subject: string; html: string; text: string } {
  const subject = "Your Mutuals sign-in link";
  const text = `Sign in to Mutuals:\n${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.`;
  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#2a2320">
    <h1 style="font-size:22px;font-weight:500;color:#7a1f2b">Mutuals</h1>
    <p style="font-size:15px;line-height:1.6">Tap to sign in. This link expires in 15 minutes and can be used once.</p>
    <p style="margin:24px 0">
      <a href="${encodeURI(link)}" style="background:#7a1f2b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px">Sign in to Mutuals</a>
    </p>
    <p style="font-size:12px;color:#8a817c">If you did not request this, ignore this email.</p>
  </div>`;
  return { subject, html, text };
}
