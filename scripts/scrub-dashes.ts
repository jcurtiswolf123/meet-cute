// One-off + reusable maintenance: replace em/en dashes in user-facing free-text
// DB fields with plain punctuation (house style: no em/en dashes anywhere).
//   npx tsx scripts/scrub-dashes.ts          # apply
//   npx tsx scripts/scrub-dashes.ts --dry    # preview only
import { prisma } from "../src/lib/prisma";

const DRY = process.argv.includes("--dry");

// em/en dash -> comma for prose; numeric en-dash range -> hyphen.
function clean(s: string): string {
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2") // 20–30 -> 20-30
    .replace(/\s*[–—]\s*/g, ", ") // prose dash -> comma
    .replace(/\s*,\s*,\s*/g, ", ") // collapse accidental double commas
    .replace(/\s+,/g, ",") // no space before comma
    .replace(/,\s*([.!?])/g, "$1"); // ", ." -> "."
}

const TARGETS: Record<string, string[]> = {
  person: ["headline", "bio", "lookingFor", "dealBreakers", "coachBio", "ambassadorTitle"],
  prompt: ["question", "answer"],
  match: ["rationale", "stalledReason", "exitReason"],
  vouch: ["note"],
  reference: ["prompt", "reply"],
  venue: ["notes"],
  conciergeMessage: ["body"],
  dinner: ["theme", "notes"],
  coachingEngagement: ["notes"],
  report: ["detail"],
  note: ["body"],
};

type ScrubDelegate = {
  findMany(args: { select: Record<string, boolean> }): Promise<Array<Record<string, unknown>>>;
  update(args: {
    where: { id: unknown };
    data: Record<string, string>;
  }): Promise<unknown>;
};

async function main() {
  let changed = 0;
  for (const [model, fields] of Object.entries(TARGETS)) {
    const delegate = (prisma as unknown as Record<string, ScrubDelegate>)[model];
    if (!delegate?.findMany) continue;
    const rows = await delegate.findMany({ select: { id: true, ...Object.fromEntries(fields.map((f) => [f, true])) } });
    for (const row of rows) {
      const patch: Record<string, string> = {};
      for (const f of fields) {
        const v = row[f];
        if (typeof v === "string" && /[–—]/.test(v)) {
          const nv = clean(v);
          if (nv !== v) patch[f] = nv;
        }
      }
      if (Object.keys(patch).length) {
        changed++;
        console.log(`${model}#${row.id}:`, Object.entries(patch).map(([k, v]) => `${k}="${v.slice(0, 80)}"`).join("  "));
        if (!DRY) await delegate.update({ where: { id: row.id }, data: patch });
      }
    }
  }
  console.log(DRY ? `\nDRY RUN: ${changed} row(s) would change.` : `\nDONE: ${changed} row(s) updated.`);
  process.exit(0);
}

main();
