'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function ProjectSelector({ projects = [], activeProjectId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeId = Number(activeProjectId) || projects[0]?.id || '';
  const normalizedActiveId = activeId ? String(activeId) : '';

  const navigateToProject = (projectId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) {
      params.set('projectId', projectId);
    } else {
      params.delete('projectId');
    }

    const query = params.toString();
    const nextUrl = query ? `/dashboard?${query}` : '/dashboard';

    router.push(nextUrl);
    router.refresh();
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setMessage('');
    if (!createName.trim()) {
      setMessage('Project name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName, description: createDescription })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || 'Unable to create project');
        return;
      }

      setCreateName('');
      setCreateDescription('');
      setMessage('Project created');
      startTransition(() => {
        navigateToProject(String(data.project?.id || ''));
      });
    } catch (error) {
      console.error('Failed to create project', error);
      setMessage('Unable to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeId) return;
    if (!window.confirm('Delete this project and all related data?')) return;

    setMessage('');
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/projects?id=${activeId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data?.error || 'Unable to delete project');
        return;
      }

      setMessage('Project deleted');
      startTransition(() => {
        navigateToProject(String(data.project?.id || ''));
      });
    } catch (error) {
      console.error('Failed to delete project', error);
      setMessage('Unable to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="panel muted">
      <div className="grid">
        <div>
          <div className="label">Active project</div>
          <div className="actions">
            <select
              value={normalizedActiveId}
              onChange={(event) =>
                startTransition(() => {
                  navigateToProject(event.target.value);
                })
              }
              disabled={isPending || isSubmitting}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button className="btn" type="button" onClick={handleDelete} disabled={isDeleting || projects.length === 0}>
              {isDeleting ? 'Deleting…' : 'Delete project'}
            </button>
          </div>
        </div>
        <form className="stack" onSubmit={handleCreate}>
          <div className="label">Create a new project</div>
          <input
            type="text"
            placeholder="Project name"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={createDescription}
            onChange={(event) => setCreateDescription(event.target.value)}
          />
          <div className="actions">
            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Add project'}
            </button>
            {message ? <span className="muted small">{message}</span> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
