import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { saveOAuthState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || request.nextUrl.origin;
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!process.env.APP_URL || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?error=Supabase%20OAuth%20is%20not%20configured", appUrl));
  }

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = new URL("/api/auth/callback", appUrl).toString();
  const url = new URL("https://api.supabase.com/v1/oauth/authorize");

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(url);
  saveOAuthState(response, { state, verifier, issuedAt: Date.now() });
  return response;
}
