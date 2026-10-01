import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadConfig } from '../config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = postgres(loadConfig().databaseUrl, { max: 1 });
try {
  const files = (await readdir(resolve(root, '../migrations')))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files)
    await sql.unsafe(
      await readFile(resolve(root, '../migrations', file), 'utf8'),
    );
} finally {
  await sql.end();
}
