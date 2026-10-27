import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  allocateNextOrderNumber,
  parseIdempotencyKey,
  resolveIdempotencyReplay,
  validateProductAvailability,
  validateProductIdList,
} from "@/lib/order-business.mjs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const isAdmin = session.role === "ADMIN";
  if (params.get("sync") === "1") {
    if (session.role !== "SHOP") {
      return NextResponse.json(
        { error: "Offline sync is available to shop accounts only." },
        { status: 403 }
      );
    }
    const take = Number(params.get("take") || 100);
    const skip = Number(params.get("skip") || 0);
    if (!Number.isInteger(take) || take < 1 || take > 100 || !Number.isInteger(skip) || skip < 0) {
      return NextResponse.json({ error: "Invalid sync page." }, { status: 400 });
    }
    try {
      const rows = await prisma.order.findMany({
        where: { userId: session.sub },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        skip,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          idempotencyKey: true,
          items: {
            orderBy: { position: "asc" },
            select: {
              productId: true,
              position: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      const hasMore = rows.length > take;
      return NextResponse.json({ orders: hasMore ? rows.slice(0, take) : rows, hasMore });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { error: "Something went wrong loading orders for offline sync." },
        { status: 500 }
      );
    }
  }
  const takeParam = params.get("take");

  try {
    // Lightweight paginated list mode (Home/Orders infinite scroll): returns
    // item counts, not full item+product payloads, and reports hasMore.
    if (takeParam) {
      const take = parseInt(takeParam, 10);
      const skip = parseInt(params.get("skip") || "0", 10);

      const rows = await prisma.order.findMany({
        where: isAdmin ? undefined : { userId: session.sub },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        skip,
        include: {
          _count: { select: { items: true } },
          ...(isAdmin ? { user: { select: { name: true } } } : {}),
        },
      });
      const hasMore = rows.length > take;
      const orders = hasMore ? rows.slice(0, take) : rows;
      return NextResponse.json({ orders, hasMore });
    }

    // Legacy/full mode: complete item + product payload, optional simple limit.
    const limitParam = params.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const orders = await prisma.order.findMany({
      where: isAdmin ? undefined : { userId: session.sub },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        items: { include: { product: true }, orderBy: { position: "asc" } },
        ...(isAdmin ? { user: { select: { name: true } } } : {}),
      },
    });
    return NextResponse.json({ orders });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong loading orders." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }
  if (session.role !== "SHOP") {
    return NextResponse.json(
      { error: "Only shop accounts can create orders." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const selection = validateProductIdList(body?.productIds);
    if (!selection.ok) {
      return NextResponse.json(
        { error: selection.error },
        { status: selection.status }
      );
    }
    const ids = selection.productIds;
    const keyValidation = parseIdempotencyKey(body);
    if (!keyValidation.ok) {
      return NextResponse.json({ error: keyValidation.error }, { status: 400 });
    }
    const idempotencyKey = keyValidation.key;

    let replayed = false;
    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const nextNumber = await allocateNextOrderNumber(tx);

      if (idempotencyKey) {
        const existing = await tx.order.findUnique({
          where: { idempotencyKey },
          include: {
            items: { include: { product: true }, orderBy: { position: "asc" } },
          },
        });
        const decision = resolveIdempotencyReplay(existing, session.sub, ids);
        if (decision.kind === "conflict") {
          throw new OrderRequestError(decision.message, 409);
        }
        if (decision.kind === "replay") {
          replayed = true;
          return decision.order;
        }
      }

      // Lock the selected catalog rows before checking status so a concurrent
      // deactivation cannot slip between validation and order creation.
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`;
      const products = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, active: true },
      });
      const availability = validateProductAvailability(ids, products);
      if (!availability.ok) {
        throw new OrderRequestError(availability.error, availability.status);
      }

      return tx.order.create({
        data: {
          orderNumber: nextNumber,
          userId: session.sub,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          items: {
            create: ids.map((productId, position) => ({
              productId,
              position,
            })),
          },
        },
        include: {
          items: { include: { product: true }, orderBy: { position: "asc" } },
        },
      });
    });

    return NextResponse.json({ order }, { status: replayed ? 200 : 201 });
  } catch (err) {
    if (err instanceof OrderRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Your order wasn't created." },
      { status: 500 }
    );
  }
}

class OrderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OrderRequestError";
  }
}
