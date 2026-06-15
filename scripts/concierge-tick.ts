// Cron entrypoint: run every ~15 min. Sends morning-of reminders, post-date
// check-ins, hold-expiry nudges, and flags stalled threads to a matchmaker.
import { tick } from "../src/lib/concierge";
import { prisma } from "../src/lib/prisma";

(async () => {
  const log = await tick(new Date());
  console.log(log.length ? log.join("\n") : "concierge tick: nothing to do");
  await prisma.$disconnect();
})();
