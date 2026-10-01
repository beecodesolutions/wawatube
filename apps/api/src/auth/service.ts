import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { authConfig, sessions } from '../db/schema.js';

const scrypt = promisify(scryptCallback);
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(pin, salt, 32)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPin(
  pin: string,
  encoded: string,
): Promise<boolean> {
  const [, saltValue, keyValue] = encoded.split('$');
  if (!saltValue || !keyValue) return false;
  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const expected = Buffer.from(keyValue, 'base64url');
    const actual = (await scrypt(pin, salt, expected.length)) as Buffer;
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export async function createSession(
  db: Database,
  sessionHours: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: tokenHash(token), expiresAt });
  return { token, expiresAt };
}

export async function validSession(
  db: Database,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function revokeSession(
  db: Database,
  token: string | undefined,
): Promise<void> {
  if (token)
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
}

export async function configuredPin(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ pinHash: authConfig.pinHash })
    .from(authConfig)
    .where(eq(authConfig.id, 1))
    .limit(1);
  return row?.pinHash ?? null;
}
