'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const AUTH_OPTIONS = [
  { value: 'none', label: 'No auth' },
  { value: 'api_key_header', label: 'API key header' },
  { value: 'api_key_query', label: 'API key query' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic', label: 'Basic auth' }
];

const DEFAULT_FORM = {
  baseUrl: '',
  authType: 'none',
  apiKeyHeaderName: '',
  apiKeyHeaderValue: '',
  apiKeyQueryName: '',
  apiKeyQueryValue: '',
  bearerToken: '',
  basicUsername: '',
  basicPassword: '',
  extraHeaders: ''
};

export default function LegacyApiConnectionsPanel({ projectId, connections = [] }) {
  const router = useRouter();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sortedConnections = useMemo(() => {
    return [...connections].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [connections]);

  const setField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
  };

  const startEdit = (connection) => {
    setEditingId(connection.id);
    setForm({
      baseUrl: connection.baseUrl || '',
      authType: connection.authType || 'none',
      apiKeyHeaderName: connection.apiKeyHeaderName || '',
      apiKeyHeaderValue: connection.apiKeyHeaderValue || '',
      apiKeyQueryName: connection.apiKeyQueryName || '',
      apiKeyQueryValue: connection.apiKeyQueryValue || '',
      bearerToken: connection.bearerToken || '',
      basicUsername: connection.basicUsername || '',
      basicPassword: connection.basicPassword || '',
      extraHeaders: connection.extraHeaders ? JSON.stringify(connection.extraHeaders, null, 2) : ''
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ type: '', message: '' });

    try {
      let parsedHeaders;
      if (form.extraHeaders) {
        try {
          parsedHeaders = JSON.parse(form.extraHeaders);
        } catch (error) {
          throw new Error('Extra headers must be valid JSON');
        }
      }
      const payload = {
        ...form,
        projectId,
        id: editingId,
        extraHeaders: parsedHeaders
      };

      const response = await fetch('/api/api-connections', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save connection');
      }

      setStatus({ type: 'success', message: editingId ? 'Connection updated' : 'Connection created' });
      resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      console.error('Failed to save api connection', error);
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (connectionId) => {
    if (!connectionId) return;
    if (!window.confirm('Delete this MCP server configuration?')) return;

    setStatus({ type: '', message: '' });
    try {
      const response = await fetch(`/api/api-connections?id=${connectionId}&projectId=${projectId}`, {
        method: 'DELETE'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to delete connection');
      }

      setStatus({ type: 'success', message: 'Connection deleted' });
      if (editingId === connectionId) {
        resetForm();
      }
      startTransition(() => router.refresh());
    } catch (error) {
      console.error('Failed to delete connection', error);
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <div className="surface-card surface-card--stacked">
      <header className="section-heading">
        <div>
          <h3>MCP servers</h3>
          <p>Connections inherit this project and user automatically.</p>
        </div>
        <span className="status-pill">{sortedConnections.length} total</span>
      </header>

      {status.message ? (
        <div className={`flash ${status.type === 'success' ? 'flash-success' : 'flash-error'}`}>{status.message}</div>
      ) : null}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Name / Base URL</th>
              <th>Auth</th>
              <th>Extra headers</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedConnections.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={5}>
                  No MCP servers yet. Configure an API base URL and auth to start mapping tools.
                </td>
              </tr>
            ) : (
              sortedConnections.map((connection) => (
                <tr key={connection.id}>
                  <td>
                    <strong>{connection.baseUrl || 'No base URL set'}</strong>
                    <p className="legacy-subtle">Connection #{connection.id}</p>
                  </td>
                  <td>
                    <span className="status-badge status-badge--success">{connection.authType || 'none'}</span>
                  </td>
                  <td className="legacy-subtle" style={{ whiteSpace: 'pre-wrap' }}>
                    {connection.extraHeaders ? JSON.stringify(connection.extraHeaders) : '—'}
                  </td>
                  <td className="legacy-subtle">{new Date(connection.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn ghost" type="button" onClick={() => startEdit(connection)}>
                        Edit
                      </button>
                      <button className="btn danger" type="button" onClick={() => handleDelete(connection.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form className="legacy-form" onSubmit={handleSubmit}>
        <h4>{editingId ? 'Edit server' : 'Add MCP server'}</h4>
        <label>
          Base URL
          <input
            type="url"
            required
            placeholder="https://api.example.com"
            value={form.baseUrl}
            onChange={(event) => setField('baseUrl', event.target.value)}
          />
        </label>
        <label>
          Auth type
          <select value={form.authType} onChange={(event) => setField('authType', event.target.value)}>
            {AUTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="legacy-form field-row">
          <label>
            Header name
            <input
              type="text"
              placeholder="x-api-key"
              value={form.apiKeyHeaderName}
              onChange={(event) => setField('apiKeyHeaderName', event.target.value)}
            />
          </label>
          <label>
            Header value
            <input
              type="text"
              placeholder="secret"
              value={form.apiKeyHeaderValue}
              onChange={(event) => setField('apiKeyHeaderValue', event.target.value)}
            />
          </label>
        </div>
        <div className="legacy-form field-row">
          <label>
            Query name
            <input
              type="text"
              placeholder="api_key"
              value={form.apiKeyQueryName}
              onChange={(event) => setField('apiKeyQueryName', event.target.value)}
            />
          </label>
          <label>
            Query value
            <input
              type="text"
              placeholder="secret"
              value={form.apiKeyQueryValue}
              onChange={(event) => setField('apiKeyQueryValue', event.target.value)}
            />
          </label>
        </div>
        <div className="legacy-form field-row">
          <label>
            Bearer token
            <input
              type="text"
              placeholder="token"
              value={form.bearerToken}
              onChange={(event) => setField('bearerToken', event.target.value)}
            />
          </label>
          <label>
            Basic auth username
            <input
              type="text"
              placeholder="user"
              value={form.basicUsername}
              onChange={(event) => setField('basicUsername', event.target.value)}
            />
          </label>
          <label>
            Basic auth password
            <input
              type="password"
              placeholder="••••••"
              value={form.basicPassword}
              onChange={(event) => setField('basicPassword', event.target.value)}
            />
          </label>
        </div>
        <label>
          Extra headers (JSON)
          <textarea
            placeholder='{"x-trace-id": "123"}'
            value={form.extraHeaders}
            onChange={(event) => setField('extraHeaders', event.target.value)}
          />
        </label>
        <div className="project-actions">
          <button className="btn" type="submit" disabled={isSaving || isPending}>
            {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Create server'}
          </button>
          {editingId ? (
            <button className="btn ghost" type="button" onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
