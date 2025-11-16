import fetch from 'node-fetch';

export async function executeMcpHttpTool({ tool, authConfig, args }) {
  const method = (tool.http_method || 'GET').toUpperCase();
  const baseUrl = (tool.base_url || '').replace(/\/+$/, '');
  let path = tool.path_template || '/';

  const queryMapping = safeParseJson(tool.query_mapping_json, {});
  const bodyMapping = safeParseJson(tool.body_mapping_json, {});
  const headersMapping = safeParseJson(tool.headers_mapping_json, {});

  // 1) Path templating – replace {param} or :param with args[param]
  path = applyPathTemplate(path, args);

  // 2) Build query params from mapping
  const queryParams = buildQueryParams(queryMapping, args);

  // 3) Build request body from mapping (or raw args)
  const body = buildBody(bodyMapping, args, method);

  // 4) Build headers from mapping + auth config
  const headers = buildHeaders(headersMapping, authConfig);

  // 5) Construct final URL
  const url = buildUrl(baseUrl, path, queryParams);

  const fetchOptions = {
    method,
    headers,
  };

  if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetch(url, fetchOptions);

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    rawBody: text,
    json,
  };
}

function safeParseJson(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function applyPathTemplate(path, args) {
  // Replace {param} and :param with args[param]
  let result = path;

  result = result.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = args[key];
    return value !== undefined ? encodeURIComponent(String(value)) : `{${key}}`;
  });

  result = result.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    const value = args[key];
    return value !== undefined ? encodeURIComponent(String(value)) : `:${key}`;
  });

  return result;
}

function buildQueryParams(mapping, args) {
  const query = {};
  for (const [paramName, argKey] of Object.entries(mapping)) {
    const value = args[argKey];
    if (value !== undefined && value !== null) {
      query[paramName] = String(value);
    }
  }
  return query;
}

function buildBody(mapping, args, method) {
  if (method === 'GET' || method === 'HEAD') return undefined;

  // If mapping is empty, by default send args as body
  if (!mapping || Object.keys(mapping).length === 0) {
    return Object.keys(args).length > 0 ? args : undefined;
  }

  const body = {};
  for (const [bodyKey, argKey] of Object.entries(mapping)) {
    const value = args[argKey];
    if (value !== undefined) {
      body[bodyKey] = value;
    }
  }
  return body;
}

function buildHeaders(mapping, authConfig) {
  const headers = {};

  // Apply static headers from mapping
  for (const [key, value] of Object.entries(mapping || {})) {
    if (value != null) {
      headers[key] = String(value);
    }
  }

  // Apply extra headers JSON from auth config
  if (authConfig?.extra_headers_json) {
    try {
      const extra = JSON.parse(authConfig.extra_headers_json);
      for (const [k, v] of Object.entries(extra)) {
        headers[k] = String(v);
      }
    } catch {
      // ignore parse error
    }
  }

  // Apply auth type
  switch (authConfig?.auth_type) {
    case 'api_key_header': {
      const headerName = authConfig.api_key_header_name || 'X-API-Key';
      if (authConfig.api_key_value) {
        headers[headerName] = authConfig.api_key_value;
      }
      break;
    }
    case 'bearer_token': {
      if (authConfig.bearer_token) {
        headers['Authorization'] = `Bearer ${authConfig.bearer_token}`;
      }
      break;
    }
    case 'basic': {
      if (authConfig.basic_username || authConfig.basic_password) {
        const token = Buffer.from(
          `${authConfig.basic_username || ''}:${authConfig.basic_password || ''}`,
          'utf8'
        ).toString('base64');
        headers['Authorization'] = `Basic ${token}`;
      }
      break;
    }
    default:
      // no auth
      break;
  }

  return headers;
}

function buildUrl(baseUrl, path, queryParams) {
  let url = baseUrl + path;
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams || {})) {
    searchParams.append(k, v);
  }
  const qs = searchParams.toString();
  if (qs) {
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  return url;
}
