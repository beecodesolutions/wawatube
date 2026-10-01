import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { resolve, dirname, isAbsolute, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.loadEnvFile(resolve(root, '.env'));
const [mode, destination, ...flags] = process.argv.slice(2);
if (!['backup', 'restore'].includes(mode ?? '') || !destination) {
  throw new Error(
    'Usage: backup.sh DIRECTORY [--include-local] | restore.sh DIRECTORY --confirm-empty. Stop the Node app first.',
  );
}
const folder = resolve(destination);
if (mode === 'restore' && !flags.includes('--confirm-empty'))
  throw new Error(
    'Restore requires --confirm-empty and a fresh target installation.',
  );
const compose = [
  'compose',
  '--env-file',
  resolve(root, '.env'),
  '-f',
  resolve(root, 'docker/docker-compose.yml'),
];
const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const runQuiet = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
const dc = (...args: string[]) => run('docker', [...compose, ...args]);
const image = 'postgres:17.11-bookworm';
const localRoot = resolve(
  root,
  process.env.LOCAL_MEDIA_ROOT ?? './media/local',
);
const pathInside = (base: string, child: string) => {
  const r = relative(base, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

async function canonicalPath(path: string): Promise<string> {
  let current = resolve(path);
  const missing: string[] = [];
  while (true) {
    try {
      const existing = await realpath(current);
      return missing.reduceRight(
        (parent, child) => resolve(parent, child),
        existing,
      );
    } catch {
      const parent = dirname(current);
      if (parent === current) throw new Error(`Cannot resolve path: ${path}`);
      missing.push(basename(current));
      current = parent;
    }
  }
}

const canonicalFolder = await canonicalPath(folder);
const canonicalLocalRoot = await canonicalPath(localRoot);
const canonicalDataRoot = await canonicalPath(resolve(root, 'data'));
if (
  pathInside(canonicalLocalRoot, canonicalFolder) ||
  pathInside(canonicalDataRoot, canonicalFolder)
)
  throw new Error('Backup directory must be outside media/data roots.');
if (folder.includes(',') || localRoot.includes(','))
  throw new Error('Backup and media paths cannot contain commas.');

// Stop application yourself: this utility never kills an unrelated Node process.
const configuredHost = process.env.HOST?.trim() || '127.0.0.1';
const healthHost =
  configuredHost === '0.0.0.0'
    ? '127.0.0.1'
    : configuredHost === '::'
      ? '[::1]'
      : configuredHost.includes(':')
        ? `[${configuredHost}]`
        : configuredHost;
let healthResponded = false;
try {
  await fetch(`http://${healthHost}:${process.env.PORT ?? '3100'}/api/health`, {
    signal: AbortSignal.timeout(1500),
  });
  healthResponded = true;
} catch {
  // Connection refusal/timeout means the API is not listening; an HTTP response above is fail-closed.
}
if (healthResponded)
  throw new Error(
    'Stop Wawatube API before backup/restore (sudo systemctl stop wawatube).',
  );

interface Mount {
  Type: string;
  Name?: string;
  Source: string;
  Destination: string;
}
function mountFor(service: string, target: string): string {
  const id = dc('ps', '-a', '-q', service).trim();
  if (!id)
    throw new Error(
      `Missing ${service} container; create infrastructure first.`,
    );
  const mounts = JSON.parse(
    run('docker', ['inspect', '--format', '{{json .Mounts}}', id]),
  ) as Mount[];
  const m = mounts.find((entry) => entry.Destination === target);
  if (!m) throw new Error(`Missing ${target} mount.`);
  const source = m.Type === 'volume' ? m.Name : m.Source;
  if (!source || source.includes(','))
    throw new Error(`Unsupported mount path for ${target}.`);
  return `type=${m.Type},src=${source},dst=/data`;
}
const archiveNames = [
  'ta-cache.tar',
  'elasticsearch.tar',
  'redis.tar',
  'youtube.tar',
];
let archives: { name: string; mount: string }[] = [];
async function checksum(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
if (mode === 'backup') {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await chmod(folder, 0o700);
  if ((await readdir(folder)).length)
    throw new Error('Backup destination must be empty.');
  if (flags.includes('--include-local'))
    archives.push({
      name: 'local.tar',
      mount: `type=bind,src=${localRoot},dst=/data`,
    });
  archives = [
    { name: 'ta-cache.tar', mount: mountFor('tubearchivist', '/cache') },
    {
      name: 'elasticsearch.tar',
      mount: mountFor('elasticsearch', '/usr/share/elasticsearch/data'),
    },
    { name: 'redis.tar', mount: mountFor('redis', '/data') },
    { name: 'youtube.tar', mount: mountFor('tubearchivist', '/youtube') },
    ...archives,
  ];
  const running = dc('ps', '--services', '--status', 'running')
    .trim()
    .split('\n')
    .filter(Boolean);
  try {
    dc('stop', 'tubearchivist', 'redis', 'elasticsearch');
    const dump = resolve(folder, 'postgres.dump');
    // Stream dump directly to disk: videos are never buffered in this process.
    const { openSync, closeSync } = await import('node:fs');
    const fd = openSync(dump, 'w', 0o600);
    try {
      execFileSync(
        'docker',
        [
          ...compose,
          'exec',
          '-T',
          'postgres',
          'pg_dump',
          '-U',
          'wawatube',
          '-d',
          'wawatube',
          '-Fc',
        ],
        { stdio: ['ignore', fd, 'inherit'] },
      );
    } finally {
      closeSync(fd);
    }
    for (const a of archives)
      run('docker', [
        'run',
        '--rm',
        '--network',
        'none',
        '--mount',
        `${a.mount},readonly`,
        '--mount',
        `type=bind,src=${folder},dst=/backup`,
        image,
        'tar',
        '-cpf',
        `/backup/${a.name}`,
        '-C',
        '/data',
        '.',
      ]);
    await copyFile(resolve(root, '.env'), resolve(folder, 'config.env'));
    await chmod(resolve(folder, 'config.env'), 0o600);
    await copyFile(
      resolve(root, 'docker/docker-compose.yml'),
      resolve(folder, 'compose.yml'),
    );
    const files: Record<string, string> = {};
    for (const name of await readdir(folder))
      files[name] = await checksum(resolve(folder, name));
    await writeFile(
      resolve(folder, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          createdAt: new Date().toISOString(),
          localIncluded: flags.includes('--include-local'),
          files,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  } finally {
    const restart = running.filter((service) =>
      ['tubearchivist', 'redis', 'elasticsearch'].includes(service),
    );
    if (restart.length) dc('start', ...restart);
  }
  console.log(
    `Backup ready: ${folder}. Keep config.env private. Restart the Node app manually.`,
  );
} else {
  const manifest = JSON.parse(
    await readFile(resolve(folder, 'manifest.json'), 'utf8'),
  ) as {
    version: number;
    localIncluded: boolean;
    files: Record<string, string>;
  };
  if (manifest.version !== 1) throw new Error('Unsupported backup version.');
  for (const name of ['config.env', 'compose.yml'])
    if (!manifest.files[name]) throw new Error(`Backup missing ${name}.`);
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (
      !/^[a-z.-]+$/.test(name) ||
      (await checksum(resolve(folder, name))) !== expected
    )
      throw new Error('Invalid backup checksum or filename.');
  }
  for (const name of ['postgres.dump', ...archiveNames])
    if (!manifest.files[name]) throw new Error(`Backup missing ${name}.`);
  if (
    (await checksum(resolve(root, 'docker/docker-compose.yml'))) !==
    manifest.files['compose.yml']
  )
    throw new Error(
      'Current docker-compose.yml differs from the backup. Restore with the matching checkout.',
    );
  if (manifest.localIncluded) {
    if (!manifest.files['local.tar'])
      throw new Error('Backup missing local.tar.');
    await mkdir(localRoot, { recursive: true });
    if ((await readdir(localRoot)).some((name) => name !== '.gitkeep'))
      throw new Error('Local media destination must be empty.');
    archives.push({
      name: 'local.tar',
      mount: `type=bind,src=${localRoot},dst=/data`,
    });
  }
  archives = [
    { name: 'ta-cache.tar', mount: mountFor('tubearchivist', '/cache') },
    {
      name: 'elasticsearch.tar',
      mount: mountFor('elasticsearch', '/usr/share/elasticsearch/data'),
    },
    { name: 'redis.tar', mount: mountFor('redis', '/data') },
    { name: 'youtube.tar', mount: mountFor('tubearchivist', '/youtube') },
    ...archives,
  ];
  for (const a of archives)
    runQuiet('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--mount',
      `type=bind,src=${folder},dst=/backup,readonly`,
      image,
      'tar',
      '-tpf',
      `/backup/${a.name}`,
    ]);
  const tableCount = dc(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'wawatube',
    '-d',
    'wawatube',
    '-Atc',
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
  ).trim();
  if (tableCount !== '0')
    throw new Error('PostgreSQL target must have no application tables.');
  // Restore only into newly-created empty TA volumes; fail before extracting any file.
  dc('stop', 'tubearchivist', 'redis', 'elasticsearch');
  for (const a of archives.filter((entry) => entry.name !== 'local.tar')) {
    const entries = run('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--mount',
      `${a.mount},readonly`,
      image,
      'find',
      '/data',
      '-mindepth',
      '1',
      '-maxdepth',
      '1',
    ]).trim();
    if (entries)
      throw new Error(
        `${a.name} destination must be empty. Restore into a fresh Compose project before starting Tube Archivist.`,
      );
  }
  const { openSync, closeSync } = await import('node:fs');
  const fd = openSync(resolve(folder, 'postgres.dump'), 'r');
  try {
    execFileSync(
      'docker',
      [
        ...compose,
        'exec',
        '-T',
        'postgres',
        'pg_restore',
        '-U',
        'wawatube',
        '-d',
        'wawatube',
        '--no-owner',
        '--exit-on-error',
        '--single-transaction',
      ],
      { stdio: [fd, 'inherit', 'inherit'] },
    );
  } finally {
    closeSync(fd);
  }
  try {
    for (const a of archives)
      run('docker', [
        'run',
        '--rm',
        '--network',
        'none',
        '--mount',
        a.mount,
        '--mount',
        `type=bind,src=${folder},dst=/backup,readonly`,
        image,
        'tar',
        '-xpf',
        `/backup/${a.name}`,
        '-C',
        '/data',
      ]);
  } catch (error) {
    throw new Error(
      'Restore wrote a partial target. Stop here, preserve it for diagnosis, and recreate the target volumes and empty PostgreSQL database before retrying.',
      { cause: error },
    );
  }
  console.log(
    'Restore finished. Start Compose, run migrations, reset parent PIN to invalidate old sessions, then start Node.',
  );
}
