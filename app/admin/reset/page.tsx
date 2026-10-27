import { redirect } from "next/navigation";
import { evaluateAdminAccess } from "@/lib/order-business.mjs";
import { getSession } from "@/lib/session";
import ResetConsole from "./ResetConsole";

export const dynamic = "force-dynamic";

export default async function AdminResetPage() {
  const session = await getSession();
  const access = evaluateAdminAccess(session);
  if (!access.allowed) {
    redirect(session ? "/" : "/login");
  }
  return <ResetConsole />;
}
