import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const isAdmin = session.role === "ADMIN";
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
        items: { include: { product: true } },
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
    const productIds: string[] = Array.isArray(body?.productIds)
      ? body.productIds
      : [];

    if (productIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one product." },
        { status: 400 }
      );
    }

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "One or more selected products are invalid." },
        { status: 400 }
      );
    }

    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const last = await tx.order.findFirst({
        orderBy: { orderNumber: "desc" },
        select: { orderNumber: true },
      });
      const nextNumber = (last?.orderNumber ?? 0) + 1;

      return tx.order.create({
        data: {
          orderNumber: nextNumber,
          userId: session.sub,
          items: {
            create: productIds.map((productId) => ({ productId })),
          },
        },
        include: { items: { include: { product: true } } },
      });
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Your order wasn't created." },
      { status: 500 }
    );
  }
}
