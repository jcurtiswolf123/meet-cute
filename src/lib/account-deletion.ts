import type { Prisma } from "@prisma/client";

export async function deleteNonOperatorPersonRecord(
  tx: Prisma.TransactionClient,
  personId: string,
): Promise<void> {
  const deleted = await tx.person.deleteMany({
    where: { id: personId, isOperator: false },
  });
  if (deleted.count !== 1) {
    throw new Error("Operator accounts must be revoked before they can be deleted.");
  }
}
