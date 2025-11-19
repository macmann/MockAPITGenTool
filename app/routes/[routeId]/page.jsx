import Link from 'next/link';
import { notFound } from 'next/navigation';

import AppShell from '../../../components/dashboard/AppShell.jsx';
import ApiKeyField from '../../../components/shared/ApiKeyField.jsx';
import { getDashboardContext } from '../../../lib/dashboard-context.js';
import prisma from '../../../lib/prisma.js';
import { formatRouteOpenApiDocument } from '../../../lib/mock-route-openapi.js';
import { buildAbsoluteUrl, getMockBaseUrl } from '../../../lib/url-utils.js';
import '../../../components/detail/detail-page.css';

const apiKeyHelper = 'Use this key when calling the mock server via x-api-key.';

function withProjectHref(base, projectId) {
  if (!projectId) return base;
  const url = new URL(base, 'https://placeholder.local');
  url.searchParams.set('projectId', projectId);
  return `${url.pathname}${url.search ? url.search : ''}`;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value);
  } catch {
    return value instanceof Date ? value.toISOString() : String(value);
  }
}

function objectEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value);
}

function formatResponseBody(route) {
  if (!route?.responseBody) {
    return route?.responseIsJson ? '{\n}' : 'No response body configured.';
  }
  if (route.responseIsJson) {
    try {
      return JSON.stringify(JSON.parse(route.responseBody), null, 2);
    } catch {
      return route.responseBody;
    }
  }
  return route.responseBody;
}

function buildCurlCommand(route, url, headerEntries, projectApiKey) {
  const lines = [`curl -X ${route.method} '${url}'`];
  const apiKeyValue = projectApiKey || '<PROJECT_API_KEY>';
  lines.push(`  -H 'x-api-key: ${apiKeyValue}'`);
  headerEntries.forEach(([key, value]) => {
    if (key.toLowerCase() === 'x-api-key') {
      return;
    }
    lines.push(`  -H '${key}: ${String(value)}'`);
  });
  if (route.responseIsJson) {
    lines.push("  -H 'Accept: application/json'");
  }
  return lines.join(' \\\n');
}

export default async function RouteDetailPage({ params, searchParams }) {
  const routeId = Number(params?.routeId);
  if (!routeId) {
    notFound();
  }

  const { session, userId, projects, activeProjectId } = await getDashboardContext(searchParams);
  const route = await prisma.mockRoute.findFirst({
    where: { id: routeId, userId },
    include: { vars: true, project: { select: { id: true, apiKey: true } } },
  });
  if (!route) {
    notFound();
  }

  const projectId = route.projectId || activeProjectId;
  const backHref = withProjectHref('/routes', projectId);
  const mockBaseUrl = getMockBaseUrl();
  const projectApiKey = route.project?.apiKey;
  const fullUrl = buildAbsoluteUrl(mockBaseUrl, route.path);
  const matchHeaderEntries = objectEntries(route.matchHeaders);
  const responseHeaderEntries = objectEntries(route.responseHeaders);
  const responseBody = formatResponseBody(route);
  const openApiSpec = formatRouteOpenApiDocument(route, { serverUrl: mockBaseUrl });
  const curlCommand = buildCurlCommand(route, fullUrl, matchHeaderEntries, projectApiKey);

  return (
    <AppShell session={session} projects={projects} activeProjectId={projectId}>
      <section className="section-card">
        <header>
          <div>
            <h2>{route.name || route.path}</h2>
            <p>Detailed view of this mock API endpoint.</p>
          </div>
          <Link className="btn secondary" href={backHref}>
            Back to routes
          </Link>
        </header>
        <p>{route.description || 'No description provided.'}</p>

        <div className="detail-grid">
          <div className="detail-card">
            <h3>HTTP overview</h3>
            <dl className="info-list">
              <div>
                <dt>Method</dt>
                <dd>
                  <span className="badge">{route.method}</span>
                </dd>
              </div>
              <div>
                <dt>Relative path</dt>
                <dd>
                  <code>{route.path}</code>
                </dd>
              </div>
              <div>
                <dt>Full URL</dt>
                <dd>
                  <code>{fullUrl}</code>
                </dd>
              </div>
              <div>
                <dt>Status code</dt>
                <dd>
                  <span className="badge">{route.responseStatus}</span>
                </dd>
              </div>
              <div>
                <dt>Enabled</dt>
                <dd>{route.enabled ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Response delay</dt>
                <dd>{route.responseDelayMs} ms</dd>
              </div>
              <div>
                <dt>Security</dt>
                <dd>{route.requireApiKey ? 'x-api-key required' : 'Public (no API key)'}</dd>
              </div>
            </dl>
          </div>

          <div className="detail-card">
            <h3>Headers</h3>
            <dl className="info-list">
              <div>
                <dt>Request headers required</dt>
                <dd>
                  {matchHeaderEntries.length === 0 ? (
                    'None'
                  ) : (
                    <div className="tag-list">
                      {matchHeaderEntries.map(([key, value]) => (
                        <span key={key} className="badge">
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
              <div>
                <dt>Response headers</dt>
                <dd>
                  {responseHeaderEntries.length === 0 ? (
                    'None'
                  ) : (
                    <div className="tag-list">
                      {responseHeaderEntries.map(([key, value]) => (
                        <span key={key} className="badge">
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="detail-card">
            <h3>Meta</h3>
            <dl className="info-list">
              <div>
                <dt>Response format</dt>
                <dd>{route.responseIsJson ? 'JSON' : 'Plain text'}</dd>
              </div>
              <div>
                <dt>Templates</dt>
                <dd>{route.templateEnabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(route.createdAt)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(route.updatedAt)}</dd>
              </div>
            </dl>
          </div>
          <div className="detail-card">
            <h3>API key</h3>
            <ApiKeyField value={route.requireApiKey ? projectApiKey : ''} helperText={apiKeyHelper} />
          </div>
        </div>

        <div className="detail-stack">
          <h3>cURL example</h3>
          <pre className="code-block">{curlCommand}</pre>
        </div>

        <div className="detail-stack">
          <h3>OpenAPI snippet</h3>
          <pre className="code-block">{openApiSpec}</pre>
        </div>

        <div className="detail-stack">
          <h3>Response preview</h3>
          <pre className="code-block">{responseBody}</pre>
        </div>

        <div className="detail-stack">
          <h3>Route variables</h3>
          {route.vars?.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {route.vars.map((variable) => (
                    <tr key={variable.id}>
                      <td>
                        <code>{variable.key}</code>
                      </td>
                      <td>{variable.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="table-note">No template variables configured.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
