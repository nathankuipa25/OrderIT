import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revokeMobileSession } from "@/lib/mobile-session.mjs";
import { withPrivateApiHeaders } from "@/lib/api-response";

function privateJson(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

export const POST = withPrivateApiHeaders(async function POST() {
  try {
    const session = await getSession();
    if (!session?.jti) return privateJson({ error: "Please log in." }, 401);

    await revokeMobileSession(session, async ({ id, userId }) => {
      const result = await prisma.mobileSession.updateMany({
        where: { id, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result.count > 0;
    });

    // A concurrent logout may have revoked the same token first; the token is still inactive.
    return privateJson({ ok: true });
  } catch (error) {
    console.error(error);
    return privateJson({ error: "The shop session could not be revoked. Please try again." }, 500);
  }
})
