import { ApiFailure } from './errors.js';

const idPattern =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
export const idParams = {
  params: {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: { id: { type: 'string', pattern: idPattern } },
  },
} as const;
const categoryIds = {
  type: 'array',
  uniqueItems: true,
  items: { type: 'string', pattern: idPattern },
} as const;
const text = { type: 'string', minLength: 1, maxLength: 500 } as const;
export const categoryBody = {
  body: {
    type: 'object',
    required: ['name', 'icon'],
    additionalProperties: false,
    properties: {
      name: text,
      icon: text,
      sortOrder: { type: 'integer' },
      thumbnailMediaId: {
        anyOf: [{ type: 'string', pattern: idPattern }, { type: 'null' }],
      },
    },
  },
} as const;
export const mediaUpdateBody = {
  ...idParams,
  body: {
    type: 'object',
    minProperties: 1,
    additionalProperties: false,
    properties: {
      title: text,
      visible: { type: 'boolean' },
      sortOrder: { type: 'integer' },
      categoryIds,
    },
  },
} as const;
export const localImportBody = {
  body: {
    type: 'object',
    required: ['sourceId', 'categoryIds', 'visible'],
    additionalProperties: false,
    properties: {
      sourceId: { type: 'string', minLength: 1, maxLength: 2048 },
      categoryIds,
      visible: { type: 'boolean' },
    },
  },
} as const;
export const youtubeImportBody = {
  body: {
    type: 'object',
    required: ['url'],
    additionalProperties: false,
    properties: { url: { type: 'string', minLength: 1, maxLength: 2048 } },
  },
} as const;
export const youtubePlaylistImportBody = {
  body: {
    type: 'object',
    required: ['url', 'visible', 'monitor'],
    additionalProperties: false,
    properties: {
      url: { type: 'string', minLength: 1, maxLength: 2048 },
      categoryId: { type: 'string', pattern: idPattern },
      visible: { type: 'boolean' },
      monitor: { type: 'boolean' },
    },
  },
} as const;
export const playlistMonitorBody = {
  ...idParams,
  body: {
    type: 'object',
    required: ['monitor'],
    additionalProperties: false,
    properties: { monitor: { type: 'boolean' } },
  },
} as const;
export const confirmationBody = {
  ...idParams,
  body: {
    type: 'object',
    required: ['categoryIds', 'visible'],
    additionalProperties: false,
    properties: { categoryIds, visible: { type: 'boolean' } },
  },
} as const;
export const loginBody = {
  body: {
    type: 'object',
    required: ['pin'],
    additionalProperties: false,
    properties: { pin: { type: 'string', minLength: 1, maxLength: 128 } },
  },
} as const;
export const telemetryBody = {
  ...idParams,
  body: {
    type: 'object',
    required: ['views', 'seconds'],
    additionalProperties: false,
    properties: {
      views: { type: 'integer', enum: [0, 1] },
      seconds: { type: 'integer', minimum: 0, maximum: 30 },
    },
  },
} as const;
export function id(value: string): string {
  if (!new RegExp(idPattern).test(value))
    throw new ApiFailure(400, 'INVALID_ID');
  return value;
}
