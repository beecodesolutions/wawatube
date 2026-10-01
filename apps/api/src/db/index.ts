import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { loadConfig } from '../config.js';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;
export function openDatabase(url = loadConfig().databaseUrl): {
  db: Database;
  sql: ReturnType<typeof postgres>;
} {
  const sql = postgres(url, { max: 10 });
  return { db: drizzle(sql, { schema }), sql };
}
