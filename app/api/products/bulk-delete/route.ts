import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { bulkDeleteProducts } from "@/lib/product-bulk-delete.mjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { evaluateAdminAccess } from "@/lib/order-business.mjs";
import { withPrivateApiHeaders } from "@/lib/api-response";

export const DELETE = withPrivateApiHeaders(async function DELETE(req: NextRequest) {
  const session = await getSession();
  const access = evaluateAdminAccess(session);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "The product selection request is invalid." },
        { status: 400 }
      );
    }

    const result = await bulkDeleteProducts({
      session,
      ids: (body as { ids?: unknown } | null)?.ids,
      transaction: (work) =>
        prisma.$transaction((tx) =>
          work({
            findProducts: (ids) =>
              tx.product.findMany({
                where: { id: { in: ids } },
                include: { _count: { select: { items: true } } },
              }),
            deleteProducts: (ids) =>
              tx.product.deleteMany({ where: { id: { in: ids } } }),
          })
        ),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ deleted: result.deleted });
  } catch (err) {
    // The foreign key is the final guard if an order references a product
    // after the transaction has checked its order-history count.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return NextResponse.json(
        {
          error:
            "A selected product became part of order history during deletion. No products were deleted. Deactivate it instead.",
        },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. The selected products weren't deleted." },
      { status: 500 }
    );
  }
})
