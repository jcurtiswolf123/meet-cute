// Reading a Y/N decision out of a real email reply.
//
// This is the only place that decides what a matched person meant when they
// replied to their invite. Getting it wrong in the "yes" direction is not
// recoverable: a yes fires the joint connection email that gives both people
// each other's contact details. So the rule everywhere below is that anything
// ambiguous returns null. A missed decision is harmless (the invite email also
// carries Yes/Pass buttons at /i/<token>, and the operator still sees the match
// as pending), while a wrong yes is a privacy event.
//
// Real replies do not look like the happy path. They arrive with greetings
// ("Hi Josh - yes, ..."), below the quoted original (Apple Mail defaults to
// bottom-posting), as HTML with no text part at all, or as an out-of-office
// autoresponder. Each of those is handled here and pinned by the corpus in
// `scripts/test-reply-parse.ts`.

export type ReplyDecision = "yes" | "pass" | null;

/** Quote headers that introduce the original message. Everything from one of
 *  these lines onward is history, not the person's answer. Localized forms are
 *  included because members reply from whatever locale their client is in. */
const QUOTE_HEADER = [
  /^on\b.*\bwrote:\s*$/i, // English: "On Mon, Jul 27, 2026 at 9:02 AM X wrote:"
  /^-{2,}\s*original message\s*-{2,}/i, // Outlook
  /^-{2,}\s*forwarded message\s*-{2,}/i,
  /^from:\s.+/i, // Outlook header block
  /^sent:\s.+/i,
  /^(el|le|il)\b.*\b(escribi|crit|scritto)/i, // es / fr / it "wrote:"
  /^am\b.*\bschrieb\b/i, // de
  /^\s*_{5,}\s*$/, // Outlook's underscore rule above the header block
];

/** Signature separators. Text after these is the person's sign-off. */
const SIGNATURE = [
  /^--\s*$/,
  /^sent from my /i,
  /^get outlook for /i,
  /^enviado desde mi /i,
];

/** Automated mail that must never be read as a decision. */
const AUTOMATED = [
  /^(automatic|auto)[\s-]?repl(y|ies)\b/i,
  /^out of (the )?office\b/i,
  /^away from (the )?office\b/i,
  /^undeliverable\b/i,
  /^delivery status notification/i,
];

/** Affirmatives. "strong" stands on its own; "weak" is agreement noise that is
 *  only trusted when nothing in the reply pulls the other way. */
const YES_STRONG =
  /^(y|ye|yes|yeah|yea|yep|yup|absolutely|definitely|interested|sounds good|sounds great|i'?m in|im in|count me in|let'?s do it|do it|would love to|i'?d love to|love to)\b/i;
const YES_WEAK = /^(ok|okay|k|sure|alright|all right|fine)\b/i;

/** An affirmative adverb immediately negated ("definitely not", "absolutely
 *  not"). Checked before the affirmatives, which would otherwise match the
 *  adverb and read the refusal as a yes. */
const NEGATED_AFFIRMATIVE =
  /^(definitely|absolutely|certainly|probably|really|sure|honestly|unfortunately)\b[\s,.!-]*(not|no)\b/i;

/** Negatives, anchored at the start of the answer. */
const NO_ANCHORED =
  /^(n|no|nope|nah|pass|decline|not interested|not for me|no thanks|no thank you|i'?ll pass|i'?ll have to pass|i'?d rather not|rather not|maybe not|next time)\b/i;

/** Negatives anywhere in the answer. Any hit vetoes a yes, because a reply that
 *  contains "pass" or "not for me" is at best ambiguous no matter how it opens
 *  ("Okay so I'm going to pass on this one"). */
const NO_ANYWHERE =
  /\b(pass on (this|her|him|it)|i'?ll pass|not interested|not for me|not my type|no thank you|no thanks|decline|rather not)\b/i;

/** Phrases where a bare "no" is not a refusal, stripped before the veto scan so
 *  "Yes please, no rush" is not read as conflicting. */
const NO_FALSE_FRIENDS =
  /\bno (problem|worries|rush|doubt|question|brainer|pressure)\b/gi;

/** A leading greeting that would otherwise defeat the start-of-line anchor.
 *  "Hi Josh - yes, I'd love to meet her." is one of the most common shapes. */
const GREETING =
  /^(hi|hey|hello|hiya|good (morning|afternoon|evening)|thanks|thank you|thx)\b[^A-Za-z0-9]*/i;

/** An addressed name after the greeting ("Hi Josh - ..."). Only stripped when a
 *  separator follows, and never when the word is itself an answer, so "Hey! Yes
 *  please" keeps its "Yes". */
const GREETING_NAME = /^([A-Z][a-z]+)\s*[,!.\-:]+\s*/;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#8217": "'",
  "#8211": "-",
  "#8212": "-",
};

/** Turn an HTML mail part into plain text that still has line structure.
 *  Quote containers are removed first: without that, stripping tags flattens the
 *  whole thread into one line and the person's answer is lost among the quoted
 *  original. */
export function htmlToReplyText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, "\n> quoted\n")
    .replace(/<div\b[^>]*\bgmail_quote\b[\s\S]*$/i, "\n> quoted\n")
    .replace(/<div\b[^>]*\byahoo_quoted\b[\s\S]*$/i, "\n> quoted\n")
    .replace(/<div\b[^>]*\bid=["']?(divRplyFwdMsg|appendonsend)["']?[\s\S]*$/i, "\n> quoted\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-z]+|#\d+);/gi, (whole, name: string) => {
      const key = name.toLowerCase();
      return HTML_ENTITIES[key] ?? HTML_ENTITIES[`#${name}`] ?? whole;
    })
    .replace(/[ \t ]+/g, " ");
}

/** Everything the person actually typed, with quoted history and signature
 *  removed. Unlike reading only the first line, this keeps a bottom-posted
 *  answer, which Apple Mail produces by default. */
export function stripQuotedHistory(text: string): string {
  const kept: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith(">") || line.startsWith("|")) continue;
    if (QUOTE_HEADER.some((re) => re.test(line))) break;
    if (SIGNATURE.some((re) => re.test(line))) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

/** Drop a leading greeting so the anchored patterns see the actual answer. */
function withoutGreeting(line: string): string {
  let stripped = line.replace(GREETING, "").trim();
  const named = stripped.replace(GREETING_NAME, "").trim();
  // Never let the name strip swallow the answer itself ("Hey! Yes please").
  if (named && !YES_STRONG.test(stripped) && !YES_WEAK.test(stripped) && !NO_ANCHORED.test(stripped)) {
    stripped = named;
  }
  // Only accept the strip if something is left; "Hi Josh" alone stays as-is.
  return stripped.length ? stripped : line;
}

/** The person's answer: the first non-empty unquoted line, greeting removed. */
export function answerLine(text: string): string {
  for (const line of stripQuotedHistory(text).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const candidate = withoutGreeting(trimmed);
    if (candidate) return candidate;
  }
  return "";
}

/**
 * Read a decision out of a reply. `text` is the text/plain part; `html` is used
 * only when there is no usable text part.
 *
 * Returns null for anything ambiguous, automated, or empty. Callers must treat
 * null as "no decision recorded", never as a pass.
 */
export function decisionFromReply(text?: string | null, html?: string | null): ReplyDecision {
  const source = (text || "").trim() ? String(text) : htmlToReplyText(String(html || ""));
  const body = stripQuotedHistory(source);
  if (!body) return null;

  const first = answerLine(source);
  if (!first) return null;
  if (AUTOMATED.some((re) => re.test(first))) return null;

  // Veto scan runs over the whole answer, not just its first line, so a refusal
  // buried after an agreeable opener still blocks the yes.
  const scanned = body.replace(NO_FALSE_FRIENDS, " ").slice(0, 600);
  const hasNegative = NO_ANYWHERE.test(scanned);

  if (NEGATED_AFFIRMATIVE.test(first)) return "pass";
  if (NO_ANCHORED.test(first)) return "pass";

  const strongYes = YES_STRONG.test(first);
  const weakYes = YES_WEAK.test(first);
  if (!strongYes && !weakYes) return hasNegative ? "pass" : null;

  // A yes that also contains a refusal is ambiguous. Do not connect.
  if (hasNegative) return null;
  return "yes";
}
