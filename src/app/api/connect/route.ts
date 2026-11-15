import { NextRequest, NextResponse } from "next/server";
import { getPostgresTables, validateSupabaseUri } from "@/lib/database";
import { sameOrigin, saveSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  try {
    const body = await request.json();
    if (typeof body?.uri !== "string") return NextResponse.json({ error: "Enter a database connection string." }, { status: 400 });

    const connection = validateSupabaseUri(body.uri);
    const tables = await getPostgresTables(connection.url);
    if (!tables.length) return NextResponse.json({ error: "No readable public tables were found." }, { status: 400 });

    const response = NextResponse.json({ connected: true, projectName: "Supabase project" });
    saveSession(response, { mode: "postgres", dbUrl: connection.url, projectRef: connection.ref, projectName: "Supabase project" });
    return response;
  } catch {
    return NextResponse.json({ error: "Could not connect. Check your Supabase URI and read-only database permissions." }, { status: 400 });
  }
}
