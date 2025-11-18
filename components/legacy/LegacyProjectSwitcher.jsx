'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function LegacyProjectSwitcher({ projects = [], activeProjectId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = projects.find((project) => project.id === activeProjectId)?.id || projects[0]?.id || '';

  const handleChange = (event) => {
    const nextProjectId = event.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (nextProjectId) {
      params.set('projectId', nextProjectId);
    } else {
      params.delete('projectId');
    }
    const query = params.toString();
    const nextUrl = query ? `/dashboard?${query}` : '/dashboard';
    router.push(nextUrl);
    router.refresh();
  };

  return (
    <div className="legacy-project-switcher">
      <label className="stack" htmlFor="legacy-project-select">
        <span>Workspace</span>
        <select id="legacy-project-select" value={String(activeId)} onChange={handleChange}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted" style={{ margin: '0.5rem 0 0' }}>
        Switching projects reloads Create/List panels so every route and MCP server remains scoped to your login + project.
      </p>
    </div>
  );
}
