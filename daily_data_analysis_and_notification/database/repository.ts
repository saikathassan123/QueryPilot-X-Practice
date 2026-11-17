import { getLocalDatabase } from "./sqlite-client";
import { LocalSqliteSalesRepository } from "./local-sqlite-sales-repository";
import { createSupabaseSalesRepository, SupabaseSalesRepository, type DatasetSelection } from "./supabase-sales-repository";

export function getSalesRepository() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Local SQLite sales repository is available only in development mode.");
  }
  return new LocalSqliteSalesRepository(getLocalDatabase());
}

export { createSupabaseSalesRepository, SupabaseSalesRepository, type DatasetSelection };
