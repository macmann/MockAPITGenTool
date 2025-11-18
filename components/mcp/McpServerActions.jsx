'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function McpServerActions({ serverId }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!serverId) return;
    if (!window.confirm('Delete this MCP server?')) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/mcp-servers?id=${serverId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || 'Unable to delete server');
        return;
      }
      router.refresh();
    } catch (error) {
      console.error('Failed to delete server', error);
      alert('Unable to delete server');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="table-actions">
      <button className="table-action" type="button" aria-disabled="true" title="Detailed view coming soon">
        View
      </button>
      <button className="table-action" type="button" aria-disabled="true" title="Editing coming soon">
        Edit
      </button>
      <button className="table-action" type="button" onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  );
}
