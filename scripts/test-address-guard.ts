// The addresses that actually hard-bounced off this domain in its first sixteen
// days, and the ones that must keep going out. Pure: no database, no network.
import assert from "node:assert/strict";

import { undeliverableReason } from "../src/lib/email";

const REFUSE: [string, string][] = [
  ["tbd@tbd.com", "placeholder"],
  ["tbd@tbd2.com", "placeholder with a digit"],
  ["someone@example.com", "reserved example domain"],
  ["new-operator-196d7e9e@roles-e2e.test", "reserved .test TLD"],
  ["a@b.local", "reserved .local TLD"],
  ["rimaapril7@gmail.con", "gmail typo"],
  ["zeinaamhaz@gmail.cl", "gmail typo"],
  ["someone@gmial.com", "transposed gmail"],
  ["someone@outlook.co", "clipped outlook"],
  ["no-at-sign.com", "not an address"],
  ["two@@at.com", "not an address"],
  ["trailing@dot.", "not an address"],
];

const ALLOW = [
  "joshcurtiswolf@gmail.com",
  "Mutuals <hello@hellomutuals.com>",
  "first.last+tag@sub.domain.co.uk",
  "someone@gmail.com",
  "someone@fastmail.com",
  // A real .cl address is Chile, not a typo, as long as it is not one edit from
  // a big mailbox provider.
  "someone@universidad.cl",
  "zaki@iqlusion.io",
];

for (const [addr, why] of REFUSE) {
  const reason = undeliverableReason(addr);
  assert.ok(reason, `expected ${addr} to be refused (${why})`);
}
for (const addr of ALLOW) {
  const reason = undeliverableReason(addr);
  assert.equal(reason, null, `expected ${addr} to be allowed, got: ${reason}`);
}

console.log(`address guard: ${REFUSE.length} refused, ${ALLOW.length} allowed`);
