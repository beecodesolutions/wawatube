import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export interface AppConfig {
  databaseUrl: string;
  localMediaRoot: string;
  tubeArchivistUrl: string;
  tubeArchivistToken: string;
  host: string;
  port: number;
  publicOrigin: string;
  sessionHours: number;
  secureCookies: boolean;
  skipParentPin: boolean;
  ffprobePath: string;
}

const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  dotenv.config({ path: resolve(projectRoot, '.env') });
  const value = (name: string, fallback = '') =>
    env[name] ?? process.env[name] ?? fallback;
  const databaseUrl = value('DATABASE_URL');
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const localMediaRoot = resolve(
    projectRoot,
    value('LOCAL_MEDIA_ROOT', 'media/local'),
  );
  const port = Number(value('PORT', '3000'));
  const sessionHours = Number(value('SESSION_HOURS', '24'));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be 1-65535');
  if (!Number.isFinite(sessionHours) || sessionHours <= 0 || sessionHours > 720)
    throw new Error('SESSION_HOURS must be 0-720');
  const tubeArchivistUrl = value('TUBE_ARCHIVIST_URL').replace(/\/$/, '');
  if (tubeArchivistUrl) {
    try {
      const url = new URL(tubeArchivistUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw new Error('TUBE_ARCHIVIST_URL must be an http(s) URL');
    }
  }
  try {
    const url = new URL(value('PUBLIC_ORIGIN', 'http://127.0.0.1:3000'));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error('PUBLIC_ORIGIN must be an http(s) URL');
  }
  return {
    databaseUrl,
    localMediaRoot,
    tubeArchivistUrl,
    tubeArchivistToken: value('TUBE_ARCHIVIST_TOKEN'),
    host: value('HOST', '127.0.0.1'),
    port,
    publicOrigin: value('PUBLIC_ORIGIN', 'http://127.0.0.1:3000').replace(
      /\/$/,
      '',
    ),
    sessionHours,
    secureCookies: value('SECURE_COOKIES', 'false').toLowerCase() === 'true',
    skipParentPin:
      value('NODE_ENV') === 'development' &&
      value('DEV_SKIP_PARENT_PIN').toLowerCase() === 'true',
    ffprobePath: value('FFPROBE_PATH', 'ffprobe'),
  };
}
