import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadConfig } from '../config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = postgres(loadConfig().databaseUrl, { max: 1 });
try {
  await sql.unsafe(
    await readFile(resolve(root, '../migrations/0000_init.sql'), 'utf8'),
  );
} finally {
  await sql.end();
}
