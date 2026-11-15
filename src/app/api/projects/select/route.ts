import { NextRequest, NextResponse } from "next/server";
import { readSession, sameOrigin, saveSession } from "@/lib/session";
import { getOAuthTables, refreshSession } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  try {
    const body = await request.json();
    const current = await readSession();
    if (!current || current.mode !== "oauth" || typeof body.projectRef !== "string") {
      return NextResponse.json({ error: "Authorize Supabase first." }, { status: 401 });
    }

    const project = current.projects?.find(p => p.id === body.projectRef);
    if (!project) return NextResponse.json({ error: "Project is not authorized." }, { status: 403 });

    const access = await refreshSession(current);
    const session = { ...access.session, projectRef: project.id, projectName: project.name };
    const tables = await getOAuthTables(session);
    if (!tables.length) return NextResponse.json({ error: "No readable public tables were found." }, { status: 400 });

    const response = NextResponse.json({ connected: true, projectName: project.name });
    const { issuedAt, ...data } = session;
    saveSession(response, data);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connection failed." }, { status: 400 });
  }
}
