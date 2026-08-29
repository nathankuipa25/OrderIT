import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { items: { include: { product: true } } },
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
