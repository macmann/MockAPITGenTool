'use client';

import { useEffect, useState } from 'react';

const INITIAL_SERVER = {
  name: '',
  slug: '',
  description: '',
  baseUrl: '',
  isEnabled: true
};

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function LegacyMcpServerForm({ projectId, server, onSaved, onReset, onRefresh }) {
  const [form, setForm] = useState(INITIAL_SERVER);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (server) {
      setForm({
        name: server.name || '',
        slug: server.slug || '',
        description: server.description || '',
        baseUrl: server.baseUrl || '',
        isEnabled: server.isEnabled !== false
      });
    } else {
      setForm(INITIAL_SERVER);
    }
    setMessage('');
    setMessageType('success');
  }, [server]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    const payload = {
      id: server?.id,
      projectId,
      name: form.name,
      slug: form.slug || slugify(form.name),
      description: form.description,
      baseUrl: form.baseUrl,
      isEnabled: form.isEnabled
    };

    const response = await fetch('/api/mcp-servers', {
      method: server?.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessageType('error');
      setMessage(data?.error || 'Unable to save MCP server');
      setIsSubmitting(false);
      return;
    }

    onSaved?.(data.server);
    if (!server) {
      setForm(INITIAL_SERVER);
    }
    setMessageType('success');
    setMessage('Server saved');
    setIsSubmitting(false);
    onRefresh?.();
  };

  const handleDelete = async () => {
    if (!server?.id) return;
    if (!window.confirm('Delete this MCP server?')) return;
    setIsSubmitting(true);
    setMessage('');
    const response = await fetch(`/api/mcp-servers?id=${server.id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessageType('error');
      setMessage(data?.error || 'Unable to delete server');
      setIsSubmitting(false);
      return;
    }
    setMessageType('success');
    setMessage('Server deleted');
    onRefresh?.();
    onReset?.();
    setForm(INITIAL_SERVER);
    setIsSubmitting(false);
  };

  return (
    <section className="surface-card surface-card--stacked">
      <header className="section-heading">
        <div>
          <h3>{server ? 'Edit MCP server' : 'Create MCP server'}</h3>
          <p className="muted" style={{ margin: 0 }}>Same controls as the Express admin—name, slug, base URL, enabled flag.</p>
        </div>
        {server ? (
          <button className="button secondary" type="button" onClick={() => onReset?.()}>
            New server
          </button>
        ) : null}
      </header>

      {message ? <div className={`flash ${messageType === 'error' ? 'flash-error' : 'flash-success'}`}>{message}</div> : null}

      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-grid form-grid--two">
          <label className="stack">
            <span>Name</span>
            <input name="name" value={form.name} onChange={handleChange} placeholder="Internal MCP server" />
          </label>
          <label className="stack">
            <span>Slug</span>
            <input name="slug" value={form.slug} onChange={handleChange} placeholder="mcp-internal" />
            <small className="muted">Lowercase letters, digits, hyphens.</small>
          </label>
        </div>
        <label className="stack">
          <span>Description</span>
          <input name="description" value={form.description} onChange={handleChange} placeholder="Optional notes" />
        </label>
        <label className="stack">
          <span>Base URL</span>
          <input name="baseUrl" value={form.baseUrl} onChange={handleChange} placeholder="http://localhost:3000" />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="isEnabled" checked={form.isEnabled} onChange={handleChange} />
          <span>Enable immediately</span>
        </label>

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save server'}
        </button>
      </form>

      {server ? (
        <section>
          <header className="section-heading">
            <div>
              <h3>Danger zone</h3>
              <p className="muted" style={{ margin: 0 }}>Deleting removes the MCP path and its tool wiring.</p>
            </div>
          </header>
          <button className="button contrast" type="button" onClick={handleDelete} disabled={isSubmitting}>
            Delete server
          </button>
        </section>
      ) : null}
    </section>
  );
}
