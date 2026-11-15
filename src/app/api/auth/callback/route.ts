import { NextRequest, NextResponse } from "next/server";
import { clearOAuthState, readOAuthState, saveSession } from "@/lib/session";
import { exchangeCode, listProjects } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || request.nextUrl.origin;

  function fail(message: string) {
    const response = NextResponse.redirect(new URL("/?error=" + encodeURIComponent(message), appUrl));
    clearOAuthState(response);
    return response;
  }

  if (request.nextUrl.searchParams.has("error")) return fail("Supabase authorization was cancelled.");

  const state = await readOAuthState();
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  if (!state || !code || returnedState !== state.state) return fail("Authorization expired. Please try again.");

  try {
    const tokens = await exchangeCode(code, state.verifier, new URL("/api/auth/callback", appUrl).toString());
    const projects = await listProjects(tokens.accessToken);
    if (!projects.length) return fail("No accessible Supabase projects were found.");

    const response = NextResponse.redirect(new URL("/?setup=project", appUrl));
    saveSession(response, { mode: "oauth", projects, ...tokens });
    clearOAuthState(response);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not connect to Supabase.");
  }
}
