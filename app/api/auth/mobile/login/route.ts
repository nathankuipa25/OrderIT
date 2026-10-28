import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { MOBILE_SESSION_TTL_SECONDS, signMobileSession } from "@/lib/auth";
import { withPrivateApiHeaders } from "@/lib/api-response";

export const POST = withPrivateApiHeaders(async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    }
    if (user.role !== "SHOP") {
      return NextResponse.json({ error: "This app is for shop accounts only." }, { status: 403 });
    }

    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + MOBILE_SESSION_TTL_SECONDS * 1000);
    const token = await signMobileSession({ sub: user.id, role: user.role, name: user.name }, jti);
    await prisma.mobileSession.create({ data: { id: jti, userId: user.id, expiresAt } });
    const response = NextResponse.json({
      token,
      expiresIn: MOBILE_SESSION_TTL_SECONDS,
      user: { id: user.id, name: user.name, role: user.role },
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
})
