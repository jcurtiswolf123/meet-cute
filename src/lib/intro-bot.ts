// The MeetCute introduction bot.
//
// When both people say yes, a 3-way group thread opens (operator + both, masked
// behind our Twilio number). The bot posts ONE warm opener that: greets both by
// first name, shares a line about each, nudges them to make a plan, and suggests
// a concrete, low-pressure first step (coffee, a drink, a walk). Then it steps
// back - it does NOT keep chatting. That "make the intro, suggest a first step,
// drop out" behavior is exactly the call-notes spec.
//
// LLM-optional: with a funded/free provider it writes the opener; with none it
// falls back to a strong deterministic template. Either way it returns plain
// text suitable for SMS, with no emoji (house style) and bounded length.
import { copilotReply } from "./ai";

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Newline- or bullet-separated "about" text -> a short comma phrase.
 *  "Works in finance\nLives in Brooklyn" -> "works in finance, lives in Brooklyn". */
function aboutPhrase(about?: string | null): string {
  if (!about) return "";
  const parts = about
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

/** A concrete, city-aware first-step suggestion the bot can offer. Kept generic
 *  and low-pressure: a quick coffee or a drink this week. */
export function firstStepSuggestion(city?: string | null): string {
  const c = (city || "").toUpperCase();
  if (c.includes("SF")) return "Grab a coffee in Hayes Valley or a drink this week";
  if (c.includes("NYC")) return "Grab a coffee or a drink somewhere easy this week";
  return "Grab a coffee or a drink this week";
}

const MAX_LEN = 480; // keep the opener to a couple of SMS segments

/** Deterministic fallback opener used when no AI provider is available. */
export function groupIntroTemplate(args: {
  operatorName: string;
  aName: string;
  bName: string;
  aboutA?: string | null;
  aboutB?: string | null;
  city?: string | null;
}): string {
  const me = first(args.operatorName);
  const a = first(args.aName);
  const b = first(args.bName);
  const aAbout = aboutPhrase(args.aboutA);
  const bAbout = aboutPhrase(args.aboutB);

  const lines = [
    `You both said yes, so meet each other.`,
    aAbout ? `${a}: ${aAbout}.` : null,
    bAbout ? `${b}: ${bAbout}.` : null,
    `I think you two will really hit it off. ${firstStepSuggestion(args.city)} and see where it goes.`,
    `I will step back now, but I am right here if either of you needs anything. - ${me}`,
  ].filter(Boolean) as string[];

  return lines.join(" ").slice(0, MAX_LEN);
}

/** Compose the bot's group-thread opener. Tries the LLM first (warmer, varied),
 *  falls back to the template. Always returns clean, emoji-free SMS text. */
export async function composeGroupIntro(args: {
  operatorName: string;
  aName: string;
  bName: string;
  aboutA?: string | null;
  aboutB?: string | null;
  city?: string | null;
}): Promise<string> {
  const a = first(args.aName);
  const b = first(args.bName);
  const me = first(args.operatorName);

  const system = [
    "You are the Meet Cute matchmaking concierge writing the FIRST message in a 3-way group text between two people who just agreed to be introduced, plus their matchmaker.",
    "Write ONE short message (2 to 4 sentences, under 400 characters) that:",
    "1) greets both people by first name and introduces them to each other,",
    "2) shares one warm, specific line about each person using the notes provided,",
    "3) encourages them to make a plan, and suggests ONE concrete, low-pressure first step (a coffee or a drink this week),",
    "4) makes clear you are stepping back but available if needed.",
    "Hard rules: warm, human, concise. NO emojis or emoticons of any kind. No markdown, no bullet points, no hashtags. Plain SMS text only. Do not invent facts beyond the notes. Sign off with the matchmaker's first name.",
  ].join(" ");

  const userPrompt = [
    `Matchmaker first name: ${me}`,
    `Person A first name: ${a}`,
    `Notes about ${a}: ${aboutPhrase(args.aboutA) || "(none provided)"}`,
    `Person B first name: ${b}`,
    `Notes about ${b}: ${aboutPhrase(args.aboutB) || "(none provided)"}`,
    `City: ${args.city || "their city"}`,
    `Suggested first step to weave in: ${firstStepSuggestion(args.city)}.`,
    "Write the group-text opener now.",
  ].join("\n");

  try {
    const res = await copilotReply(system, [{ role: "user", content: userPrompt }]);
    if (res.live && res.text) {
      // Strip any emoji/markdown the model may have added, normalize whitespace,
      // and bound length so it never blows past a couple of SMS segments.
      const clean = stripEmoji(res.text).replace(/\s+/g, " ").trim();
      if (clean.length >= 40) return clean.slice(0, MAX_LEN);
    }
  } catch {
    /* fall through to template */
  }
  return groupIntroTemplate(args);
}

/** Remove emoji and common pictographic symbols. House rule: no emojis in any
 *  generated artifact, including outbound SMS the bot composes. */
export function stripEmoji(s: string): string {
  return s
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{2122}\u{2139}\u{2328}\u{23CF}\u{24C2}]/gu,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}
