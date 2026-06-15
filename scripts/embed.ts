// Re-embed every member's profile (run after switching embedding providers,
// or after bulk profile edits). Stores vectors as "passage" for asymmetric QA.
import { prisma } from "../src/lib/prisma";
import { embed, hasNvidia, hasOpenAI } from "../src/lib/ai";
import { profileText } from "../src/lib/copilot";

(async () => {
  const provider = hasNvidia ? "NVIDIA" : hasOpenAI ? "OpenAI" : "local lexical";
  console.log(`Embedding provider: ${provider}`);
  const people = await prisma.person.findMany({
    where: { isOperator: false },
    include: { prompts: true },
  });
  let done = 0;
  for (const p of people) {
    const v = await embed(profileText(p), "passage");
    await prisma.person.update({ where: { id: p.id }, data: { embedding: JSON.stringify(v) } });
    done++;
  }
  const sample = await prisma.person.findFirst({ where: { isOperator: false, embedding: { not: null } } });
  console.log(`Embedded ${done} people. Vector dims: ${JSON.parse(sample?.embedding ?? "[]").length}`);
  await prisma.$disconnect();
})();
