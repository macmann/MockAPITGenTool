'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const templates = {
  success: {
    label: '200 JSON success',
    status: 200,
    body: '{\n  "message": "Success",\n  "data": []\n}',
  },
  notFound: {
    label: '404 not found',
    status: 404,
    body: '{\n  "error": "Not Found",\n  "code": 404\n}',
  },
  serverError: {
    label: '500 server error',
    status: 500,
    body: '{\n  "error": "Something went wrong"\n}',
  },
};

function toBoolean(value) {
  return value === 'on' || value === true || value === 'true';
}

export default function RouteForm({ projectId, initialRoute }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = Boolean(initialRoute?.id);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const templateKey = payload.quickTemplate;
    if (!payload.responseBody && templates[templateKey]) {
      payload.responseBody = templates[templateKey].body;
      payload.responseStatus = templates[templateKey].status;
    }

    payload.enabled = toBoolean(payload.enabled);
    payload.responseIsJson = toBoolean(payload.responseIsJson);
    payload.templateEnabled = toBoolean(payload.templateEnabled);
    payload.requireApiKey = toBoolean(payload.requireApiKey ?? true);
    payload.responseDelayMs = Number(payload.responseDelayMs || 0);

    if (isEdit) {
      payload.id = initialRoute.id;
    } else {
      payload.projectId = projectId;
    }

    setMessage('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/mock-routes', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || (isEdit ? 'Unable to update route' : 'Unable to create route'));
        return;
      }

      const nextProjectId = searchParams.get('projectId') || initialRoute?.projectId || projectId;
      if (isEdit) {
        const targetRouteId = initialRoute?.id || data?.route?.id;
        const nextUrl = targetRouteId
          ? nextProjectId
            ? `/routes/${targetRouteId}?projectId=${nextProjectId}`
            : `/routes/${targetRouteId}`
          : nextProjectId
          ? `/routes?projectId=${nextProjectId}`
          : '/routes';
        router.push(nextUrl);
      } else {
        const nextUrl = nextProjectId ? `/routes?projectId=${nextProjectId}` : '/routes';
        router.push(nextUrl);
      }
      router.refresh();
    } catch (error) {
      console.error(isEdit ? 'Failed to update route' : 'Failed to create route', error);
      setMessage(isEdit ? 'Unable to update route' : 'Unable to create route');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-section">
          <h3>Step 1 – Name it</h3>
          <p>Give the route a recognizable name so your teammates know what it returns.</p>
          <div className="field">
            <label htmlFor="route-name">Name</label>
            <input
              id="route-name"
              name="name"
              placeholder="Catalog search"
              required
              defaultValue={initialRoute?.name || ''}
            />
          </div>
          <div className="field">
            <label htmlFor="route-description">Description</label>
            <input
              id="route-description"
              name="description"
              placeholder="Optional summary"
              defaultValue={initialRoute?.description || ''}
            />
            <p className="helper-text">Short hint for future you.</p>
          </div>
          <label className="field" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" name="enabled" defaultChecked={initialRoute ? initialRoute.enabled : true} /> Enable immediately
          </label>
        </div>

        <div className="form-section">
          <h3>Step 2 – Method + URL</h3>
          <p>Define how the MCP tool will call this mock endpoint.</p>
          <div className="field">
            <label htmlFor="route-method">Method</label>
            <select id="route-method" name="method" defaultValue={initialRoute?.method || 'GET'}>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="route-path">Path</label>
            <input
              id="route-path"
              name="path"
              placeholder="/api/v1/catalog"
              required
              defaultValue={initialRoute?.path || ''}
            />
            <p className="helper-text">Relative path only. Example: /catalog/items</p>
          </div>
          <div className="field">
            <label htmlFor="route-delay">Delay (ms)</label>
            <input
              id="route-delay"
              type="number"
              name="responseDelayMs"
              placeholder="0"
              min="0"
              defaultValue={
                initialRoute && typeof initialRoute.responseDelayMs === 'number'
                  ? initialRoute.responseDelayMs
                  : ''
              }
            />
          </div>
          <label className="field" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" name="requireApiKey" defaultChecked={initialRoute ? initialRoute.requireApiKey : true} /> Require x-api-key header
          </label>
        </div>

        <div className="form-section">
          <h3>Step 3 – Response</h3>
          <p>Use templates or a custom JSON payload to simulate the backend.</p>
          <div className="field">
            <label htmlFor="route-template">Quick template</label>
            <select id="route-template" name="quickTemplate" defaultValue="">
              <option value="">Custom</option>
              {Object.entries(templates).map(([value, template]) => (
                <option key={value} value={value}>
                  {template.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="route-status">Status code</label>
            <select id="route-status" name="responseStatus" defaultValue={String(initialRoute?.responseStatus ?? 200)}>
              {[200, 201, 204, 400, 401, 403, 404, 500].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="route-response">Response body</label>
            <textarea
              id="route-response"
              name="responseBody"
              rows={8}
              placeholder={'{\n  "message": "Example response",\n  "data": []\n}'}
              defaultValue={initialRoute?.responseBody || ''}
            />
          </div>
          <label className="field" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" name="responseIsJson" defaultChecked={initialRoute ? initialRoute.responseIsJson : true} /> Format as JSON
          </label>
          <label className="field" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" name="templateEnabled" defaultChecked={initialRoute ? initialRoute.templateEnabled : false} /> Enable Handlebars templates
          </label>
        </div>
      </div>
      {message ? <p className="error">{message}</p> : null}
      <button className="btn" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create route'}
      </button>
    </form>
  );
}
