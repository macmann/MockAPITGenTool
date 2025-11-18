import Image from 'next/image';
import ProjectSelector from '../dashboard/ProjectSelector.jsx';
import LegacyApiConnectionsPanel from './LegacyApiConnectionsPanel.jsx';
import LegacyOpenApiSpecsPanel from './LegacyOpenApiSpecsPanel.jsx';
import LegacyToolMappingsPanel from './LegacyToolMappingsPanel.jsx';

export default function LegacyDashboardShell({
  session,
  projects = [],
  activeProjectId,
  apiConnections = [],
  specs = [],
  toolMappings = []
}) {
  const activeProject = projects.find((project) => project.id === activeProjectId) || projects[0];

  return (
    <div className="legacy-dashboard">
      <div className="top-bar">
        <div className="legacy-container top-bar__content">
          <div className="top-bar__brand">
            <Image src="/gui-mock-api/logo.svg" alt="MindBridge X" width={48} height={48} />
            <div>
              <div>MindBridge X</div>
              <p className="legacy-subtle" style={{ margin: 0 }}>Legacy MCP tooling suite</p>
            </div>
          </div>
          <div className="top-bar__banner">
            Signed in as {session.user?.email} · User #{session.user?.id}
          </div>
        </div>
      </div>

      <main className="legacy-container legacy-main">
        <section className="page-hero">
          <div className="page-hero__content">
            <p className="legacy-muted" style={{ marginBottom: '0.25rem' }}>
              Project #{activeProject?.id || '—'}
            </p>
            <h2>{activeProject?.name || 'No project yet'}</h2>
            <p>
              You are editing a workspace that is scoped to your authenticated user and selected project. Every MCP connection,
              OpenAPI spec, and mock endpoint honors these IDs automatically.
            </p>
          </div>
          <div className="page-hero__actions">
            <span className="status-pill">{projects.length} projects</span>
            <span className="status-pill">{apiConnections.length} MCP servers</span>
            <span className="status-pill">{toolMappings.length} tool mappings</span>
          </div>
        </section>

        <section className="surface-card surface-card--stacked">
          <header className="section-heading">
            <div>
              <h3>Projects</h3>
              <p>Switching projects reloads every downstream dataset and filters Prisma queries by user + project.</p>
            </div>
          </header>
          <ProjectSelector projects={projects} activeProjectId={activeProjectId} />
        </section>

        <div className="legacy-grid">
          <LegacyOpenApiSpecsPanel projectId={activeProjectId} specs={specs} />
          <LegacyApiConnectionsPanel projectId={activeProjectId} connections={apiConnections} />
        </div>

        <LegacyToolMappingsPanel
          projectId={activeProjectId}
          specs={specs}
          connections={apiConnections}
          toolMappings={toolMappings}
        />
      </main>
    </div>
  );
}
