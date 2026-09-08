import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const activeOnly = params.get("active") === "true";
  const q = params.get("q")?.trim() || "";
  const takeParam = params.get("take");
  const skipParam = params.get("skip");
  const take = takeParam ? parseInt(takeParam, 10) : undefined;
  const skip = skipParam ? parseInt(skipParam, 10) : 0;

  const where = {
    ...(activeOnly ? { active: true } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  try {
    // Unpaginated callers (Create Order product picker, order review preview)
    // keep getting the full list, unchanged.
    if (take === undefined) {
      const products = await prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ products });
    }

    // Paginated callers (Products management list) get one page + whether
    // there's more to lazily load.
    const rows = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: take + 1,
      skip,
    });
    const hasMore = rows.length > take;
    const products = hasMore ? rows.slice(0, take) : rows;
    return NextResponse.json({ products, hasMore });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong loading products." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = String(body?.name || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Product name is required." },
        { status: 400 }
      );
    }

    const existing = await prisma.product.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { error: "A product with this name already exists." },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({ data: { name } });
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Your product wasn't added." },
      { status: 500 }
    );
  }
}
