import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name || "").trim();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    if (!name || !username || !password) {
      return NextResponse.json(
        { error: "Shop name, username, and password are all required." },
        { status: 400 }
      );
    }
    if (password.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, username, passwordHash, role: "SHOP" },
    });

    const cookie = await createSessionCookie({
      sub: user.id,
      role: user.role,
      name: user.name,
    });

    const res = NextResponse.json(
      { user: { id: user.id, name: user.name, role: user.role } },
      { status: 201 }
    );
    res.cookies.set(cookie);
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Your shop wasn't registered." },
      { status: 500 }
    );
  }
}
