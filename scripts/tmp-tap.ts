import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma";
import { saveRecommenders, recommendationUrl } from "../src/lib/recommendations";

async function main() {
  console.log("host:", new URL(process.env.DATABASE_URL!).hostname);
  const a = await prisma.person.create({ data: { name: "QA Tap Applicant", email: `joshcurtiswolf+qa-tap-${randomUUID().slice(0,8)}@gmail.com`, city: "NYC", gender: "man", status: "applicant", appliedAt: new Date() } });
  const [r] = await saveRecommenders(a.id, [{ name: "QA Tapper", email: `joshcurtiswolf+qa-tapper-${randomUUID().slice(0,8)}@gmail.com`, gender: "woman" }]);

  const b = await chromium.launch({ headless: true });
  const errs: string[] = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errs.push(`pageerror ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errs.push(`console ${m.text().slice(0,100)}`); });

  await p.goto(recommendationUrl(r.token), { waitUntil: "networkidle" });
  await p.getByRole("heading", { name: /asked you to vouch/ }).waitFor();
  console.log("page renders on mobile");

  await p.getByRole("button", { name: /Yes, I vouch for QA/ }).click();
  await p.getByText(/is vouched for by you/).waitFor();
  const afterTap = await prisma.recommendation.findUniqueOrThrow({ where: { token: r.token } });
  console.log("after tap:", afterTap.status, "| endorsedAt:", !!afterTap.endorsedAt, "| body:", afterTap.body ?? "(none)");

  await p.getByLabel(/What would you say about/).fill("She is the friend everyone calls first, written after tapping, as a production check.");
  await p.getByRole("button", { name: "Add my words" }).click();
  await p.getByRole("heading", { name: /Thank you,/ }).waitFor();
  const afterWords = await prisma.recommendation.findUniqueOrThrow({ where: { token: r.token } });
  console.log("after words:", afterWords.status, "| body:", (afterWords.body ?? "").slice(0, 50));

  // The token is single use: reopening must not offer to overwrite.
  await p.goto(recommendationUrl(r.token), { waitUntil: "networkidle" });
  console.log("reopened shows thanks:", await p.getByRole("heading", { name: /Thank you,/ }).isVisible());

  await b.close();
  console.log(errs.length ? `ISSUES: ${[...new Set(errs)].join(" | ")}` : "no console or page errors");

  await prisma.vouch.deleteMany({ where: { OR: [{ voucherId: a.id }, { subjectId: a.id }] } });
  await prisma.person.delete({ where: { id: a.id } });
  console.log("cleaned up tap applicant");
  await prisma.$disconnect();
}
main();
