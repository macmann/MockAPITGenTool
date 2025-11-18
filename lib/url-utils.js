const DEFAULT_BASE_URL = 'http://localhost:3000';

function sanitizeBaseUrl(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const pathname = url.pathname?.replace(/\/$/, '') || '';
    return `${url.origin}${pathname}`;
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

function pickBaseUrl(...candidates) {
  for (const candidate of candidates) {
    const sanitized = sanitizeBaseUrl(candidate);
    if (sanitized) return sanitized;
  }
  return DEFAULT_BASE_URL;
}

export function getMockBaseUrl() {
  return pickBaseUrl(process.env.MOCK_BASE_URL, process.env.NEXTAUTH_URL);
}

export function getMcpBaseUrl() {
  return pickBaseUrl(process.env.MCP_PUBLIC_URL, process.env.NEXTAUTH_URL, process.env.MOCK_BASE_URL);
}

export function buildAbsoluteUrl(base, path = '/') {
  const normalizedBase = pickBaseUrl(base);
  const safePath = typeof path === 'string' && path ? path : '/';
  try {
    return new URL(safePath, normalizedBase).toString();
  } catch {
    const trimmedPath = safePath.startsWith('/') ? safePath : `/${safePath}`;
    return `${normalizedBase}${trimmedPath}`;
  }
}

export function ensureLeadingSlash(path) {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}
