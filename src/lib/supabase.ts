import type { Project, Session } from "./session";
import type { Table } from "./database";

const base = "https://api.supabase.com";

function authorization() {
  const id = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const secret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Supabase OAuth is not configured.");
  return "Basic " + Buffer.from(id + ":" + secret).toString("base64");
}

function readTokens(data: unknown) {
  const token = data as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token || !token.access_token || !token.refresh_token) throw new Error("Authorization failed.");
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (Number(token.expires_in) || 3600) * 1000
  };
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const response = await fetch(base + "/v1/oauth/token", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(14000),
    headers: { Authorization: authorization(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier })
  });
  if (!response.ok) throw new Error("Supabase did not authorize this connection.");
  return readTokens(await response.json());
}

export async function listProjects(token: string): Promise<Project[]> {
  const response = await fetch(base + "/v1/projects", {
    cache: "no-store",
    signal: AbortSignal.timeout(14000),
    headers: { Authorization: "Bearer " + token }
  });
  if (!response.ok) throw new Error("Cannot load Supabase projects. Check OAuth permissions.");
  const value: unknown = await response.json();
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === "object")
    .map(item => ({ id: String(item.ref || item.id || ""), name: String(item.name || "Supabase project").slice(0, 65) }))
    .filter(item => /^[a-z0-9-]{8,40}$/.test(item.id))
    .slice(0, 12);
}

export async function refreshSession(session: Session) {
  if (!session.accessToken || !session.refreshToken) throw new Error("Supabase authorization is missing.");
  if (!session.expiresAt || Date.now() < session.expiresAt - 90000) return { session, refreshed: false };

  const response = await fetch(base + "/v1/oauth/token", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(14000),
    headers: { Authorization: authorization(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken })
  });
  if (!response.ok) throw new Error("Authorization expired. Connect to Supabase again.");
  return { session: { ...session, ...readTokens(await response.json()) }, refreshed: true };
}

export async function getOAuthTables(session: Session): Promise<Table[]> {
  if (session.mode !== "oauth" || !session.projectRef || !session.accessToken) throw new Error("Select a Supabase project.");
  if (!/^[a-z0-9-]{8,40}$/.test(session.projectRef)) throw new Error("Invalid project.");

  const query = "SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON c.table_schema = t.table_schema AND c.table_name = t.table_name WHERE c.table_schema = 'public' AND t.table_type IN ('BASE TABLE', 'VIEW') ORDER BY c.table_name, c.ordinal_position LIMIT 500";
  const response = await fetch(base + "/v1/projects/" + session.projectRef + "/database/query/read-only", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(24000),
    headers: { Authorization: "Bearer " + session.accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    console.error("Supabase read-only database request failed:", response.status);
    if (response.status === 401) throw new Error("Supabase authorization expired. Disconnect and authorize again. (HTTP 401)");
    if (response.status === 403) throw new Error("Database access was denied. Enable Database: Read in your Supabase OAuth app, then authorize again. (HTTP 403)");
    if (response.status === 404) throw new Error("The selected Supabase project or read-only API endpoint was not found. Check the project reference or use a manual connection. (HTTP 404)");
    if (response.status === 429) throw new Error("Supabase is rate limiting database requests. Try again shortly. (HTTP 429)");
    throw new Error(`Supabase database request failed (HTTP ${response.status}). Check database access or try a manual connection.`);
  }
  const data: unknown = await response.json();
  const rows: unknown = Array.isArray(data) ? data : (data as { result?: unknown; rows?: unknown; data?: unknown })?.result ?? (data as { rows?: unknown })?.rows ?? (data as { data?: unknown })?.data;
  if (!Array.isArray(rows)) throw new Error("Supabase returned an unexpected response.");

  const tables = new Map<string, string[]>();
  for (const row of rows) {
    if (!row || typeof row.table_name !== "string" || typeof row.column_name !== "string") continue;
    if (!tables.has(row.table_name)) tables.set(row.table_name, []);
    tables.get(row.table_name)?.push(row.column_name);
  }
  return [...tables].map(([name, columns]) => ({ name, columns }));
}
