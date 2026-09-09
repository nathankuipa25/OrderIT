import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const rawNames: string[] = Array.isArray(body?.names) ? body.names : [];

    // Clean, de-duplicate (case-insensitive) within the submitted batch.
    const seen = new Set<string>();
    const names: string[] = [];
    for (const raw of rawNames) {
      const name = String(raw || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }

    if (names.length === 0) {
      return NextResponse.json(
        { error: "No valid product names found in the file." },
        { status: 400 }
      );
    }

    const existing = await prisma.product.findMany({
      where: { name: { in: names } },
      select: { name: true },
    });
    const existingLower = new Set(
      existing.map((p: { name: string }) => p.name.toLowerCase())
    );

    const toCreate = names.filter((n) => !existingLower.has(n.toLowerCase()));

    if (toCreate.length > 0) {
      await prisma.product.createMany({
        data: toCreate.map((name) => ({ name })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      created: toCreate.length,
      skipped: names.length - toCreate.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Products weren't imported." },
      { status: 500 }
    );
  }
}
