#!/usr/bin/env npx ts-node
// Migrate existing JSON data to Postgres
// Run: npx ts-node migrate.ts

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { migrateFromJson, checkConnection, closePool } from './db';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

async function main() {
  console.log('[migrate] Checking database connection...');
  const ok = await checkConnection();
  if (!ok) {
    console.error('[migrate] Cannot connect to database. Set DATABASE_URL.');
    process.exit(1);
  }
  console.log('[migrate] Connected.');

  // Load users.json
  const usersPath = join(DATA_DIR, 'users.json');
  if (!existsSync(usersPath)) {
    console.log('[migrate] No users.json found. Nothing to migrate.');
    await closePool();
    return;
  }

  const usersJson = JSON.parse(readFileSync(usersPath, 'utf-8'));
  const count = Object.keys(usersJson).length;
  console.log(`[migrate] Found ${count} users in users.json`);

  const result = await migrateFromJson(usersJson);
  console.log(`[migrate] Imported: ${result.imported}/${count}`);
  if (result.errors.length > 0) {
    console.log(`[migrate] Errors:`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  await closePool();
  console.log('[migrate] Done.');
}

main().catch(e => {
  console.error('[migrate] Fatal:', e);
  process.exit(1);
});
