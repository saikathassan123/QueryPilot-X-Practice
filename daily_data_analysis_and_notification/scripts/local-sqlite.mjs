import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const databaseDirectory = path.join(root, ".local-data");
const databasePath = path.join(databaseDirectory, "querypilot-practice.sqlite");
const migrationDirectory = path.join(root, "daily_data_analysis_and_notification", "database", "migrations");
const localDevDirectory = path.join(root, "daily_data_analysis_and_notification", "database", "local-dev");
const allowedFiles = new Set([
  "schema.sql",
  "initial_demo_data.sql",
  "day_01_test_data.sql",
  "day_02_test_data.sql",
  "day_03_test_data.sql",
  "day_04_test_data.sql",
  "day_05_test_data.sql",
  "day_06_test_data.sql",
  "day_07_test_data.sql"
]);

const fileName = process.argv[2];
if (!fileName || !allowedFiles.has(fileName)) {
  console.error(`Usage: node scripts/local-sqlite.mjs <${[...allowedFiles].join("|")}>`);
  process.exit(1);
}

function applyMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrations = readdirSync(migrationDirectory)
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort();

  for (const name of migrations) {
    const version = Number(name.split("_", 1)[0]);
    if (database.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version)) continue;
    const sql = readFileSync(path.join(migrationDirectory, name), "utf8");
    database.transaction(() => {
      database.exec(sql);
      database.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(version, name);
    })();
  }
}

mkdirSync(databaseDirectory, { recursive: true });
const database = new Database(databasePath);
database.pragma("foreign_keys = ON");
database.pragma("journal_mode = WAL");
database.pragma("busy_timeout = 5000");
applyMigrations(database);

if (fileName !== "schema.sql") {
  database.exec(readFileSync(path.join(localDevDirectory, fileName), "utf8"));
}

database.close();
console.log(`Executed ${fileName} against ${databasePath}`);
