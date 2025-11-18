'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const DEFAULT_FORM = {
  toolName: '',
  operationId: '',
  method: 'GET',
  path: '',
  summary: '',
  description: '',
  openApiSpecId: '',
  apiConnectionId: ''
};

export default function LegacyToolMappingsPanel({ projectId, specs = [], connections = [], toolMappings = [] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...DEFAULT_FORM,
    openApiSpecId: specs[0]?.id || '',
    apiConnectionId: connections[0]?.id || ''
  });
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (editingId) return;
    setForm((previous) => ({
      ...previous,
      openApiSpecId: previous.openApiSpecId || specs[0]?.id || '',
      apiConnectionId: previous.apiConnectionId || connections[0]?.id || ''
    }));
  }, [specs, connections, editingId]);

  const sortedMappings = useMemo(() => {
    return [...toolMappings].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [toolMappings]);

  const setField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      ...DEFAULT_FORM,
      openApiSpecId: specs[0]?.id || '',
      apiConnectionId: connections[0]?.id || ''
    });
    setEditingId(null);
  };

  const beginEdit = (mapping) => {
    setEditingId(mapping.id);
    setForm({
      toolName: mapping.toolName || '',
      operationId: mapping.operationId || '',
      method: mapping.method || 'GET',
      path: mapping.path || '',
      summary: mapping.summary || '',
      description: mapping.description || '',
      openApiSpecId: mapping.openApiSpecId || specs[0]?.id || '',
      apiConnectionId: mapping.apiConnectionId || connections[0]?.id || ''
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ type: '', message: '' });

    try {
      const payload = {
        ...form,
        projectId,
        id: editingId
      };

      const response = await fetch('/api/tool-mappings', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save tool mapping');
      }

      setStatus({ type: 'success', message: editingId ? 'Mapping updated' : 'Mapping created' });
      resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      console.error('Failed to persist mapping', error);
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (mappingId) => {
    if (!mappingId) return;
    if (!window.confirm('Delete this tool mapping?')) return;

    setStatus({ type: '', message: '' });
    try {
      const response = await fetch(`/api/tool-mappings?id=${mappingId}&projectId=${projectId}`, {
        method: 'DELETE'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to delete mapping');
      }

      if (editingId === mappingId) {
        resetForm();
      }
      setStatus({ type: 'success', message: 'Mapping removed' });
      startTransition(() => router.refresh());
    } catch (error) {
      console.error('Failed to delete mapping', error);
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <div className="surface-card surface-card--stacked">
      <header className="section-heading">
        <div>
          <h3>Mock endpoints → MCP tools</h3>
          <p>Map OpenAPI operations to tool-friendly descriptions.</p>
        </div>
        <span className="status-pill">{sortedMappings.length} total</span>
      </header>

      {status.message ? (
        <div className={`flash ${status.type === 'success' ? 'flash-success' : 'flash-error'}`}>{status.message}</div>
      ) : null}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Method</th>
              <th>Path</th>
              <th>Spec</th>
              <th>API</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMappings.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={6}>
                  No mappings yet. Use the form below to wire an OpenAPI operation to an MCP tool.
                </td>
              </tr>
            ) : (
              sortedMappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td>
                    <strong>{mapping.toolName}</strong>
                    <p className="legacy-subtle">{mapping.summary || 'No summary yet'}</p>
                  </td>
                  <td>
                    <span className="status-badge status-badge--success">{mapping.method}</span>
                  </td>
                  <td>
                    <code>{mapping.path}</code>
                  </td>
                  <td>{mapping.openApiSpecId ? `Spec #${mapping.openApiSpecId}` : '—'}</td>
                  <td>{mapping.apiConnectionId ? `Conn #${mapping.apiConnectionId}` : '—'}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn ghost" type="button" onClick={() => beginEdit(mapping)}>
                        Edit
                      </button>
                      <button className="btn danger" type="button" onClick={() => handleDelete(mapping.id)}>
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
        <h4>{editingId ? 'Edit mapping' : 'Add mapping'}</h4>
        <div className="legacy-form field-row">
          <label>
            Tool name
            <input
              type="text"
              required
              placeholder="billing_lookup"
              value={form.toolName}
              onChange={(event) => setField('toolName', event.target.value)}
            />
          </label>
          <label>
            Operation ID
            <input
              type="text"
              required
              placeholder="getInvoices"
              value={form.operationId}
              onChange={(event) => setField('operationId', event.target.value)}
            />
          </label>
        </div>
        <div className="legacy-form field-row">
          <label>
            Method
            <select value={form.method} onChange={(event) => setField('method', event.target.value)}>
              {METHOD_OPTIONS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label>
            Path
            <input
              type="text"
              required
              placeholder="/v1/invoices/{id}"
              value={form.path}
              onChange={(event) => setField('path', event.target.value)}
            />
          </label>
        </div>
        <label>
          Summary
          <input
            type="text"
            placeholder="Fetches an invoice"
            value={form.summary}
            onChange={(event) => setField('summary', event.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            placeholder="Describe how the MCP tool should present this endpoint"
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </label>
        <div className="legacy-form field-row">
          <label>
            OpenAPI spec
            <select value={form.openApiSpecId} onChange={(event) => setField('openApiSpecId', event.target.value)}>
              <option value="">None</option>
              {specs.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  Spec #{spec.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            API connection
            <select value={form.apiConnectionId} onChange={(event) => setField('apiConnectionId', event.target.value)}>
              <option value="">None</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.baseUrl || `Connection #${connection.id}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="project-actions">
          <button className="btn" type="submit" disabled={isSaving || isPending}>
            {isSaving ? 'Saving…' : editingId ? 'Save mapping' : 'Create mapping'}
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
