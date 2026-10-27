import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { serializeProductCsv } from "@/lib/product-csv.mjs";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  try {
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
      select: { name: true, active: true },
    });
    const csv = serializeProductCsv(products);

    return new NextResponse(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="orderit-products.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong exporting products." },
      { status: 500 }
    );
  }
}
