import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type Project = { id: string; name: string };

export type Session = {
  mode: "oauth" | "postgres";
  projectName?: string;
  projectRef?: string;
  dbUrl?: string;
  projects?: Project[];
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  issuedAt: number;
};

type OAuthState = { state: string; verifier: string; issuedAt: number };

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return scryptSync(secret, "smart-data-session", 32);
}

function encrypt(data: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const value = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), value]).toString("base64url");
}

function decrypt<T>(value?: string): T | null {
  if (!value) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const text = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    return JSON.parse(text.toString("utf8")) as T;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

export async function readSession() {
  const jar = await cookies();
  const session = decrypt<Session>(jar.get("smart_data_session")?.value);
  if (!session || Date.now() - session.issuedAt > 7 * 86400000) return null;
  return session;
}

export function saveSession(response: NextResponse, data: Omit<Session, "issuedAt">) {
  const value = encrypt({ ...data, issuedAt: Date.now() });
  if (value.length > 3700) throw new Error("Session is too large. Connect with a different project.");
  response.cookies.set("smart_data_session", value, cookieOptions(7 * 86400));
}

export function clearSession(response: NextResponse) {
  response.cookies.set("smart_data_session", "", cookieOptions(0));
}

export async function readOAuthState() {
  const jar = await cookies();
  const state = decrypt<OAuthState>(jar.get("smart_data_oauth")?.value);
  if (!state || Date.now() - state.issuedAt > 600000) return null;
  return state;
}

export function saveOAuthState(response: NextResponse, state: OAuthState) {
  response.cookies.set("smart_data_oauth", encrypt(state), cookieOptions(600));
}

export function clearOAuthState(response: NextResponse) {
  response.cookies.set("smart_data_oauth", "", cookieOptions(0));
}

export function oauthReady() {
  return Boolean(process.env.APP_URL && process.env.SUPABASE_OAUTH_CLIENT_ID && process.env.SUPABASE_OAUTH_CLIENT_SECRET);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
  return origin === expected;
}
