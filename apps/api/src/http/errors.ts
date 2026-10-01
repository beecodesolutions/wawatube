import type { FastifyError, FastifyInstance } from 'fastify';
import { ProviderError } from '../providers/errors.js';

export class ApiFailure extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ApiFailure, _request, reply) => {
    if (error instanceof ApiFailure)
      return reply.code(error.statusCode).send({ code: error.code });
    if (error instanceof ProviderError) {
      if (
        ['INVALID_SOURCE', 'INVALID_URL', 'INVALID_VIDEO_ID'].includes(
          error.code,
        )
      )
        return reply.code(400).send({ code: error.code });
      if (error.code === 'NOT_FOUND')
        return reply.code(404).send({ code: error.code });
      return reply.code(502).send({ code: 'UPSTREAM_UNAVAILABLE' });
    }
    if (error.validation)
      return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error.statusCode === 416) {
      const contentRange = (
        error as FastifyError & { headers?: Record<string, string> }
      ).headers?.['Content-Range'];
      if (contentRange) reply.header('Content-Range', contentRange);
      return reply.code(416).send({ code: 'INVALID_RANGE' });
    }
    if (error.statusCode === 404)
      return reply.code(404).send({ code: 'MEDIA_NOT_AVAILABLE' });
    app.log.error(error);
    return reply.code(500).send({ code: 'INTERNAL_ERROR' });
  });
}
