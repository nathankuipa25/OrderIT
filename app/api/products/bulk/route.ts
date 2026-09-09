import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const active = Boolean(body?.active);

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Select at least one product." },
        { status: 400 }
      );
    }

    const result = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { active },
    });

    return NextResponse.json({ updated: result.count });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Products weren't updated." },
      { status: 500 }
    );
  }
}
