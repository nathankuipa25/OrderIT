import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json({ product });
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
