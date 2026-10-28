import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { evaluateAdminAccess } from "@/lib/order-business.mjs";
import {
  validateBackupAcknowledgement,
  executeScopedReset,
  getResetAvailability,
  RESET_CONFIRMATION,
  validateResetConfirmation,
  verifyResetBackup,
  type ResetSnapshot,
} from "@/lib/admin-reset.mjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { withPrivateApiHeaders } from "@/lib/api-response";

export const runtime = "nodejs";

function getAvailability() {
  return getResetAvailability({
    nodeEnv: process.env.NODE_ENV || "development",
    enabledFlag: process.env.ORDERIT_RESET_ENABLED,
    secretConfigured: Boolean(process.env.JWT_SECRET),
  });
}

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

function adminError(session: Awaited<ReturnType<typeof getSession>>) {
  const access = evaluateAdminAccess(session);
  if (access.allowed) return null;
  return NextResponse.json({ error: access.error }, { status: access.status });
}

export const GET = withPrivateApiHeaders(async function GET() {
  const session = await getSession();
  const denied = adminError(session);
  if (denied) return denied;

  const availability = getAvailability();
  return NextResponse.json(availability, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
})

export const POST = withPrivateApiHeaders(async function POST(req: NextRequest) {
  const session = await getSession();
  const denied = adminError(session);
  if (denied) return denied;

  const availability = getAvailability();
  if (!availability.available) {
    return NextResponse.json(
      { error: availability.reason },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  let body: { confirmation?: unknown; backupToken?: unknown; backupSaved?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request is required." }, { status: 400 });
  }
  if (!validateResetConfirmation(body?.confirmation)) {
    return NextResponse.json(
      { error: `Type ${RESET_CONFIRMATION} exactly to confirm this reset.` },
      { status: 400 }
    );
  }
  if (!validateBackupAcknowledgement(body?.backupSaved)) {
    return NextResponse.json(
      { error: "Confirm that the generated backup file was saved before resetting." },
      { status: 400 }
    );
  }
  if (typeof body?.backupToken !== "string" || !body.backupToken) {
    return NextResponse.json(
      { error: "Create and download a fresh backup before resetting." },
      { status: 400 }
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
    const deleted = await prisma.$transaction(
      async (tx) => {
        // Block concurrent catalog/order writes while checking that the backup
        // still matches, then keep the check and deletion in the same transaction.
        await tx.$executeRaw`LOCK TABLE "Product", "Order", "OrderItem" IN ACCESS EXCLUSIVE MODE`;
        const currentSnapshot = await collectSnapshot(tx);
        const backupCheck = verifyResetBackup(
          body.backupToken as string,
          secret,
          currentSnapshot
        );
        if (!backupCheck.ok) {
          throw new ResetRequestError(backupCheck.error, backupCheck.status);
        }
        return executeScopedReset(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json(
      {
        ok: true,
        deleted,
        preserved: ["shop accounts", "admin accounts", "all user records"],
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (err) {
    if (err instanceof ResetRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err.code === "P2034" || err.code === "40001")
    ) {
      return NextResponse.json(
        { error: "The data changed during the reset. Create a fresh backup and try again." },
        { status: 409 }
      );
    }
    console.error("Admin product/order reset failed:", err);
    return NextResponse.json(
      { error: "The reset failed and was rolled back. No data was intentionally left partially reset." },
      { status: 500 }
    );
  }
})

class ResetRequestError extends Error {
  constructor(message: string, readonly status: 400 | 409) {
    super(message);
    this.name = "ResetRequestError";
  }
}
