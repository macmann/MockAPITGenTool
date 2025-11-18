import Image from 'next/image';

import LegacyDashboardApp from './LegacyDashboardApp.jsx';
import LegacyProjectSwitcher from './LegacyProjectSwitcher.jsx';

export default function LegacyDashboardShell({ session, projects = [], activeProjectId, routes = [], mcpServers = [] }) {
  const activeProject = projects.find((project) => project.id === activeProjectId) || projects[0];
  const routeCount = routes.length;
  const serverCount = mcpServers.length;

  return (
    <div className="legacy-dashboard">
      <div className="top-bar">
        <div className="legacy-container top-bar__content">
          <div className="top-bar__brand">
            <Image src="/gui-mock-api/logo.svg" alt="MindBridge X" width={48} height={48} />
            <div>
              <div>MindBridge X</div>
              <p className="legacy-subtle" style={{ margin: 0 }}>Legacy admin dashboard</p>
            </div>
          </div>
          <div className="top-bar__banner">Signed in as {session.user?.email}</div>
        </div>
      </div>

      <main className="legacy-container legacy-main">
        <section className="page-hero">
          <div className="page-hero__content">
            <p className="legacy-muted" style={{ marginBottom: '0.25rem' }}>
              Project #{activeProject?.id || '—'}
            </p>
            <h2>{activeProject?.name || 'No project found'}</h2>
            <p>
              The panels below mirror the original Express admin UI—Create/List panels for routes and MCP servers. Every action is
              automatically scoped to your signed-in account and currently selected project.
            </p>
          </div>
          <div className="page-hero__actions">
            <span className="status-pill">{routeCount} routes</span>
            <span className="status-pill">{serverCount} MCP servers</span>
            <span className="status-pill">User #{session.user?.id}</span>
          </div>
        </section>

        <section className="surface-card surface-card--stacked">
          <header className="section-heading">
            <div>
              <h3>Projects</h3>
              <p className="muted" style={{ margin: 0 }}>
                Choose which project the legacy dashboard should manage. All Prisma queries are filtered by user + project IDs.
              </p>
            </div>
            <span className="status-pill">{projects.length} workspaces</span>
          </header>
          <LegacyProjectSwitcher projects={projects} activeProjectId={activeProjectId} />
        </section>

        <LegacyDashboardApp
          projectId={activeProject?.id || activeProjectId}
          routes={routes}
          mcpServers={mcpServers}
        />
      </main>
    </div>
  );
}
