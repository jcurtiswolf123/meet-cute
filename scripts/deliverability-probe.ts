// Deliverability probe: sends the real production email templates, unchanged,
// to seed inboxes so we can read Gmail's own verdict (tab placement plus the
// Authentication-Results header) instead of guessing.
//
// Usage:
//   RESEND_API_KEY=... node --import tsx scripts/deliverability-probe.ts <addr> [<addr> ...]
//
// It never touches the database and never mails a member.

import { sendEmail, magicLinkEmail, matchInviteEmail, recommendationRequestEmail, applicationApprovedEmail } from "../src/lib/email";

const APP = process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com";
const tag = process.env.PROBE_TAG || `probe-${Math.floor(Date.now() / 1000)}`;
const targets = process.argv.slice(2).filter(Boolean);
if (!targets.length) throw new Error("Give at least one recipient address.");

const invite = matchInviteEmail({
  toName: "Josh Wolf",
  other: {
    name: "Ada Nakamura",
    age: 31,
    neighborhood: "Cobble Hill",
    headline: "Runs a small ceramics studio, reads too much history",
    bio: "Moved from Chicago four years ago. Weekends are the greenmarket, the pottery wheel, and long walks with a podcast on.",
    lookingFor: "Someone curious and steady, who would rather cook than go out.",
    dealBreakers: null,
    recommendation: "Ada is the friend everyone calls when something goes wrong. Funny, unhurried, deeply loyal.",
    voucherName: "Priya",
    prompts: [{ question: "A perfect Sunday", answer: "Coffee, the studio, and dinner with four people around a table." }],
  } as Parameters<typeof matchInviteEmail>[0]["other"],
  matchmakerNote: "You both said you want the kind of week that has a standing dinner in it.",
  profileUrl: `${APP}/m/example`,
});

const messages = [
  { kind: "magic-link", ...magicLinkEmail(`${APP}/auth/callback?token=probe-token-not-real`) },
  { kind: "match-invite", ...invite },
  {
    kind: "recommendation-request",
    ...recommendationRequestEmail({
      recommenderName: "Sam Alvarez",
      applicantName: "Ada Nakamura",
      applicantCity: "nyc",
      link: `${APP}/vouch/probe-token-not-real`,
      applicantNote: "You have known me since sophomore year, so you are the honest read.",
    }),
  },
  { kind: "approved", ...applicationApprovedEmail({ name: "Josh Wolf", appUrl: `${APP}/app` }) },
];

async function main() {
  for (const to of targets) {
    for (const m of messages) {
      const res = await sendEmail({
        to,
        subject: `${m.subject} [${tag}:${m.kind}]`,
        html: m.html,
        text: m.text,
      });
      console.log(`${res.ok ? "sent " : "FAIL "} ${m.kind.padEnd(24)} -> ${to.padEnd(34)} ${res.ok ? res.providerMessageId : res.error}`);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  console.log(`\ntag=${tag}`);
}

main();
