// The "a few ideas" block in the connection email.
//
// Lives outside email.ts so the ideas feature can change without touching the
// file every other template shares.
//
// Everything rendered here is escaped. Venue names, areas and notes are
// operator-typed free text, the `why` line is model-written, and this email is
// delivered to two other people's inboxes, so none of it is trusted markup.
//
// The copy deliberately never claims a booking. Mutuals holds no tables:
// "Book on their site" leaves for the venue's own page and the Mutuals link only
// records which place the pair chose.
import type { DateIdeas } from "./date-ideas";

const BRAND = {
  cream: "#f4f1ea",
  ink: "#171714",
  muted: "#67635d",
  line: "#d9d3c8",
  oxblood: "#762d38",
} as const;

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links are ever emitted. A venue URL is operator-typed, so a
 *  `javascript:` or `data:` value must not survive into an anchor. */
function safeUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export type PickUrlFor = (venueId: string) => string | null;

/** Returns empty strings when there is nothing to show, so callers can
 *  concatenate unconditionally and the email is byte-identical to before. */
export function dateIdeasBlock(ideas: DateIdeas | undefined, pickUrlFor?: PickUrlFor): { html: string; text: string } {
  const empty = { html: "", text: "" };
  if (!ideas || (!ideas.ideas.length && !ideas.wildcard)) return empty;

  const rows = ideas.ideas.map((idea) => {
    const meta = [idea.area, idea.cuisine, idea.priceBand].filter(Boolean).join(" · ");
    const booking = safeUrl(idea.bookingUrl);
    const maps = safeUrl(idea.mapsUrl);
    const pick = safeUrl(pickUrlFor?.(idea.venueId));

    const links: string[] = [];
    if (booking)
      links.push(`<a href="${esc(booking)}" style="color:${BRAND.oxblood};text-decoration:underline">Book on their site</a>`);
    else if (maps)
      links.push(`<a href="${esc(maps)}" style="color:${BRAND.oxblood};text-decoration:underline">See it on a map</a>`);
    if (pick)
      links.push(`<a href="${esc(pick)}" style="color:${BRAND.muted};text-decoration:underline">We&#39;re going here</a>`);

    return `<div style="margin:0 0 14px;padding-bottom:14px;border-bottom:1px solid ${BRAND.line}">
      <p style="margin:0;font-family:${SANS};font-size:15px;font-weight:600;color:${BRAND.ink}">${esc(idea.name)}</p>
      ${meta ? `<p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${BRAND.muted}">${esc(meta)}</p>` : ""}
      <p style="margin:6px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink}">${esc(idea.why)}</p>
      ${links.length ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:13px">${links.join(` <span style="color:${BRAND.line}">|</span> `)}</p>` : ""}
    </div>`;
  });

  const html = `<div style="margin:20px 0;padding:18px;border:1px solid ${BRAND.line};border-radius:12px;background:${BRAND.cream}">
      <p style="margin:0 0 12px;font-family:${SANS};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.muted}">A few ideas</p>
      ${rows.join("")}
      ${ideas.wildcard ? `<p style="margin:2px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink}">${esc(ideas.wildcard)}</p>` : ""}
      <p style="margin:12px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${BRAND.muted}">Suggestions only, and nothing is reserved. Book whatever suits you.</p>
    </div>`;

  const lines: string[] = [];
  if (ideas.ideas.length) {
    lines.push("A few ideas:");
    for (const idea of ideas.ideas) {
      const meta = [idea.area, idea.cuisine, idea.priceBand].filter(Boolean).join(" · ");
      lines.push(`- ${idea.name}${meta ? ` (${meta})` : ""}: ${idea.why}`);
      const booking = safeUrl(idea.bookingUrl);
      const maps = safeUrl(idea.mapsUrl);
      const pick = safeUrl(pickUrlFor?.(idea.venueId));
      if (booking) lines.push(`  Book: ${booking}`);
      else if (maps) lines.push(`  Map: ${maps}`);
      if (pick) lines.push(`  We're going here: ${pick}`);
    }
  }
  if (ideas.wildcard) lines.push(ideas.wildcard);
  lines.push("Suggestions only, and nothing is reserved. Book whatever suits you.");

  return { html, text: lines.join("\n") };
}
