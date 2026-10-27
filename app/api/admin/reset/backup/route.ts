import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { evaluateAdminAccess } from "@/lib/order-business.mjs";
import {
  createResetBackup,
  getResetAvailability,
  type ResetSnapshot,
} from "@/lib/admin-reset.mjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

async function collectSnapshot(
  client: Pick<Prisma.TransactionClient, "product" | "order">
): Promise<ResetSnapshot> {
  const [products, orders] = await Promise.all([
    client.product.findMany({ orderBy: { id: "asc" } }),
    client.order.findMany({
      orderBy: { id: "asc" },
      include: { items: { orderBy: { id: "asc" } } },
    }),
  ]);
  return { products, orders };
}

export async function POST() {
  const session = await getSession();
  const access = evaluateAdminAccess(session);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const availability = getResetAvailability({
    nodeEnv: process.env.NODE_ENV || "development",
    enabledFlag: process.env.ORDERIT_RESET_ENABLED,
    secretConfigured: Boolean(process.env.JWT_SECRET),
  });
  if (!availability.available) {
    return NextResponse.json(
      { error: availability.reason },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "JWT_SECRET must be configured to protect reset backup authorization." },
      { status: 503 }
    );
  }

  try {
    const snapshot = await prisma.$transaction(
      (tx) => collectSnapshot(tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    const { backup, token } = createResetBackup(snapshot, secret);
    const filename = `orderit-reset-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-OrderIT-Reset-Backup-Token": token,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("Could not create admin reset backup:", err);
    return NextResponse.json(
      { error: "The backup could not be created. Nothing was reset." },
      { status: 500 }
    );
  }
}
