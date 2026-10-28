import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withPrivateApiHeaders } from "@/lib/api-response";

export const GET = withPrivateApiHeaders(async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }
  return NextResponse.json({
    user: { id: session.sub, name: session.name, role: session.role },
  });
})
