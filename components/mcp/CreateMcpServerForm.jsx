'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function toBoolean(value) {
  return value === 'on' || value === true || value === 'true';
}

export default function CreateMcpServerForm({ projectId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    payload.projectId = projectId;
    payload.isEnabled = toBoolean(payload.isEnabled);

    setMessage('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || 'Unable to create MCP server');
        return;
      }

      const nextProjectId = searchParams.get('projectId') || projectId;
      const nextUrl = nextProjectId ? `/mcp-servers?projectId=${nextProjectId}` : '/mcp-servers';
      router.push(nextUrl);
      router.refresh();
    } catch (error) {
      console.error('Failed to create MCP server', error);
      setMessage('Unable to create MCP server');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-section">
          <h3>Server identity</h3>
          <p>Name and slug are how the MCP tools reference this server.</p>
          <div className="field">
            <label htmlFor="mcp-name">Name</label>
            <input id="mcp-name" name="name" placeholder="Internal MCP server" required />
          </div>
          <div className="field">
            <label htmlFor="mcp-slug">Slug</label>
            <input id="mcp-slug" name="slug" placeholder="mcp-internal" />
            <p className="helper-text">Lowercase, no spaces. We’ll slugify if left blank.</p>
          </div>
          <div className="field">
            <label htmlFor="mcp-description">Description</label>
            <textarea id="mcp-description" name="description" rows={4} placeholder="Optional description" />
          </div>
        </div>

        <div className="form-section">
          <h3>Network</h3>
          <p>Where does this MCP server proxy traffic?</p>
          <div className="field">
            <label htmlFor="mcp-base-url">Base URL</label>
            <input id="mcp-base-url" name="baseUrl" placeholder="http://localhost:3000" />
            <p className="helper-text">Use your dev tunnel, ngrok, or production base URL.</p>
          </div>
          <label className="field" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" name="isEnabled" defaultChecked /> Enable immediately
          </label>
        </div>
      </div>
      {message ? <p className="error">{message}</p> : null}
      <button className="btn" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Create MCP server'}
      </button>
    </form>
  );
}
