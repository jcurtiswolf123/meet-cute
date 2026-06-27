/**
 * Reset the Maya ↔ Alex demo match and print one-click sign-in links.
 *
 *   npm run demo:setup
 *   npm run demo:setup -- --base=http://localhost:3009
 */
import { execSync } from "node:child_process";

const base = (
  process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3009"
).replace(/\/$/, "");

const emails = ["jesswolflord@gmail.com", "maya@meetcute.test", "alex@meetcute.test"];

execSync("tsx scripts/test-fixture.ts", { stdio: "inherit", cwd: import.meta.dirname + "/.." });

console.log("\n--- Demo sign-in links (single-use, 15 min) ---\n");
console.log("Use three separate browsers or incognito windows.\n");

for (const email of emails) {
  execSync(`tsx scripts/login-link.ts ${email} --base=${base}`, {
    stdio: "inherit",
    cwd: import.meta.dirname + "/..",
  });
  console.log();
}

console.log("--- Demo walkthrough ---\n");
console.log("1. Maya  → /app          → For you → Yes, introduce us");
console.log("2. Alex  → /app          → For you → Yes, introduce us  (now mutual)");
console.log("3. Jessica → /studio      → Pipeline → match advances; try Co-pilot");
console.log("\nDev picker (no links): http://localhost:3009/studio/login");
console.log("Reset anytime: npm run demo:setup\n");
