'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function toBoolean(value) {
  return value === 'on' || value === true || value === 'true';
}

export default function McpServerForm({ projectId, initialServer }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = Boolean(initialServer?.id);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    payload.isEnabled = toBoolean(payload.isEnabled);
    payload.requireApiKey = toBoolean(payload.requireApiKey ?? true);

    if (isEdit) {
      payload.id = initialServer.id;
    } else {
      payload.projectId = projectId;
    }

    setMessage('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/mcp-servers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || (isEdit ? 'Unable to update MCP server' : 'Unable to create MCP server'));
        return;
      }

      const nextProjectId = searchParams.get('projectId') || initialServer?.projectId || projectId;
      if (isEdit) {
        const serverId = initialServer?.id || data?.server?.id;
        const nextUrl = serverId
          ? nextProjectId
            ? `/mcp-servers/${serverId}?projectId=${nextProjectId}`
            : `/mcp-servers/${serverId}`
          : nextProjectId
          ? `/mcp-servers?projectId=${nextProjectId}`
          : '/mcp-servers';
        router.push(nextUrl);
      } else {
        const newServerId = data?.server?.id;
        if (newServerId) {
          const manageUrl = nextProjectId
            ? `/mcp-servers/${newServerId}/tools?projectId=${nextProjectId}`
            : `/mcp-servers/${newServerId}/tools`;
          router.push(manageUrl);
        } else {
          const nextUrl = nextProjectId ? `/mcp-servers?projectId=${nextProjectId}` : '/mcp-servers';
          router.push(nextUrl);
        }
      }
      router.refresh();
    } catch (error) {
      console.error(isEdit ? 'Failed to update MCP server' : 'Failed to create MCP server', error);
      setMessage(isEdit ? 'Unable to update MCP server' : 'Unable to create MCP server');
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
            <input
              id="mcp-name"
              name="name"
              placeholder="Internal MCP server"
              required
              defaultValue={initialServer?.name || ''}
            />
          </div>
          <div className="field">
            <label htmlFor="mcp-slug">Slug</label>
            <input id="mcp-slug" name="slug" placeholder="mcp-internal" defaultValue={initialServer?.slug || ''} />
            <p className="helper-text">Lowercase, no spaces. We’ll slugify if left blank.</p>
          </div>
          <div className="field">
            <label htmlFor="mcp-description">Description</label>
            <textarea
              id="mcp-description"
              name="description"
              rows={4}
              placeholder="Optional description"
              defaultValue={initialServer?.description || ''}
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Network</h3>
          <p>Where does this MCP server proxy traffic?</p>
          <div className="field">
            <label htmlFor="mcp-base-url">Base URL</label>
            <input
              id="mcp-base-url"
              name="baseUrl"
              placeholder="http://localhost:3000"
              defaultValue={initialServer?.baseUrl || ''}
            />
            <p className="helper-text">Use your dev tunnel, ngrok, or production base URL.</p>
          </div>
          <label className="field" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" name="isEnabled" defaultChecked={initialServer ? initialServer.isEnabled : true} /> Enable immediately
          </label>
          <label className="field" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <input
              type="checkbox"
              name="requireApiKey"
              defaultChecked={initialServer ? initialServer.requireApiKey : true}
            />
            Require x-api-key on MCP calls
          </label>
        </div>
      </div>
      {message ? <p className="error">{message}</p> : null}
      <button className="btn" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create MCP server'}
      </button>
    </form>
  );
}
