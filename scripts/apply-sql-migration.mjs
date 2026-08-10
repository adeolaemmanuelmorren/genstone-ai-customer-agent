#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const migrationPath = process.argv[2];
const databaseUrl = process.env.PLANETSCALE_DATABASE_URL;

if (!migrationPath) {
  console.error("Usage: node scripts/apply-sql-migration.mjs <migration.sql>");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("Set PLANETSCALE_DATABASE_URL before applying migrations.");
  process.exit(1);
}

const resolvedMigrationPath = resolve(process.cwd(), migrationPath);
const sql = await readFile(resolvedMigrationPath, "utf8");
const client = new Client({
  connectionString: normalizePlanetScaleConnectionString(databaseUrl),
});

try {
  await client.connect();
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log(`Applied ${migrationPath}`);
} catch (error) {
  await rollback(client);
  console.error(`Failed to apply ${migrationPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}

async function rollback(client) {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the migration error, which is more useful than rollback failure.
  }
}

function normalizePlanetScaleConnectionString(value) {
  const url = new URL(value);

  // libpq uses `sslrootcert=system` to select the operating-system trust store.
  // Node uses that trust store by default and otherwise treats `system` as a
  // certificate filename. Keep verify-full and remove only that libpq hint.
  if (url.searchParams.get("sslrootcert") === "system") {
    url.searchParams.delete("sslrootcert");
  }

  return url.toString();
}
