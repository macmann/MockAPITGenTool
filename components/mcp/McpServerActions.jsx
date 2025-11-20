'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function McpServerActions({ serverId, projectId }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const projectSuffix = projectId ? `?projectId=${projectId}` : '';

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
      <Link className="table-action" href={`/mcp-servers/${serverId}/tools${projectSuffix}`}>
        Manage tools
      </Link>
      <Link className="table-action" href={`/mcp-servers/${serverId}${projectSuffix}`}>
        View
      </Link>
      <Link className="table-action" href={`/mcp-servers/${serverId}/edit${projectSuffix}`}>
        Edit
      </Link>
      <button className="table-action" type="button" onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  );
}
