'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_FORMAT = 'json';

export default function LegacyOpenApiSpecsPanel({ projectId, specs = [] }) {
  const router = useRouter();
  const [format, setFormat] = useState(DEFAULT_FORMAT);
  const [rawSpec, setRawSpec] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [editingSpec, setEditingSpec] = useState(null);
  const [isPending, startTransition] = useTransition();

  const sortedSpecs = useMemo(() => {
    return [...specs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [specs]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ type: '', message: '' });

    try {
      const payload = {
        id: editingSpec?.id,
        projectId,
        format,
        rawSpec
      };

      const response = await fetch('/api/openapi-specs', {
        method: editingSpec ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save OpenAPI spec');
      }

      setStatus({ type: 'success', message: editingSpec ? 'Spec updated' : 'Spec saved' });
      setEditingSpec(null);
      setRawSpec('');
      setFormat(DEFAULT_FORMAT);
      startTransition(() => router.refresh());
    } catch (error) {
      console.error('Failed to persist spec', error);
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (specId) => {
    if (!specId) return;
    if (!window.confirm('Delete this spec? Tool mappings referencing it will lose the relation.')) return;

    setStatus({ type: '', message: '' });
    try {
      const response = await fetch(`/api/openapi-specs?id=${specId}&projectId=${projectId}`, {
        method: 'DELETE'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to delete spec');
      }

      if (editingSpec?.id === specId) {
        setEditingSpec(null);
        setRawSpec('');
        setFormat(DEFAULT_FORMAT);
      }
      setStatus({ type: 'success', message: 'Spec removed' });
      startTransition(() => router.refresh());
    } catch (error) {
      console.error('Failed to delete spec', error);
      setStatus({ type: 'error', message: error.message });
    }
  };

  const beginEdit = (spec) => {
    setEditingSpec(spec);
    setRawSpec(spec.rawSpec || '');
    setFormat(spec.format || DEFAULT_FORMAT);
  };

  return (
    <div className="surface-card surface-card--stacked">
      <header className="section-heading">
        <div>
          <h3>OpenAPI specs</h3>
          <p>Upload or paste raw specs that describe the APIs inside this project.</p>
        </div>
        <span className="status-pill">{sortedSpecs.length} total</span>
      </header>

      {status.message ? (
        <div className={`flash ${status.type === 'success' ? 'flash-success' : 'flash-error'}`}>{status.message}</div>
      ) : null}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Spec</th>
              <th>Format</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedSpecs.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={4}>
                  Import a JSON/YAML document that documents your endpoints.
                </td>
              </tr>
            ) : (
              sortedSpecs.map((spec) => (
                <tr key={spec.id}>
                  <td>
                    <strong>Spec #{spec.id}</strong>
                    <p className="legacy-subtle">Linked to project #{spec.projectId}</p>
                  </td>
                  <td>{spec.format}</td>
                  <td className="legacy-subtle">{new Date(spec.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn ghost" type="button" onClick={() => beginEdit(spec)}>
                        Edit
                      </button>
                      <button className="btn danger" type="button" onClick={() => handleDelete(spec.id)}>
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
        <h4>{editingSpec ? 'Edit spec' : 'Add spec'}</h4>
        <label>
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
          </select>
        </label>
        <label>
          Raw spec
          <textarea
            required
            placeholder='{"openapi": "3.1.0", ...}'
            value={rawSpec}
            onChange={(event) => setRawSpec(event.target.value)}
          />
        </label>
        <div className="project-actions">
          <button className="btn" type="submit" disabled={isSaving || isPending}>
            {isSaving ? 'Saving…' : editingSpec ? 'Save spec' : 'Upload spec'}
          </button>
          {editingSpec ? (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setEditingSpec(null);
                setRawSpec('');
                setFormat(DEFAULT_FORMAT);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
