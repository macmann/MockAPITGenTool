import { ensureLeadingSlash } from './url-utils.js';

function parseJson(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildResponseContent(route) {
  if (route.responseIsJson) {
    const parsed = parseJson(route.responseBody);
    return {
      'application/json': {
        example: parsed ?? route.responseBody || {},
      },
    };
  }

  return {
    'text/plain': {
      example: route.responseBody || '',
    },
  };
}

export function buildRouteOpenApiDocument(route, options = {}) {
  if (!route) {
    throw new Error('Route is required');
  }
  const method = String(route.method || 'GET').toLowerCase();
  const path = ensureLeadingSlash(route.path || '/');
  const statusCode = route.responseStatus || 200;
  const info = {
    title: route.name || route.path || 'Mock route',
    version: '1.0.0',
  };
  if (route.description) {
    info.description = route.description;
  }

  const responses = {
    [statusCode]: {
      description: route.description || `Mock response (${statusCode})`,
      content: buildResponseContent(route),
    },
  };

  const operation = {
    summary: route.description || 'Mock response',
    responses,
  };

  const document = {
    openapi: '3.0.0',
    info,
    paths: {
      [path]: {
        [method]: operation,
      },
    },
  };

  if (options.serverUrl) {
    document.servers = [{ url: options.serverUrl }];
  }

  return document;
}

export function formatRouteOpenApiDocument(route, options = {}) {
  const document = buildRouteOpenApiDocument(route, options);
  return JSON.stringify(document, null, 2);
}
