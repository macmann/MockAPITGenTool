'use client';

import { useEffect, useState } from 'react';

const METHOD_OPTIONS = [
  { value: 'GET', label: 'GET — Retrieve data' },
  { value: 'POST', label: 'POST — Create something' },
  { value: 'PUT', label: 'PUT — Replace existing data' },
  { value: 'PATCH', label: 'PATCH — Update part of the data' },
  { value: 'DELETE', label: 'DELETE — Remove data' },
  { value: 'OPTIONS', label: 'OPTIONS — Return supported methods' },
  { value: 'HEAD', label: 'HEAD — Retrieve headers only' }
];

const STATUS_CHOICES = [
  { value: '200', label: '200 – OK (success)' },
  { value: '201', label: '201 – Created' },
  { value: '202', label: '202 – Accepted' },
  { value: '204', label: '204 – No content' },
  { value: '400', label: '400 – Bad request' },
  { value: '401', label: '401 – Unauthorized' },
  { value: '403', label: '403 – Forbidden' },
  { value: '404', label: '404 – Not found' },
  { value: '409', label: '409 – Conflict' },
  { value: '422', label: '422 – Validation error' },
  { value: '500', label: '500 – Server error' }
];

const RESPONSE_TEMPLATES = {
  success: {
    body: '{\n  "status": "ok",\n  "message": "Everything worked"\n}',
    status: 200,
    isJson: true
  },
  created: {
    body: '{\n  "status": "created",\n  "id": "123"\n}',
    status: 201,
    isJson: true
  },
  empty: {
    body: '',
    status: 204,
    isJson: false
  },
  not_found: {
    body: '{\n  "error": "Resource not found"\n}',
    status: 404,
    isJson: true
  },
  conflict: {
    body: '{\n  "error": "Conflict detected"\n}',
    status: 409,
    isJson: true
  },
  error: {
    body: '{\n  "error": "Something went wrong"\n}',
    status: 500,
    isJson: true
  }
};

const INITIAL_FORM = {
  name: '',
  description: '',
  enabled: true,
  method: 'GET',
  path: '/',
  responseDelayMs: 0,
  responseStatus: 200,
  responseBody: '',
  responseIsJson: false,
  templateEnabled: false,
  matchHeaders: '{}',
  responseHeaders: '{}'
};

function serializeJson(value) {
  if (!value) return '{\n}';
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return '{\n}';
  }
}

export default function LegacyRouteForm({ projectId, route, onSaved, onReset, onRefresh }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusChoice, setStatusChoice] = useState('200');
  const [customStatus, setCustomStatus] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  useEffect(() => {
    if (route) {
      const nextStatus = String(route.responseStatus || 200);
      setForm({
        name: route.name || '',
        description: route.description || '',
        enabled: route.enabled !== false,
        method: route.method || 'GET',
        path: route.path || '/',
        responseDelayMs: route.responseDelayMs ?? 0,
        responseStatus: route.responseStatus ?? 200,
        responseBody: route.responseBody || '',
        responseIsJson: !!route.responseIsJson,
        templateEnabled: !!route.templateEnabled,
        matchHeaders: serializeJson(route.matchHeaders),
        responseHeaders: serializeJson(route.responseHeaders)
      });
      if (STATUS_CHOICES.some((option) => option.value === nextStatus)) {
        setStatusChoice(nextStatus);
        setCustomStatus('');
      } else {
        setStatusChoice('custom');
        setCustomStatus(nextStatus);
      }
    } else {
      setForm(INITIAL_FORM);
      setStatusChoice('200');
      setCustomStatus('');
    }
    setSelectedTemplate('');
    setMessage('');
    setMessageType('success');
  }, [route]);

  const handleChange = (event) => {
    const { name, type, value, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const applyTemplate = (value) => {
    setSelectedTemplate(value);
    if (!value) return;
    const template = RESPONSE_TEMPLATES[value];
    if (!template) return;
    setForm((current) => ({
      ...current,
      responseBody: template.body,
      responseStatus: template.status,
      responseIsJson: template.isJson,
      templateEnabled: current.templateEnabled || template.body.includes('{{')
    }));
    if (STATUS_CHOICES.some((option) => option.value === String(template.status))) {
      setStatusChoice(String(template.status));
      setCustomStatus('');
    } else {
      setStatusChoice('custom');
      setCustomStatus(String(template.status));
    }
  };

  const parseJsonField = (value, label) => {
    if (!value || value.trim() === '') {
      return {};
    }
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error(`${label} must be a JSON object`);
    } catch (error) {
      throw new Error(`${label} must contain valid JSON`);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    let matchHeaders;
    let responseHeaders;
    try {
      matchHeaders = parseJsonField(form.matchHeaders, 'Match headers');
      responseHeaders = parseJsonField(form.responseHeaders, 'Response headers');
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    if (form.responseIsJson) {
      try {
        JSON.parse(form.responseBody || '{}');
      } catch (error) {
        setMessageType('error');
        setMessage('Response body must be valid JSON when JSON mode is selected');
        setIsSubmitting(false);
        return;
      }
    }

    const statusValue = statusChoice === 'custom' ? Number(customStatus || form.responseStatus || 200) : Number(statusChoice);
    if (!Number.isInteger(statusValue)) {
      setMessageType('error');
      setMessage('Status code must be a number');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      id: route?.id,
      projectId,
      name: form.name,
      description: form.description,
      enabled: form.enabled,
      method: form.method,
      path: form.path,
      responseDelayMs: Number(form.responseDelayMs || 0),
      responseStatus: statusValue,
      responseBody: form.responseBody,
      responseIsJson: form.responseIsJson,
      templateEnabled: form.templateEnabled,
      matchHeaders,
      responseHeaders
    };

    const response = await fetch('/api/mock-routes', {
      method: route?.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessageType('error');
      setMessage(data?.error || 'Unable to save route');
      setIsSubmitting(false);
      return;
    }

    onSaved?.(data.route);
    if (!route) {
      setForm(INITIAL_FORM);
      setStatusChoice('200');
      setCustomStatus('');
    }
    setMessageType('success');
    setMessage('Route saved');
    setIsSubmitting(false);
    onRefresh?.();
  };

  const handleDelete = async () => {
    if (!route?.id) return;
    if (!window.confirm('Delete this route?')) return;
    setIsSubmitting(true);
    setMessage('');
    const response = await fetch(`/api/mock-routes?id=${route.id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessageType('error');
      setMessage(data?.error || 'Unable to delete route');
      setIsSubmitting(false);
      return;
    }
    setMessageType('success');
    setMessage('Route deleted');
    onRefresh?.();
    onReset?.();
    setForm(INITIAL_FORM);
    setIsSubmitting(false);
  };

  return (
    <section className="surface-card surface-card--stacked">
      <header className="section-heading">
        <div>
          <h3>{route ? 'Edit route' : 'Create route'}</h3>
          <p className="muted" style={{ margin: 0 }}>Use the same flow from the Express UI to describe a mock endpoint.</p>
        </div>
        {route ? (
          <button className="button secondary" type="button" onClick={() => onReset?.()}>
            New route
          </button>
        ) : null}
      </header>

      {message ? <div className={`flash ${messageType === 'error' ? 'flash-error' : 'flash-success'}`}>{message}</div> : null}

      <form className="form-stack" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Step 1 · Name it</legend>
          <div className="form-grid form-grid--two">
            <label className="stack">
              <span>Name</span>
              <input name="name" value={form.name} onChange={handleChange} placeholder="Catalog lookup" />
            </label>
            <label className="stack">
              <span>Description</span>
              <input name="description" value={form.description} onChange={handleChange} placeholder="Optional notes" />
            </label>
          </div>
          <label className="checkbox">
            <input type="checkbox" name="enabled" checked={form.enabled} onChange={handleChange} />
            <span>Enable immediately</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Step 2 · Method + URL</legend>
          <div className="form-grid form-grid--three">
            <label className="stack">
              <span>Method</span>
              <select name="method" value={form.method} onChange={handleChange}>
                {METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack">
              <span>Path</span>
              <input name="path" value={form.path} onChange={handleChange} placeholder="/catalog/items" />
            </label>
            <label className="stack">
              <span>Delay (ms)</span>
              <input type="number" name="responseDelayMs" value={form.responseDelayMs} onChange={handleChange} min="0" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Step 3 · Response</legend>
          <div className="form-grid form-grid--two" style={{ alignItems: 'flex-end' }}>
            <label className="stack">
              <span>Quick templates</span>
              <select value={selectedTemplate} onChange={(event) => applyTemplate(event.target.value)}>
                <option value="">Choose a quick response (optional)</option>
                {Object.keys(RESPONSE_TEMPLATES).map((key) => (
                  <option key={key} value={key}>
                    {key.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack">
              <span>Status code</span>
              <select value={statusChoice} onChange={(event) => setStatusChoice(event.target.value)}>
                {STATUS_CHOICES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="custom">Custom status…</option>
              </select>
            </label>
          </div>
          {statusChoice === 'custom' ? (
            <label className="stack">
              <span>Custom status</span>
              <input
                type="number"
                min="100"
                max="599"
                value={customStatus}
                onChange={(event) => setCustomStatus(event.target.value)}
              />
            </label>
          ) : null}
          <label className="stack">
            <span>Response body</span>
            <textarea name="responseBody" value={form.responseBody} onChange={handleChange} rows="6" />
          </label>
          <div className="form-grid form-grid--two">
            <label className="checkbox">
              <input type="checkbox" name="responseIsJson" checked={form.responseIsJson} onChange={handleChange} />
              <span>Format response as JSON</span>
            </label>
            <label className="checkbox">
              <input type="checkbox" name="templateEnabled" checked={form.templateEnabled} onChange={handleChange} />
              <span>Enable Handlebars templates</span>
            </label>
          </div>
        </fieldset>

        <details>
          <summary>Advanced settings</summary>
          <div className="form-grid form-grid--two" style={{ marginTop: '1rem' }}>
            <label className="stack">
              <span>Require headers</span>
              <textarea name="matchHeaders" value={form.matchHeaders} onChange={handleChange} rows="4" />
            </label>
            <label className="stack">
              <span>Response headers</span>
              <textarea name="responseHeaders" value={form.responseHeaders} onChange={handleChange} rows="4" />
            </label>
          </div>
        </details>

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save endpoint'}
        </button>
      </form>

      {route ? (
        <section>
          <header className="section-heading">
            <div>
              <h3>Danger zone</h3>
              <p className="muted" style={{ margin: 0 }}>Delete this route and its stored variables.</p>
            </div>
          </header>
          <button className="button contrast" type="button" onClick={handleDelete} disabled={isSubmitting}>
            Delete route
          </button>
        </section>
      ) : null}
    </section>
  );
}
