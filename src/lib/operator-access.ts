import { prisma } from "./prisma";
import {
  canRevokeOperatorAccess,
  hasOperatorAccess,
  hasSuperAdminAccess,
} from "./auth";

export type ProvisionOperatorInput = {
  actorId: string;
  email: string;
  name: string;
  city: "NYC" | "SF";
};

export async function provisionOperatorAccount(input: ProvisionOperatorInput) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.person.findUnique({
      where: { id: input.actorId },
      select: { isOperator: true, isSuperAdmin: true },
    });
    if (!hasSuperAdminAccess(actor)) throw new Error("super admins only");

    const existing = await tx.person.findUnique({ where: { email: input.email } });
    if (existing) {
      const privilegeIncreased = !existing.isOperator;
      const person = await tx.person.update({
        where: { id: existing.id },
        data: { isOperator: true },
      });
      if (privilegeIncreased) {
        await Promise.all([
          tx.session.deleteMany({ where: { personId: existing.id } }),
          tx.loginToken.deleteMany({ where: { email: input.email } }),
        ]);
      }
      return person;
    }

    const person = await tx.person.create({
      data: {
        email: input.email,
        name: input.name,
        city: input.city,
        isOperator: true,
        status: "active",
        headline: "Matchmaker",
      },
    });
    await tx.loginToken.deleteMany({ where: { email: input.email } });
    return person;
  });
}

export async function revokeOperatorAccount(actorId: string, targetId: string) {
  return prisma.$transaction(async (tx) => {
    const [actor, target] = await Promise.all([
      tx.person.findUnique({
        where: { id: actorId },
        select: { id: true, isOperator: true, isSuperAdmin: true },
      }),
      tx.person.findUnique({
        where: { id: targetId },
        select: { id: true, isOperator: true, isSuperAdmin: true },
      }),
    ]);

    if (!hasSuperAdminAccess(actor)) throw new Error("super admins only");
    if (!target?.isOperator) throw new Error("Operator not found.");
    if (!canRevokeOperatorAccess(actor, target)) {
      if (actor?.id === target.id) {
        throw new Error("You cannot revoke your own operator access.");
      }
      throw new Error("Super-admin access cannot be revoked here.");
    }

    const person = await tx.person.update({
      where: { id: target.id },
      data: {
        isOperator: false,
        isSuperAdmin: false,
        status: "paused",
        openToMatch: false,
        optedInAt: null,
      },
    });
    await tx.session.deleteMany({ where: { personId: target.id } });
    return person;
  });
}

export async function setNonOperatorMemberStatus(
  actorId: string,
  targetId: string,
  action: "approve" | "decline",
) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.person.findUnique({
      where: { id: actorId },
      select: { isOperator: true, isSuperAdmin: true },
    });
    if (!hasOperatorAccess(actor)) throw new Error("operators only");

    const changed = await tx.person.updateMany({
      where: { id: targetId, isOperator: false },
      data:
        action === "approve"
          ? { status: "active", acceptedAt: new Date() }
          : { status: "exited" },
    });
    if (changed.count !== 1) {
      throw new Error("Operator accounts cannot be changed here.");
    }
    if (action === "decline") {
      await tx.session.deleteMany({ where: { personId: targetId } });
    }
  });
}
