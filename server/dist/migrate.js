#!/usr/bin/env npx ts-node
"use strict";
// Migrate existing JSON data to Postgres
// Run: npx ts-node migrate.ts
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const db_1 = require("./db");
const DATA_DIR = process.env.DATA_DIR || '/app/data';
async function main() {
    console.log('[migrate] Checking database connection...');
    const ok = await (0, db_1.checkConnection)();
    if (!ok) {
        console.error('[migrate] Cannot connect to database. Set DATABASE_URL.');
        process.exit(1);
    }
    console.log('[migrate] Connected.');
    // Load users.json
    const usersPath = (0, path_1.join)(DATA_DIR, 'users.json');
    if (!(0, fs_1.existsSync)(usersPath)) {
        console.log('[migrate] No users.json found. Nothing to migrate.');
        await (0, db_1.closePool)();
        return;
    }
    const usersJson = JSON.parse((0, fs_1.readFileSync)(usersPath, 'utf-8'));
    const count = Object.keys(usersJson).length;
    console.log(`[migrate] Found ${count} users in users.json`);
    const result = await (0, db_1.migrateFromJson)(usersJson);
    console.log(`[migrate] Imported: ${result.imported}/${count}`);
    if (result.errors.length > 0) {
        console.log(`[migrate] Errors:`);
        result.errors.forEach(e => console.log(`  - ${e}`));
    }
    await (0, db_1.closePool)();
    console.log('[migrate] Done.');
}
main().catch(e => {
    console.error('[migrate] Fatal:', e);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map