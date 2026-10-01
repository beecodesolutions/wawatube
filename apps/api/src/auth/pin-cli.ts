import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';
import { authConfig, sessions } from '../db/schema.js';
import { hashPin } from './service.js';

const rl = createInterface({ input: stdin, output: stdout });
try {
  const pin = await rl.question('Parent PIN: ');
  if (!/^\d{4,12}$/.test(pin)) throw new Error('PIN must contain 4-12 digits');
  const { db, sql } = openDatabase(loadConfig().databaseUrl);
  const pinHash = await hashPin(pin);
  await db
    .insert(authConfig)
    .values({ id: 1, pinHash })
    .onConflictDoUpdate({
      target: authConfig.id,
      set: { pinHash, updatedAt: new Date() },
    });
  await db.delete(sessions);
  await sql.end();
} finally {
  rl.close();
}
