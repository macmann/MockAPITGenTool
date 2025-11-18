'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function ProjectSelector({ projects = [], activeProjectId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(projects.length === 0);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState(null);
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
      setShowCreateForm(false);
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

  const handleDelete = async (projectId) => {
    if (!projectId) return;
    if (!window.confirm('Delete this project and all related data?')) return;

    setMessage('');
    setDeletingProjectId(projectId);

    try {
      const response = await fetch(`/api/projects?id=${projectId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data?.error || 'Unable to delete project');
        return;
      }

      setMessage('Project deleted');
      startTransition(() => {
        if (projectId === activeId) {
          navigateToProject(String(data.project?.id || ''));
        } else {
          router.refresh();
        }
      });
    } catch (error) {
      console.error('Failed to delete project', error);
      setMessage('Unable to delete project');
    } finally {
      setDeletingProjectId(null);
    }
  };

  const beginRename = (project) => {
    setMessage('');
    setRenameProjectId(project.id);
    setRenameValue(project.name);
  };

  const cancelRename = () => {
    setRenameProjectId(null);
    setRenameValue('');
  };

  const handleRename = async (event) => {
    event.preventDefault();
    if (!renameProjectId) return;

    if (!renameValue.trim()) {
      setMessage('Project name is required');
      return;
    }

    setIsRenaming(true);
    setMessage('');

    try {
      const response = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: renameProjectId, name: renameValue })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || 'Unable to rename project');
        return;
      }

      setMessage('Project renamed');
      cancelRename();
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error('Failed to rename project', error);
      setMessage('Unable to rename project');
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <div className="project-section">
      <div className="project-section__header">
        <div>
          <p className="label small muted">Active project</p>
          <p className="project-section__active-name">
            {projects.find((project) => project.id === activeId)?.name || 'No projects yet'}
          </p>
          <p className="small muted">Switching projects reloads specs, connections, and mappings just for that project.</p>
        </div>
        <div className="project-actions">
          <button className="btn" type="button" onClick={() => setShowCreateForm((value) => !value)}>
            {showCreateForm ? 'Close form' : 'Create new project'}
          </button>
        </div>
      </div>

      {showCreateForm ? (
        <form className="project-form" onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              type="text"
              placeholder="Project name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="project-description" className="small muted">
              Description (optional)
            </label>
            <input
              id="project-description"
              type="text"
              placeholder="Description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Save project'}
          </button>
        </form>
      ) : null}

      <ul className="project-list">
        {projects.length === 0 ? (
          <li className="muted small">No projects yet. Use “Create new project” to get started.</li>
        ) : (
          projects.map((project) => {
            const isActive = String(project.id) === normalizedActiveId;
            const isDeleting = deletingProjectId === project.id;
            const isEditing = renameProjectId === project.id;

            return (
              <li key={project.id} className={`project-list-item${isActive ? ' project-list-item--active' : ''}`}>
                <div className="project-list-item__header">
                  <button
                    type="button"
                    className="project-select"
                    onClick={() =>
                      startTransition(() => {
                        navigateToProject(String(project.id));
                      })
                    }
                    disabled={isPending || isSubmitting}
                  >
                    <span className="project-select__name">{project.name}</span>
                    {project.description ? <span className="project-select__description">{project.description}</span> : null}
                  </button>
                  {!isEditing ? (
                    <div className="project-actions">
                      <button className="btn ghost" type="button" onClick={() => beginRename(project)}>
                        Rename
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => handleDelete(project.id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  ) : null}
                </div>

                {isEditing ? (
                  <form className="project-rename" onSubmit={handleRename}>
                    <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} required />
                    <div className="project-actions">
                      <button className="btn" type="submit" disabled={isRenaming}>
                        {isRenaming ? 'Saving…' : 'Save name'}
                      </button>
                      <button className="btn ghost" type="button" onClick={cancelRename}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })
        )}
      </ul>

      {message ? <p className="muted small">{message}</p> : null}
    </div>
  );
}
