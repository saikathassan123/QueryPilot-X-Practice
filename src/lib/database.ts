import { Client } from "pg";

export type Table = { name: string; columns: string[] };

export function validateSupabaseUri(value: string, projectRef?: string) {
  if (value.length > 1500) throw new Error("Connection string is too long.");

  let uri: URL;
  try {
    uri = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid PostgreSQL connection string.");
  }

  if (!["postgres:", "postgresql:"].includes(uri.protocol)) throw new Error("A PostgreSQL connection string is required.");
  if (!uri.hostname || !uri.username || !uri.password) throw new Error("Database credentials are missing.");
  if (uri.port && !["5432", "6543"].includes(uri.port)) throw new Error("Unsupported database port.");
  if (uri.pathname !== "/postgres") throw new Error("Connect to the postgres database.");
  if ([...uri.searchParams.keys()].some(k => k !== "sslmode")) throw new Error("Unsupported connection option.");
  if (uri.searchParams.has("sslmode") && !["require", "verify-full", "verify-ca"].includes(uri.searchParams.get("sslmode") || "")) {
    throw new Error("SSL must be enabled.");
  }

  const host = uri.hostname.toLowerCase();
  const direct = /^db\.([a-z0-9-]{10,40})\.supabase\.co$/.exec(host);
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host);
  const match = pooler ? /\.([a-z0-9-]{10,40})$/.exec(decodeURIComponent(uri.username)) : null;
  const ref = direct?.[1] || match?.[1];

  if (!ref) throw new Error("Only Supabase PostgreSQL connections are supported.");
  if (projectRef && ref !== projectRef) throw new Error("This connection belongs to a different project.");

  return { url: value.trim(), ref };
}

export async function getPostgresTables(connectionString: string): Promise<Table[]> {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 6500,
    query_timeout: 12000
  });

  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '9000ms'");
    const result = await client.query<{ table_name: string; column_name: string }>(
      "SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON c.table_schema = t.table_schema AND c.table_name = t.table_name WHERE c.table_schema = 'public' AND t.table_type IN ('BASE TABLE', 'VIEW') ORDER BY c.table_name, c.ordinal_position LIMIT 500"
    );
    await client.query("ROLLBACK");

    const tables = new Map<string, string[]>();
    for (const row of result.rows) {
      if (!tables.has(row.table_name)) tables.set(row.table_name, []);
      tables.get(row.table_name)?.push(row.column_name);
    }
    return [...tables].map(([name, columns]) => ({ name, columns }));
  } finally {
    await client.end().catch(() => undefined);
  }
}
