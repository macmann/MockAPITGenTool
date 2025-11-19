'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';

import {
  parseOpenApiSpec,
  extractOpenApiOperations,
  inferBaseUrlFromSpec,
  inferOpenApiAuth,
  OPENAPI_SNIPPET,
} from '../../lib/openapi-tools.js';
import { ensureUniqueToolName } from '../../lib/tool-utils.js';

function normalizeOperationDisplay(operation, usedNames) {
  return {
    ...operation,
    selected: true,
    toolName: ensureUniqueToolName(operation.suggestedName || operation.operationId, usedNames),
    description: operation.description || operation.summary || '',
  };
}

export default function OpenApiToolImporter({
  serverId,
  projectId,
  defaultBaseUrl = '',
  existingToolNames = [],
}) {
  const router = useRouter();
  const [rawSpec, setRawSpec] = useState('');
  const [specUrl, setSpecUrl] = useState('');
  const [operations, setOperations] = useState([]);
  const [authHint, setAuthHint] = useState(null);
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl || '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const highlightSpec = useCallback((code) => {
    const trimmed = code.trim();
    const language = trimmed.startsWith('{') ? 'json' : 'yaml';
    const grammar = Prism.languages[language] || Prism.languages.yaml || Prism.languages.json;
    return Prism.highlight(code, grammar, language);
  }, []);

  const projectSuffix = projectId ? `?projectId=${projectId}` : '';
  const selectedOperations = useMemo(
    () => operations.filter((op) => op.selected),
    [operations],
  );

  const handleFetchSpec = async () => {
    if (!specUrl) {
      setError('Enter a URL to fetch the OpenAPI document.');
      return;
    }
    setError('');
    setStatus('Fetching OpenAPI document…');
    try {
      const response = await fetch(specUrl);
      if (!response.ok) {
        throw new Error('Unable to download the OpenAPI document (check CORS or auth).');
      }
      const text = await response.text();
      setRawSpec(text);
      setStatus('Document downloaded. Click “Preview operations” to continue.');
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  };

  const handlePreview = () => {
    setError('');
    setStatus('Parsing OpenAPI document…');
    setIsParsing(true);
    try {
      const { document } = parseOpenApiSpec(rawSpec);
      const ops = extractOpenApiOperations(document);
      const used = new Set(existingToolNames);
      const normalized = ops.map((op) => normalizeOperationDisplay(op, used));
      setOperations(normalized);
      setBaseUrl(inferBaseUrlFromSpec(document) || defaultBaseUrl || '');
      setAuthHint(inferOpenApiAuth(document));
      setStatus(`${normalized.length} operations ready. Select the ones you need.`);
    } catch (err) {
      setError(err.message);
      setOperations([]);
      setStatus('');
    } finally {
      setIsParsing(false);
    }
  };

  const toggleOperation = (opId, selected) => {
    setOperations((previous) =>
      previous.map((op) => (op.id === opId ? { ...op, selected } : op)),
    );
  };

  const updateOperation = (opId, updates) => {
    setOperations((previous) =>
      previous.map((op) => (op.id === opId ? { ...op, ...updates } : op)),
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    if (selectedOperations.length === 0) {
      setError('Select at least one operation to continue.');
      return;
    }

    const payload = {
      mode: 'openapi',
      baseUrl,
      operations: selectedOperations.map((op) => ({
        operationId: op.operationId,
        method: op.method,
        path: op.path,
        toolName: op.toolName,
        summary: op.summary,
        description: op.description,
        queryParams: op.queryParams.map((param) => ({
          name: param.name,
          type: param.schema?.type || param.type,
          description: param.description,
          required: param.required,
        })),
        pathParams: op.pathParams.map((param) => ({ name: param.name || param })),
        bodyProperties: op.bodyProperties,
      })),
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/mcp-servers/${serverId}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save OpenAPI operations');
      }
      setStatus(`Created ${data?.created?.length || selectedOperations.length} tools.`);
      router.push(`/mcp-servers/${serverId}/tools${projectSuffix}`);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card">
      <header>
        <div>
          <h3>From OpenAPI spec</h3>
          <p>Paste JSON/YAML or fetch it via URL, preview the operations, and import what you need.</p>
        </div>
      </header>
      <div className="stack" style={{ gap: '1rem' }}>
        <label className="stack">
          <span>Fetch from URL (optional)</span>
          <div className="inline" style={{ gap: '0.5rem' }}>
            <input
              type="url"
              placeholder="https://api.example.com/openapi.json"
              value={specUrl}
              onChange={(event) => setSpecUrl(event.target.value)}
            />
            <button className="btn secondary" type="button" onClick={handleFetchSpec}>
              Fetch
            </button>
          </div>
        </label>
        <label className="stack code-editor-field">
          <span>OpenAPI document</span>
          <div className="code-editor">
            <Editor
              value={rawSpec}
              onValueChange={setRawSpec}
              highlight={highlightSpec}
              padding={12}
              textareaId="openapi-spec"
              placeholder={OPENAPI_SNIPPET}
              className="code-editor__editor"
              style={{
                fontFamily: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
                fontSize: '0.9rem',
                minHeight: '320px',
              }}
            />
          </div>
        </label>
        <div className="inline" style={{ gap: '0.5rem' }}>
          <button className="btn" type="button" onClick={handlePreview} disabled={isParsing}>
            {isParsing ? 'Parsing…' : 'Preview operations'}
          </button>
          {status ? <span className="success">{status}</span> : null}
        </div>
        {!operations.length && error ? <p className="error">{error}</p> : null}
        {authHint && authHint.auth_type && authHint.auth_type !== 'none' ? (
          <div className="flash flash-info">
            Auth detected: <strong>{authHint.auth_type}</strong>. Configure actual secrets under MCP Auth.
          </div>
        ) : null}
        {operations.length > 0 ? (
          <form onSubmit={handleSubmit} className="stack" style={{ gap: '1rem' }}>
            <label className="stack">
              <span>Base URL for these operations</span>
              <input
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com"
              />
            </label>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '2rem' }}></th>
                    <th>Tool name</th>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Summary</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.map((op) => (
                    <tr key={op.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={op.selected}
                          onChange={(event) => toggleOperation(op.id, event.target.checked)}
                          aria-label={`Select ${op.method} ${op.path}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={op.toolName}
                          onChange={(event) => updateOperation(op.id, { toolName: event.target.value })}
                          placeholder="tool_name"
                        />
                      </td>
                      <td>
                        <span className="badge">{op.method}</span>
                      </td>
                      <td>
                        <code>{op.path}</code>
                      </td>
                      <td>{op.summary || '—'}</td>
                      <td>
                        <textarea
                          rows={3}
                          value={op.description}
                          onChange={(event) => updateOperation(op.id, { description: event.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving tools…'
                : `Create ${selectedOperations.length} tool${selectedOperations.length === 1 ? '' : 's'}`}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
