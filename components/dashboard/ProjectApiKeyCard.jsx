'use client';

import { useCallback, useState } from 'react';

export default function ProjectApiKeyCard({ apiKey }) {
  if (!apiKey) {
    return null;
  }

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator?.clipboard?.writeText) {
      console.warn('Clipboard API unavailable');
      return;
    }
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy API key', err);
      setCopied(false);
    }
  }, [apiKey]);

  return (
    <div className="api-key-card">
      <div className="api-key-card__header">
        <p className="label">API key</p>
        <button type="button" className="btn ghost" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code className="api-key-card__value">{apiKey}</code>
      <p className="helper-text">Send this value as the <code>x-api-key</code> header for mock routes and MCP calls.</p>
    </div>
  );
}
