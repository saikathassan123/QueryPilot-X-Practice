import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const databaseDirectory = path.join(process.cwd(), ".local-data");
const databasePath = path.join(databaseDirectory, "querypilot-practice.sqlite");
const migrationDirectory = path.join(process.cwd(), "daily_data_analysis_and_notification", "database", "migrations");
let database: Database.Database | undefined;

function applyMigrations(connection: Database.Database) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrations = readdirSync(migrationDirectory)
    .filter(fileName => /^\d+_.+\.sql$/.test(fileName))
    .sort();

  for (const fileName of migrations) {
    const version = Number(fileName.split("_", 1)[0]);
    const applied = connection.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version);
    if (applied) continue;

    const sql = readFileSync(path.join(migrationDirectory, fileName), "utf8");
    connection.transaction(() => {
      connection.exec(sql);
      connection.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(version, fileName);
    })();
  }
}

function initializeDatabase(connection: Database.Database) {
  connection.pragma("foreign_keys = ON");
  connection.pragma("journal_mode = WAL");
  connection.pragma("busy_timeout = 5000");
  applyMigrations(connection);
}

export function getLocalDatabase() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("The local SQLite database is available only in development mode.");
  }

  if (!database) {
    mkdirSync(databaseDirectory, { recursive: true });
    database = new Database(databasePath);
    initializeDatabase(database);
  }

  return database;
}

export function getLocalDatabasePath() {
  return databasePath;
}
