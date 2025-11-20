'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RouteActions({ routeId, projectId }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const projectSuffix = projectId ? `?projectId=${projectId}` : '';

  const handleDelete = async () => {
    if (!routeId) return;
    if (!window.confirm('Delete this route?')) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/mock-routes?id=${routeId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || 'Unable to delete route');
        return;
      }
      router.refresh();
    } catch (error) {
      console.error('Failed to delete route', error);
      alert('Unable to delete route');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="table-actions">
      <Link className="table-action" href={`/routes/${routeId}${projectSuffix}`}>
        View
      </Link>
      <Link className="table-action" href={`/routes/${routeId}/edit${projectSuffix}`}>
        Edit
      </Link>
      <button className="table-action" type="button" onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  );
}
