'use client';

import { useMemo, useState } from 'react';

const MODE_API_KEY = 'api-key';
const MODE_NONE = 'none';

function formatConnectionPayload(endpoint, headers, query) {
  const payload = { transport: 'http', url: endpoint };
  if (headers && Object.keys(headers).length > 0) {
    payload.headers = headers;
  }
  if (query && Object.keys(query).length > 0) {
    payload.query = query;
  }
  return JSON.stringify(payload, null, 2);
}

function buildCurlCommand(endpoint, headers, query) {
  const queryString = Object.entries(query || {})
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  const urlWithQuery = queryString ? `${endpoint}?${queryString}` : endpoint;

  const lines = [`curl -X POST '${urlWithQuery}'`, "  -H 'Content-Type: application/json'"];

  Object.entries(headers || {}).forEach(([key, value]) => {
    lines.push(`  -H '${key}: ${String(value)}'`);
  });

  lines.push("  -d '{\"jsonrpc\":\"2.0\",\"id\":\"list-tools\",\"method\":\"list_tools\"}'");
  return lines.join(' \\\n');
}

export default function McpConnectionExamples({
  endpoint,
  authSamples,
  projectApiKey,
  requireApiKey,
}) {
  const baseHeaders = authSamples?.headers || {};
  const baseQuery = authSamples?.query || {};
  const allowNoAuth = !requireApiKey;
  const [authMode, setAuthMode] = useState(MODE_API_KEY);
  const resolvedProjectKey = projectApiKey || '<PROJECT_API_KEY>';
  const includeApiKey = requireApiKey || authMode === MODE_API_KEY;

  const { connectionJson, curlCommand } = useMemo(() => {
    const headers = { ...baseHeaders };
    if (includeApiKey) {
      headers['x-api-key'] = resolvedProjectKey;
    } else {
      delete headers['x-api-key'];
      delete headers['X-API-Key'];
    }
    const query = { ...baseQuery };
    return {
      connectionJson: formatConnectionPayload(endpoint, headers, query),
      curlCommand: buildCurlCommand(endpoint, headers, query),
    };
  }, [baseHeaders, baseQuery, endpoint, includeApiKey, resolvedProjectKey]);

  return (
    <>
      <div className="detail-stack">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <h3>Connection payload</h3>
            <p className="helper-text">
              Choose how the MCP client should authenticate when calling this endpoint.
            </p>
          </div>
          <label className="field" style={{ minWidth: '220px' }}>
            <span>Auth option</span>
            <select
              value={authMode}
              onChange={(event) => setAuthMode(event.target.value)}
              disabled={!allowNoAuth}
            >
              <option value={MODE_API_KEY}>Project API key (x-api-key)</option>
              {allowNoAuth ? <option value={MODE_NONE}>No API key (public HTTP)</option> : null}
            </select>
            {!allowNoAuth ? (
              <span className="helper-text">This MCP server requires the project x-api-key.</span>
            ) : (
              <span className="helper-text">Select "No API key" to allow unauthenticated HTTP clients.</span>
            )}
          </label>
        </div>
        <pre className="code-block">{connectionJson}</pre>
      </div>
      <div className="detail-stack">
        <h3>JSON-RPC cURL example</h3>
        <pre className="code-block">{curlCommand}</pre>
      </div>
    </>
  );
}
