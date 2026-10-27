import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  classifyProductRows,
  parseProductCsv,
  summarizeProductRows,
} from "@/lib/product-csv.mjs";

const MAX_CSV_SIZE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = body?.action;
    if (action !== "preview" && action !== "import") {
      return NextResponse.json(
        { error: 'Choose "preview" or "import".' },
        { status: 400 }
      );
    }
    if (typeof body?.csv !== "string") {
      return NextResponse.json(
        { error: "Choose a CSV file to continue." },
        { status: 400 }
      );
    }
    if (Buffer.byteLength(body.csv, "utf8") > MAX_CSV_SIZE) {
      return NextResponse.json(
        { error: "The CSV file is too large. Maximum size is 5 MB." },
        { status: 413 }
      );
    }

    const parsed = parseProductCsv(body.csv);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const candidateNames = parsed.rows
      .filter((row) => row.name && row.errors.length === 0)
      .map((row) => row.name);
    const existing: Array<{ name: string }> = [];
    for (let offset = 0; offset < candidateNames.length; offset += 1000) {
      const names = candidateNames.slice(offset, offset + 1000);
      existing.push(
        ...(await prisma.product.findMany({
          where: { name: { in: names, mode: "insensitive" } },
          select: { name: true },
        }))
      );
    }
    const rows = classifyProductRows(
      parsed.rows,
      existing.map((product: { name: string }) => product.name)
    );
    const summary = summarizeProductRows(rows);

    if (action === "preview") {
      return NextResponse.json({ rows, summary });
    }

    const ready = rows.filter((row) => row.status === "ready");
    let created = 0;
    for (let offset = 0; offset < ready.length; offset += 5000) {
      const batch = ready.slice(offset, offset + 5000);
      const result = await prisma.product.createMany({
        data: batch.map((row) => ({ name: row.name, active: row.active })),
        skipDuplicates: true,
      });
      created += result.count;
    }

    return NextResponse.json({
      created,
      skippedExisting: summary.alreadyExists,
      skippedDuplicate: summary.duplicateFile,
      invalid: summary.invalid,
      skippedRace: ready.length - created,
      rows,
      summary,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Products weren't imported." },
      { status: 500 }
    );
  }
}
