import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  evaluateAdminAccess,
  evaluateProductDeletion,
} from "@/lib/order-business.mjs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  const access = evaluateAdminAccess(session);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: { _count: { select: { items: true } } },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    const { _count, ...details } = product;
    return NextResponse.json({
      product: { ...details, usageCount: _count.items },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data: { name?: string; active?: boolean } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { error: "Product name is required." },
          { status: 400 }
        );
      }
      const existing = await prisma.product.findUnique({ where: { name } });
      if (existing && existing.id !== params.id) {
        return NextResponse.json(
          { error: "A product with this name already exists." },
          { status: 409 }
        );
      }
      data.name = name;
    }

    if (typeof body.active === "boolean") {
      data.active = body.active;
    }

    const product = await prisma.product.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ product });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Your changes weren't saved." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  const access = evaluateAdminAccess(session);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: { _count: { select: { items: true } } },
    });
    const deletion = evaluateProductDeletion(product);
    if (!deletion.allowed) {
      return NextResponse.json(
        {
          error: deletion.error,
          ...(deletion.status === 409 ? { usageCount: deletion.usageCount } : {}),
        },
        { status: deletion.status }
      );
    }

    await prisma.product.delete({ where: { id: params.id } });
    return NextResponse.json({ deleted: true, id: params.id });
  } catch (err) {
    // The foreign key is the final guard if an order references the product
    // after the usage count was checked.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return NextResponse.json(
        {
          error: "This product became part of order history and cannot be deleted. Deactivate it instead.",
        },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. The product wasn't deleted." },
      { status: 500 }
    );
  }
}
