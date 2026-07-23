import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  provisionOperatorAccount,
  revokeOperatorAccount,
  setNonOperatorMemberStatus,
} from "../src/lib/operator-access";
import { deleteNonOperatorPersonRecord } from "../src/lib/account-deletion";

const suffix = randomUUID();
const fixtureEmail = (label: string) => `${label}-${suffix}@roles.test`;
const fixtureIds: string[] = [];

async function main() {
  try {
    const jess = await prisma.person.findUnique({
      where: { email: "jesswolflord@gmail.com" },
      select: {
        id: true,
        email: true,
        name: true,
        isOperator: true,
        isSuperAdmin: true,
        status: true,
      },
    });
    assert.equal(jess?.isOperator, true);
    assert.equal(jess?.isSuperAdmin, true);
    assert.equal(jess?.status, "active");
    assert.ok(jess?.id);

    const ordinaryOperator = await prisma.person.create({
      data: {
        name: "Role Test Operator",
        email: fixtureEmail("operator"),
        city: "NYC",
        status: "active",
        isOperator: true,
      },
    });
    fixtureIds.push(ordinaryOperator.id);
    const member = await prisma.person.create({
      data: {
        name: "Role Test Member",
        email: fixtureEmail("member"),
        city: "NYC",
        status: "paused",
      },
    });
    fixtureIds.push(member.id);
    const applicant = await prisma.person.create({
      data: {
        name: "Role Test Applicant",
        email: fixtureEmail("applicant"),
        city: "SF",
        status: "applicant",
      },
    });
    fixtureIds.push(applicant.id);

    await prisma.session.create({
      data: {
        tokenHash: randomUUID(),
        personId: member.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.loginToken.create({
      data: {
        tokenHash: randomUUID(),
        email: member.email!,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await assert.rejects(
      provisionOperatorAccount({
        actorId: ordinaryOperator.id,
        email: member.email!,
        name: member.name,
        city: "NYC",
      }),
      /super admins only/,
    );
    await assert.rejects(
      revokeOperatorAccount(jess!.id, member.id),
      /Operator not found/,
    );
    await assert.rejects(
      setNonOperatorMemberStatus(ordinaryOperator.id, jess!.id, "decline"),
      /Operator accounts cannot be changed here/,
    );
    await setNonOperatorMemberStatus(
      ordinaryOperator.id,
      applicant.id,
      "approve",
    );
    const approvedApplicant = await prisma.person.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    assert.equal(approvedApplicant.status, "active");
    assert.ok(approvedApplicant.acceptedAt);
    await assert.rejects(
      setNonOperatorMemberStatus(applicant.id, member.id, "approve"),
      /operators only/,
    );
    await prisma.session.create({
      data: {
        tokenHash: randomUUID(),
        personId: applicant.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await setNonOperatorMemberStatus(jess!.id, applicant.id, "decline");
    const declinedApplicant = await prisma.person.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    assert.equal(declinedApplicant.status, "exited");
    assert.equal(
      await prisma.session.count({ where: { personId: applicant.id } }),
      0,
    );

    const promoted = await provisionOperatorAccount({
      actorId: jess!.id,
      email: member.email!,
      name: member.name,
      city: "NYC",
    });
    assert.equal(promoted.isOperator, true);
    assert.equal(promoted.isSuperAdmin, false);
    assert.equal(promoted.status, "paused");
    assert.equal(await prisma.session.count({ where: { personId: member.id } }), 0);
    assert.equal(await prisma.loginToken.count({ where: { email: member.email! } }), 0);

    const newOperatorEmail = fixtureEmail("new-operator");
    await prisma.loginToken.create({
      data: {
        tokenHash: randomUUID(),
        email: newOperatorEmail,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const created = await provisionOperatorAccount({
      actorId: jess!.id,
      email: newOperatorEmail,
      name: "New Role Test Operator",
      city: "SF",
    });
    fixtureIds.push(created.id);
    assert.equal(created.isOperator, true);
    assert.equal(created.isSuperAdmin, false);
    assert.equal(await prisma.loginToken.count({ where: { email: newOperatorEmail } }), 0);

    await prisma.session.create({
      data: {
        tokenHash: randomUUID(),
        personId: created.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await provisionOperatorAccount({
      actorId: jess!.id,
      email: created.email!,
      name: created.name,
      city: "SF",
    });
    assert.equal(await prisma.session.count({ where: { personId: created.id } }), 1);

    await assert.rejects(
      revokeOperatorAccount(ordinaryOperator.id, created.id),
      /super admins only/,
    );
    await assert.rejects(
      revokeOperatorAccount(jess!.id, jess!.id),
      /cannot revoke your own/i,
    );

    await prisma.session.create({
      data: {
        tokenHash: randomUUID(),
        personId: ordinaryOperator.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const revoked = await revokeOperatorAccount(jess!.id, ordinaryOperator.id);
    assert.equal(revoked.isOperator, false);
    assert.equal(revoked.isSuperAdmin, false);
    assert.equal(revoked.status, "paused");
    assert.equal(revoked.openToMatch, false);
    assert.equal(revoked.optedInAt, null);
    assert.equal(
      await prisma.session.count({ where: { personId: ordinaryOperator.id } }),
      0,
    );

    await assert.rejects(
      prisma.person.create({
        data: {
          name: "Invalid Role Test Account",
          email: fixtureEmail("invalid-super"),
          city: "NYC",
          isOperator: false,
          isSuperAdmin: true,
        },
      }),
    );
    await assert.rejects(
      prisma.$transaction((tx) =>
        deleteNonOperatorPersonRecord(tx, jess!.id),
      ),
      /Operator accounts must be revoked/,
    );
    assert.ok(
      await prisma.person.findUnique({
        where: { id: jess!.id },
        select: { id: true },
      }),
    );
    const deletableMember = await prisma.person.create({
      data: {
        name: "Role Test Deletable Member",
        email: fixtureEmail("deletable"),
        city: "NYC",
      },
    });
    fixtureIds.push(deletableMember.id);
    await prisma.$transaction((tx) =>
      deleteNonOperatorPersonRecord(tx, deletableMember.id),
    );
    assert.equal(
      await prisma.person.count({ where: { id: deletableMember.id } }),
      0,
    );

    console.log("operator role checks passed");
  } finally {
    if (fixtureIds.length > 0) {
      await prisma.person.deleteMany({ where: { id: { in: fixtureIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
