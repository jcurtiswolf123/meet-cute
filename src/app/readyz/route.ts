import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function databaseReady(): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '2000ms'");
      await tx.deliveryJob.findFirst({ select: { leaseToken: true } });
      await tx.photoAsset.findFirst({ select: { photoId: true } });
    },
    { maxWait: 1_000, timeout: 2_500 },
  );
}

export async function GET() {
  try {
    await databaseReady();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
