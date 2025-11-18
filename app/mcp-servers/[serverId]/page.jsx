import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Buffer } from 'buffer';

import AppShell from '../../../components/dashboard/AppShell.jsx';
import { getDashboardContext } from '../../../lib/dashboard-context.js';
import prisma from '../../../lib/prisma.js';
import { buildAbsoluteUrl, getMcpBaseUrl } from '../../../lib/url-utils.js';
import '../../../components/detail/detail-page.css';

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

function describeAuth(auth) {
  if (!auth || auth.authType === 'none') {
    return 'No authentication';
  }
  switch (auth.authType) {
    case 'api_key_header':
      return 'API key (header)';
    case 'api_key_query':
      return 'API key (query)';
    case 'bearer_token':
      return 'Bearer token';
    case 'basic':
      return 'HTTP basic auth';
    default:
      return auth.authType;
  }
}

function authRows(auth) {
  if (!auth) return [];
  const rows = [{ label: 'Mode', value: describeAuth(auth) }];
  if (auth.apiKeyHeaderName) {
    rows.push({ label: 'Header name', value: auth.apiKeyHeaderName });
  }
  if (auth.apiKeyHeaderValue) {
    rows.push({ label: 'Header value', value: auth.apiKeyHeaderValue });
  }
  if (auth.apiKeyQueryName) {
    rows.push({ label: 'Query param', value: auth.apiKeyQueryName });
  }
  if (auth.apiKeyQueryValue) {
    rows.push({ label: 'Query value', value: auth.apiKeyQueryValue });
  }
  if (auth.bearerToken) {
    rows.push({ label: 'Bearer token', value: auth.bearerToken });
  }
  if (auth.basicUsername) {
    rows.push({ label: 'Basic username', value: auth.basicUsername });
  }
  if (auth.basicPassword) {
    rows.push({ label: 'Basic password', value: auth.basicPassword });
  }
  if (auth.extraHeaders && typeof auth.extraHeaders === 'object' && !Array.isArray(auth.extraHeaders)) {
    Object.entries(auth.extraHeaders).forEach(([key, value]) => {
      rows.push({ label: `Header: ${key}`, value: String(value) });
    });
  }
  return rows;
}

function buildAuthSamples(auth) {
  const headers = {};
  const query = {};
  if (!auth) {
    return { headers, query };
  }
  if (auth.apiKeyHeaderName) {
    headers[auth.apiKeyHeaderName] = auth.apiKeyHeaderValue || '<api-key>';
  }
  if (auth.apiKeyQueryName) {
    query[auth.apiKeyQueryName] = auth.apiKeyQueryValue || '<api-key>';
  }
  if (auth.bearerToken) {
    headers.Authorization = `Bearer ${auth.bearerToken}`;
  }
  if (auth.basicUsername || auth.basicPassword) {
    const username = auth.basicUsername || 'username';
    const password = auth.basicPassword || 'password';
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    headers.Authorization = `Basic ${encoded}`;
  }
  if (auth.extraHeaders && typeof auth.extraHeaders === 'object' && !Array.isArray(auth.extraHeaders)) {
    Object.entries(auth.extraHeaders).forEach(([key, value]) => {
      headers[key] = String(value);
    });
  }
  return { headers, query };
}

function formatConnectionPayload(endpoint, auth) {
  const payload = { transport: 'http', url: endpoint };
  if (Object.keys(auth.headers).length) {
    payload.headers = auth.headers;
  }
  if (Object.keys(auth.query).length) {
    payload.query = auth.query;
  }
  return JSON.stringify(payload, null, 2);
}

function buildCurlCommand(endpoint, auth) {
  const lines = [`curl -X POST '${endpoint}'`, "  -H 'Content-Type: application/json'"];
  Object.entries(auth.headers).forEach(([key, value]) => {
    lines.push(`  -H '${key}: ${value}'`);
  });
  const queryString = Object.entries(auth.query)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const urlWithQuery = queryString ? `${endpoint}?${queryString}` : endpoint;
  lines[0] = `curl -X POST '${urlWithQuery}'`;
  lines.push("  -d '{\"jsonrpc\":\"2.0\",\"id\":\"list-tools\",\"method\":\"list_tools\"}'");
  return lines.join(' \\\n');
}

export default async function McpServerDetailPage({ params, searchParams }) {
  const serverId = Number(params?.serverId);
  if (!serverId) {
    notFound();
  }

  const { session, userId, projects, activeProjectId } = await getDashboardContext(searchParams);
  const server = await prisma.mcpServer.findFirst({
    where: { id: serverId, userId },
    include: {
      authConfig: true,
      tools: { orderBy: { name: 'asc' } },
    },
  });
  if (!server) {
    notFound();
  }

  const projectId = server.projectId || activeProjectId;
  const backHref = withProjectHref('/mcp-servers', projectId);
  const manageToolsHref = withProjectHref(`/mcp-servers/${server.id}/tools`, projectId);
  const mcpBaseUrl = getMcpBaseUrl();
  const endpoint = buildAbsoluteUrl(mcpBaseUrl, `/mcp/${server.slug}`);
  const authSamples = buildAuthSamples(server.authConfig);
  const connectionJson = formatConnectionPayload(endpoint, authSamples);
  const curlCommand = buildCurlCommand(endpoint, authSamples);

  return (
    <AppShell session={session} projects={projects} activeProjectId={projectId}>
      <section className="section-card">
        <header>
          <div>
            <h2>{server.name}</h2>
            <p>Slug <code>{server.slug}</code> · MCP endpoint <code>/mcp/{server.slug}</code></p>
          </div>
          <div className="inline" style={{ gap: '0.5rem' }}>
            <Link className="btn secondary" href={backHref}>
              Back to servers
            </Link>
            <Link className="btn" href={manageToolsHref}>
              Manage tools
            </Link>
          </div>
        </header>
        <p>{server.description || 'No description provided.'}</p>

        <div className="detail-grid">
          <div className="detail-card">
            <h3>Server details</h3>
            <dl className="info-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`badge ${server.isEnabled ? 'success' : 'muted'}`}>
                    {server.isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>MCP endpoint</dt>
                <dd>
                  <code>{endpoint}</code>
                </dd>
              </div>
              <div>
                <dt>Base URL for tools</dt>
                <dd>{server.baseUrl || 'Not set'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(server.createdAt)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(server.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="detail-card">
            <h3>Authentication</h3>
            {server.authConfig ? (
              <dl className="info-list">
                {authRows(server.authConfig).map((row, index) => (
                  <div key={`${row.label}-${index}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="table-note">No authentication configured.</p>
            )}
          </div>
        </div>

        <div className="detail-stack">
          <h3>Connection payload</h3>
          <pre className="code-block">{connectionJson}</pre>
        </div>

        <div className="detail-stack">
          <h3>JSON-RPC cURL example</h3>
          <pre className="code-block">{curlCommand}</pre>
        </div>

        <div className="detail-stack">
          <h3>Configured tools</h3>
          {server.tools.length === 0 ? (
            <p className="table-note">No tools yet. Use "Manage tools" to create them.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Base URL</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {server.tools.map((tool) => (
                    <tr key={tool.id}>
                      <td>{tool.name}</td>
                      <td>{tool.description || '—'}</td>
                      <td>
                        <span className="badge">{tool.httpMethod}</span>
                      </td>
                      <td>
                        <code>{tool.pathTemplate || '—'}</code>
                      </td>
                      <td>{tool.baseUrl || server.baseUrl || '—'}</td>
                      <td>
                        <span className={`badge ${tool.enabled ? 'success' : 'muted'}`}>
                          {tool.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
