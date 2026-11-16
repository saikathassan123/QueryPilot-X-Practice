import { getLocalDatabase } from "./sqlite-client";
import { LocalSqliteSalesRepository } from "./local-sqlite-sales-repository";

export function getSalesRepository() {
  return new LocalSqliteSalesRepository(getLocalDatabase());
}
