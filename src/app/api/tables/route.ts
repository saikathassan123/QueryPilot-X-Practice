import { NextResponse } from "next/server";
import { getPostgresTables } from "@/lib/database";
import { readSession, saveSession } from "@/lib/session";
import { getOAuthTables, refreshSession } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const current = await readSession();
  if (!current || (!current.dbUrl && !current.projectRef)) {
    return NextResponse.json({ error: "No database connected." }, { status: 401 });
  }

  try {
    const access = current.mode === "oauth" ? await refreshSession(current) : { session: current, refreshed: false };
    const session = access.session;
    const tables = session.mode === "oauth" ? await getOAuthTables(session) : await getPostgresTables(session.dbUrl || "");
    const response = NextResponse.json({ tables }, { headers: { "Cache-Control": "no-store" } });

    if (access.refreshed) {
      const { issuedAt, ...data } = session;
      saveSession(response, data);
    }
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to read database tables." }, { status: 400 });
  }
}
