import Image from 'next/image';
import Link from 'next/link';
import AppNavigation from './AppNavigation.jsx';
import ProjectSelector from './ProjectSelector.jsx';
import LogoutButton from './LogoutButton.jsx';
import './app-shell.css';

export default function AppShell({ session, projects = [], activeProjectId, children }) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <Image src="/gui-mock-api/logo.svg" alt="MindBridge X" width={40} height={40} />
          <div>
            <p className="workspace-brand__title">MindBridge X</p>
            <p className="workspace-brand__subtitle">MCP project cockpit</p>
          </div>
        </div>
        <AppNavigation />
        <div className="workspace-user">
          <p className="label">Signed in</p>
          <p className="workspace-user__value">{session?.user?.email}</p>
          <div className="workspace-user__actions">
            <Link className="btn ghost" href="/account">
              Change password
            </Link>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <section className="project-card">
          <ProjectSelector projects={projects} activeProjectId={activeProjectId} />
        </section>
        <section className="workspace-content">{children}</section>
      </div>
    </div>
  );
}
