'use client';

import { useState } from 'react';

export default function LegacyRouteVarsPanel({ route, onVarsUpdated, onClose }) {
  const [varKey, setVarKey] = useState('');
  const [varValue, setVarValue] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!route) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setMessageType('success');

    try {
      const response = await fetch(`/api/mock-routes/${route.id}/vars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: varKey, value: varValue })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save var');
      }
      onVarsUpdated?.(route.id, data.vars || []);
      setVarKey('');
      setVarValue('');
      setMessageType('success');
      setMessage('Saved');
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (varId, key) => {
    if (!window.confirm('Delete this var?')) return;
    try {
      const url = new URL(`${window.location.origin}/api/mock-routes/${route.id}/vars`);
      if (varId) {
        url.searchParams.set('varId', varId);
      } else if (key) {
        url.searchParams.set('key', key);
      }
      const response = await fetch(url.toString(), { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to delete var');
      }
      onVarsUpdated?.(route.id, data.vars || []);
      setMessageType('success');
      setMessage('Var deleted');
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
    }
  };

  return (
    <section className="surface-card surface-card--stacked">
      <header className="section-heading">
        <div>
          <h3>Vars · {route.name || route.path}</h3>
          <p className="muted" style={{ margin: 0 }}>Vars behave exactly like the original admin: key/value pairs for Handlebars templates.</p>
        </div>
        <button className="button secondary" type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {message ? <div className={`flash ${messageType === 'error' ? 'flash-error' : 'flash-success'}`}>{message}</div> : null}

      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-grid form-grid--two">
          <label className="stack">
            <span>Key</span>
            <input value={varKey} onChange={(event) => setVarKey(event.target.value)} placeholder="customer_name" />
          </label>
          <label className="stack">
            <span>Value</span>
            <input value={varValue} onChange={(event) => setVarValue(event.target.value)} placeholder="MindBridge" />
          </label>
        </div>
        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save var'}
        </button>
      </form>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {route.vars?.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={3}>
                  No vars yet.
                </td>
              </tr>
            ) : null}
            {route.vars?.map((variable) => (
              <tr key={variable.id}>
                <td>
                  <code>{variable.key}</code>
                </td>
                <td>{variable.value}</td>
                <td>
                  <div className="table-actions">
                    <button className="button contrast" type="button" onClick={() => handleDelete(variable.id, variable.key)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
