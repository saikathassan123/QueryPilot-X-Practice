import { NextRequest, NextResponse } from "next/server";
import { clearSession, sameOrigin } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const response = NextResponse.json({ disconnected: true });
  clearSession(response);
  return response;
}
