'use client';

import { useEffect, useMemo, useState } from 'react';

import LegacyRouteForm from './LegacyRouteForm.jsx';
import LegacyRouteList from './LegacyRouteList.jsx';
import LegacyRouteVarsPanel from './LegacyRouteVarsPanel.jsx';
import LegacyMcpServerForm from './LegacyMcpServerForm.jsx';
import LegacyMcpServerList from './LegacyMcpServerList.jsx';

function downloadOpenApiSpec(route) {
  const method = route.method?.toLowerCase() || 'get';
  const spec = {
    openapi: '3.0.0',
    info: {
      title: route.name || route.path || 'Mock route',
      version: '1.0.0',
      description: route.description || 'Mock endpoint generated from the legacy dashboard'
    },
    paths: {
      [route.path || '/']: {
        [method]: {
          summary: route.description || 'Mock response',
          responses: {
            [route.responseStatus || 200]: {
              description: route.description || 'Mock response',
              content: route.responseIsJson
                ? {
                    'application/json': {
                      example: (() => {
                        try {
                          return JSON.parse(route.responseBody || '{}');
                        } catch (err) {
                          return {};
                        }
                      })()
                    }
                  }
                : {
                    'text/plain': {
                      example: route.responseBody || ''
                    }
                  }
            }
          }
        }
      }
    }
  };

  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(route.name || 'mock-route').toLowerCase().replace(/[^a-z0-9-]+/g, '-')}-openapi.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function LegacyDashboardApp({ projectId, routes: initialRoutes = [], mcpServers: initialServers = [] }) {
  const [routes, setRoutes] = useState(initialRoutes);
  const [servers, setServers] = useState(initialServers);
  const [editingRoute, setEditingRoute] = useState(null);
  const [editingServer, setEditingServer] = useState(null);
  const [varsRouteId, setVarsRouteId] = useState(null);
  const [logsRouteId, setLogsRouteId] = useState(null);
  const [infoServerId, setInfoServerId] = useState(null);
  const [routeMessage, setRouteMessage] = useState('');
  const [routeMessageType, setRouteMessageType] = useState('success');
  const [serverMessage, setServerMessage] = useState('');
  const [serverMessageType, setServerMessageType] = useState('success');

  useEffect(() => {
    setRoutes(initialRoutes);
    setEditingRoute(null);
    setVarsRouteId(null);
    setLogsRouteId(null);
    setRouteMessage('');
    setRouteMessageType('success');
  }, [initialRoutes, projectId]);

  useEffect(() => {
    setServers(initialServers);
    setEditingServer(null);
    setInfoServerId(null);
    setServerMessage('');
    setServerMessageType('success');
  }, [initialServers, projectId]);

  const activeVarsRoute = useMemo(() => routes.find((route) => route.id === varsRouteId) || null, [routes, varsRouteId]);
  const activeLogsRoute = useMemo(() => routes.find((route) => route.id === logsRouteId) || null, [routes, logsRouteId]);
  const activeInfoServer = useMemo(() => servers.find((server) => server.id === infoServerId) || null, [servers, infoServerId]);

  const refreshRoutes = async () => {
    const response = await fetch(`/api/mock-routes?projectId=${projectId}`, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      setRoutes(Array.isArray(data.routes) ? data.routes : []);
    }
  };

  const refreshServers = async () => {
    const response = await fetch(`/api/mcp-servers?projectId=${projectId}`, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      setServers(Array.isArray(data.servers) ? data.servers : []);
    }
  };

  const handleRouteSaved = (route) => {
    setRoutes((current) => {
      const exists = current.some((item) => item.id === route.id);
      if (exists) {
        return current.map((item) => (item.id === route.id ? route : item));
      }
      return [route, ...current];
    });
    setRouteMessage('Route saved');
    setRouteMessageType('success');
    setEditingRoute(null);
  };

  const handleServerSaved = (server) => {
    setServers((current) => {
      const exists = current.some((item) => item.id === server.id);
      if (exists) {
        return current.map((item) => (item.id === server.id ? server : item));
      }
      return [server, ...current];
    });
    setServerMessage('MCP server saved');
    setServerMessageType('success');
    setEditingServer(null);
  };

  const handleRouteDeleted = async (routeId) => {
    try {
      const response = await fetch(`/api/mock-routes?id=${routeId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Unable to delete route');
      }
      setRoutes((current) => current.filter((route) => route.id !== routeId));
      setRouteMessage('Route deleted');
      setRouteMessageType('success');
      if (editingRoute?.id === routeId) {
        setEditingRoute(null);
      }
      if (varsRouteId === routeId) {
        setVarsRouteId(null);
      }
    } catch (error) {
      setRouteMessage(error.message);
      setRouteMessageType('error');
    }
  };

  const handleServerDeleted = async (serverId) => {
    try {
      const response = await fetch(`/api/mcp-servers?id=${serverId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Unable to delete MCP server');
      }
      setServers((current) => current.filter((server) => server.id !== serverId));
      setServerMessage('MCP server deleted');
      setServerMessageType('success');
      if (editingServer?.id === serverId) {
        setEditingServer(null);
      }
      if (infoServerId === serverId) {
        setInfoServerId(null);
      }
    } catch (error) {
      setServerMessage(error.message);
      setServerMessageType('error');
    }
  };

  const handleServerToggle = async (serverId, isEnabled) => {
    try {
      const response = await fetch('/api/mcp-servers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: serverId, isEnabled })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to update server');
      }
      handleServerSaved(data.server);
    } catch (error) {
      setServerMessage(error.message);
      setServerMessageType('error');
    }
  };

  const handleVarsUpdated = (routeId, vars) => {
    setRoutes((current) => current.map((route) => (route.id === routeId ? { ...route, vars } : route)));
    if (varsRouteId === routeId) {
      setRouteMessage('Vars updated');
      setRouteMessageType('success');
    }
  };

  return (
    <div className="legacy-stack">
      <div className="legacy-grid">
        <LegacyRouteForm
          projectId={projectId}
          route={editingRoute}
          onSaved={handleRouteSaved}
          onRefresh={refreshRoutes}
          onReset={() => setEditingRoute(null)}
        />
        <LegacyMcpServerForm
          projectId={projectId}
          server={editingServer}
          onSaved={handleServerSaved}
          onRefresh={refreshServers}
          onReset={() => setEditingServer(null)}
        />
      </div>

      <div className="legacy-grid">
        <div className="legacy-stack">
          <LegacyRouteList
            routes={routes}
            statusMessage={routeMessage}
            statusType={routeMessageType}
            activeVarsRouteId={varsRouteId}
            activeLogsRouteId={logsRouteId}
            onEdit={setEditingRoute}
            onDelete={handleRouteDeleted}
            onShowVars={(routeId) => setVarsRouteId((current) => (current === routeId ? null : routeId))}
            onShowLogs={(routeId) => setLogsRouteId((current) => (current === routeId ? null : routeId))}
            onDownloadOpenApi={downloadOpenApiSpec}
          />
          {activeVarsRoute ? (
            <LegacyRouteVarsPanel
              route={activeVarsRoute}
              onVarsUpdated={handleVarsUpdated}
              onClose={() => setVarsRouteId(null)}
            />
          ) : null}
          {activeLogsRoute ? (
            <section className="surface-card surface-card--stacked">
              <header className="section-heading">
                <div>
                  <h3>Logs · {activeLogsRoute.name || activeLogsRoute.path}</h3>
                  <p className="muted" style={{ margin: 0 }}>Historical logs from the Express app are not stored, but you can view request previews here.</p>
                </div>
                <button className="button secondary" type="button" onClick={() => setLogsRouteId(null)}>
                  Close
                </button>
              </header>
              <p className="muted" style={{ margin: 0 }}>
                Logging will stream into Prisma tables soon. For now, track recent edits: last updated {new Date(activeLogsRoute.updatedAt).toLocaleString()}.
              </p>
            </section>
          ) : null}
        </div>

        <div className="legacy-stack">
          <LegacyMcpServerList
            servers={servers}
            statusMessage={serverMessage}
            statusType={serverMessageType}
            activeInfoServerId={infoServerId}
            onEdit={setEditingServer}
            onDelete={handleServerDeleted}
            onToggle={handleServerToggle}
            onShowInfo={(serverId) => setInfoServerId((current) => (current === serverId ? null : serverId))}
          />
          {activeInfoServer ? (
            <section className="surface-card surface-card--stacked">
              <header className="section-heading">
                <div>
                  <h3>MCP Server info · {activeInfoServer.name}</h3>
                  <p className="muted" style={{ margin: 0 }}>Use this data when wiring the MCP HTTP client or sharing credentials.</p>
                </div>
                <button className="button secondary" type="button" onClick={() => setInfoServerId(null)}>
                  Close
                </button>
              </header>
              <dl className="definition-list">
                <div>
                  <dt>Slug</dt>
                  <dd>
                    <code>{activeInfoServer.slug}</code>
                  </dd>
                </div>
                <div>
                  <dt>MCP path</dt>
                  <dd>
                    <code>{activeInfoServer.mcpPath}</code>
                  </dd>
                </div>
                <div>
                  <dt>Base URL</dt>
                  <dd>
                    <code>{activeInfoServer.baseUrl || 'Not set'}</code>
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
