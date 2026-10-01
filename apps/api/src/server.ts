import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { createApp } from './app.js';
import { ProviderMediaGateway } from './media-gateway.js';
import { ImportService } from './imports/service.js';

const config = loadConfig();
const { db, sql } = openDatabase(config.databaseUrl);
const [
  { LocalMediaProvider },
  { TubeArchivistService },
  { YouTubeMediaProvider },
] = await Promise.all([
  import('./providers/local-media-provider.js'),
  import('./providers/tube-archivist-service.js'),
  import('./providers/youtube-media-provider.js'),
]);
const local = new LocalMediaProvider(config.localMediaRoot, config.ffprobePath);
const tube = new TubeArchivistService(
  config.tubeArchivistUrl,
  config.tubeArchivistToken,
);
const youtube = new YouTubeMediaProvider(tube);
const media = new ProviderMediaGateway(
  { LOCAL: local, YOUTUBE: youtube },
  {
    preview: async (id) => {
      const result = await tube.preview(id);
      return { metadata: result.metadata };
    },
    queue: (id) => tube.queue(id),
    state: async (id) => {
      if (await tube.failed(id)) return 'FAILED';
      if (await tube.archived(id)) return 'READY';
      return (await tube.pending(id)) ? 'QUEUED' : 'PENDING';
    },
    reconcile: async (id) => {
      const metadata = (await tube.archived(id)) ?? (await tube.pending(id));
      return {
        metadata,
        available: metadata ? await youtube.available(id) : false,
        failed: await tube.failed(id),
      };
    },
  },
  () => local.discover(),
  (path, headers, method: 'GET' | 'HEAD' = 'GET') =>
    tube.resource(path, headers ?? {}, method),
);
const imports = new ImportService(db, media);
const app = createApp({ db, config, media, imports });
const webRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../web/dist',
);
await app.register(fastifyStatic, {
  root: webRoot,
  decorateReply: false,
});
app.setNotFoundHandler((request, reply) => {
  if (
    request.raw.url?.startsWith('/api/') ||
    request.raw.url?.startsWith('/assets/')
  )
    return reply.code(404).send({ code: 'NOT_FOUND' });
  return reply.sendFile('index.html', webRoot);
});
await app.listen({ host: config.host, port: config.port });
await imports.reconcile().catch((error) => app.log.error(error));
const timer = setInterval(() => {
  void imports.reconcile().catch((error) => app.log.error(error));
}, 30_000);
const close = async () => {
  clearInterval(timer);
  await app.close();
  await sql.end();
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
