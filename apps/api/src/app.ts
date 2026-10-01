import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import fastifyStatic from '@fastify/static';
import cookie from '@fastify/cookie';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type {
  CategoryInput,
  ImportConfirmation,
  MediaUpdate,
} from '@wawatube/shared';
import type { AppConfig } from './config.js';
import type { Database } from './db/index.js';
import { registerAuthRoutes, requireAdmin } from './auth/routes.js';
import { ApiFailure, registerErrorHandler } from './http/errors.js';
import {
  id,
  idParams,
  categoryBody,
  mediaUpdateBody,
  localImportBody,
  youtubeImportBody,
  youtubePlaylistImportBody,
  confirmationBody,
} from './http/schemas.js';
import { LibraryService, importDto, sourceType } from './library/service.js';
import { ImportService } from './imports/service.js';
import { PlaylistImportService } from './imports/playlist-service.js';
import { childMedia, type MediaGateway } from './media-gateway.js';
import type { MediaResource } from './providers/media-provider.js';
import {
  youtubeIdFromUrl as providerYoutubeIdFromUrl,
  youtubePlaylistIdFromUrl as providerYoutubePlaylistIdFromUrl,
} from './providers/youtube-media-provider.js';

interface AppOptions {
  db: Database;
  config: AppConfig;
  media: MediaGateway;
  imports?: ImportService;
  playlistImports?: PlaylistImportService;
}

async function safeFile(
  root: string,
  resource: Extract<MediaResource, { kind: 'file' }>,
): Promise<{ root: string; name: string }> {
  const base = await realpath(root).catch(() => {
    throw new ApiFailure(404, 'MEDIA_NOT_AVAILABLE');
  });
  const path = await realpath(
    resolve(resource.root, resource.relativePath),
  ).catch(() => {
    throw new ApiFailure(404, 'MEDIA_NOT_AVAILABLE');
  });
  const name = relative(base, path);
  if (
    !name ||
    name === '..' ||
    name.startsWith(`..${sep}`) ||
    isAbsolute(name) ||
    !(await stat(path)).isFile()
  )
    throw new ApiFailure(404, 'MEDIA_NOT_AVAILABLE');
  return { root: base, name };
}

async function sendResource(
  request: FastifyRequest,
  reply: FastifyReply,
  resource: MediaResource,
  media: MediaGateway,
  config: AppConfig,
): Promise<FastifyReply> {
  if (resource.kind === 'file') {
    const { root, name } = await safeFile(config.localMediaRoot, resource);
    return reply.sendFile(name, root);
  }
  const response = await media.upstream(
    resource.path,
    {
      range: request.headers.range,
      ifRange:
        typeof request.headers['if-range'] === 'string'
          ? request.headers['if-range']
          : undefined,
    },
    request.method === 'HEAD' ? 'HEAD' : 'GET',
  );
  if (
    response.status !== 200 &&
    response.status !== 206 &&
    response.status !== 416
  )
    throw new ApiFailure(
      response.status === 404 ? 404 : 502,
      'MEDIA_NOT_AVAILABLE',
    );
  reply.code(response.status);
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
    'cache-control',
  ]) {
    const value = response.headers.get(name);
    if (value) reply.header(name, value);
  }
  if (request.method === 'HEAD' || !response.body) return reply.send();
  const stream = Readable.fromWeb(
    response.body as unknown as import('node:stream/web').ReadableStream,
  );
  reply.raw.once('close', () => {
    if (!reply.raw.writableEnded) stream.destroy();
  });
  return reply.send(stream);
}

export function createApp(options: AppOptions): FastifyInstance {
  const { db, config, media } = options;
  const library = new LibraryService(db, media);
  const imports = options.imports ?? new ImportService(db, media);
  const playlistImports =
    options.playlistImports ?? new PlaylistImportService(db, media, imports);
  const app = Fastify({
    logger: true,
    ajv: { customOptions: { coerceTypes: false } },
  });
  app.register(cookie);
  app.register(fastifyStatic, { root: config.localMediaRoot, serve: false });
  app.addHook('onRequest', async (request, reply) => {
    if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== config.publicOrigin)
      return reply.code(403).send({ code: 'INVALID_ORIGIN' });
  });
  registerErrorHandler(app);
  registerAuthRoutes(app, db, config);
  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/kids/categories', () => library.categories(false));
  app.get<{ Params: { id: string } }>(
    '/api/kids/categories/:id/media',
    { schema: idParams },
    (request) => library.categoryMedia(id(request.params.id)),
  );
  app.get<{ Params: { id: string } }>(
    '/api/kids/media/:id',
    { schema: idParams },
    async (request) => {
      const row = await library.childItem(id(request.params.id));
      return childMedia(row);
    },
  );
  app.get<{ Params: { id: string } }>(
    '/api/kids/media/:id/play',
    { schema: idParams },
    async (request, reply) => {
      const row = await library.childItem(id(request.params.id));
      return sendResource(
        request,
        reply,
        await media.playback(sourceType(row.sourceType), row.sourceId),
        media,
        config,
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    '/api/kids/media/:id/thumbnail',
    { schema: idParams },
    async (request, reply) => {
      const row = await library.childItem(id(request.params.id));
      const resource = await media.thumbnail(
        sourceType(row.sourceType),
        row.sourceId,
      );
      if (!resource) throw new ApiFailure(404, 'MEDIA_NOT_AVAILABLE');
      return sendResource(request, reply, resource, media, config);
    },
  );

  app.register(async (admin) => {
    admin.addHook('onRequest', async (request, reply) =>
      requireAdmin(request, reply, db),
    );
    admin.get('/api/admin/media', () => library.library());
    admin.get('/api/admin/categories', () => library.categories());
    admin.post<{ Body: CategoryInput }>(
      '/api/admin/categories',
      { schema: categoryBody },
      (request) => library.createCategory(request.body),
    );
    admin.patch<{ Params: { id: string }; Body: CategoryInput }>(
      '/api/admin/categories/:id',
      { schema: { ...idParams, ...categoryBody } },
      (request) => library.updateCategory(id(request.params.id), request.body),
    );
    admin.delete<{ Params: { id: string } }>(
      '/api/admin/categories/:id',
      { schema: idParams },
      async (request, reply) => {
        await library.deleteCategory(id(request.params.id));
        return reply.code(204).send();
      },
    );
    admin.patch<{ Params: { id: string }; Body: MediaUpdate }>(
      '/api/admin/media/:id',
      { schema: mediaUpdateBody },
      (request) => library.updateMedia(id(request.params.id), request.body),
    );
    admin.delete<{ Params: { id: string } }>(
      '/api/admin/media/:id',
      { schema: idParams },
      async (request, reply) => {
        await library.deleteMedia(id(request.params.id));
        return reply.code(204).send();
      },
    );
    admin.get<{ Params: { id: string } }>(
      '/api/admin/media/:id/thumbnail',
      { schema: idParams },
      async (request, reply) => {
        const row = await library.adminItem(id(request.params.id));
        const resource = await media.thumbnail(
          sourceType(row.sourceType),
          row.sourceId,
        );
        if (!resource) throw new ApiFailure(404, 'MEDIA_NOT_AVAILABLE');
        return sendResource(request, reply, resource, media, config);
      },
    );
    admin.get('/api/admin/local/candidates', () => media.localCandidates());
    admin.post<{
      Body: { sourceId: string; categoryIds: string[]; visible: boolean };
    }>(
      '/api/admin/import/local',
      { schema: localImportBody },
      async (request, reply) =>
        reply
          .code(201)
          .send(
            await library.localImport(
              request.body.sourceId,
              request.body.categoryIds,
              request.body.visible,
            ),
          ),
    );
    admin.post<{ Body: { url: string } }>(
      '/api/admin/import/youtube',
      { schema: youtubeImportBody },
      async (request, reply) =>
        reply
          .code(202)
          .send(await imports.start(youtubeIdFromUrl(request.body.url))),
    );
    admin.post<{
      Body: { url: string; categoryId?: string; visible: boolean };
    }>(
      '/api/admin/import/youtube/playlist',
      { schema: youtubePlaylistImportBody },
      async (request, reply) =>
        reply
          .code(202)
          .send(
            await playlistImports.start(
              youtubePlaylistIdFromUrl(request.body.url),
              request.body.categoryId,
              request.body.visible,
            ),
          ),
    );
    admin.get<{ Params: { id: string } }>(
      '/api/admin/import/:id',
      { schema: idParams },
      async (request) => importDto(await imports.job(id(request.params.id))),
    );
    admin.get<{ Params: { id: string } }>(
      '/api/admin/import/:id/thumbnail',
      { schema: idParams },
      async (request, reply) => {
        const row = await imports.job(id(request.params.id));
        const resource = await media.thumbnail('YOUTUBE', row.sourceId);
        if (!resource) throw new ApiFailure(404, 'MEDIA_NOT_AVAILABLE');
        return sendResource(request, reply, resource, media, config);
      },
    );
    admin.post<{ Params: { id: string }; Body: ImportConfirmation }>(
      '/api/admin/import/:id/confirm',
      { schema: confirmationBody },
      (request) => imports.confirm(id(request.params.id), request.body),
    );
    admin.post<{ Params: { id: string } }>(
      '/api/admin/import/:id/retry',
      { schema: idParams },
      (request) => imports.retry(id(request.params.id)),
    );
    admin.post<{ Params: { id: string } }>(
      '/api/admin/playlist-import/:id/retry',
      { schema: idParams },
      (request) => playlistImports.retry(id(request.params.id)),
    );
  });
  return app;
}

export function youtubeIdFromUrl(url: string): string {
  try {
    return providerYoutubeIdFromUrl(url);
  } catch {
    throw new ApiFailure(400, 'INVALID_YOUTUBE_URL');
  }
}

export function youtubePlaylistIdFromUrl(url: string): string {
  try {
    return providerYoutubePlaylistIdFromUrl(url);
  } catch {
    throw new ApiFailure(400, 'INVALID_YOUTUBE_PLAYLIST_URL');
  }
}
