'use client';

export default function LegacyRouteList({
  routes = [],
  statusMessage = '',
  statusType = 'success',
  activeVarsRouteId,
  activeLogsRouteId,
  onEdit,
  onDelete,
  onShowVars,
  onShowLogs,
  onDownloadOpenApi
}) {
  const confirmDelete = (routeId) => {
    if (!routeId) return;
    if (!window.confirm('Delete this route?')) return;
    onDelete?.(routeId);
  };

  return (
    <section className="surface-card surface-card--stacked">
      <header className="section-heading">
        <div>
          <h3>List routes</h3>
          <p className="muted" style={{ margin: 0 }}>Every saved endpoint from the original admin shows up here.</p>
        </div>
        <span className="status-pill">{routes.length} total</span>
      </header>

      {statusMessage ? <div className={`flash ${statusType === 'error' ? 'flash-error' : 'flash-success'}`}>{statusMessage}</div> : null}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Method</th>
              <th>Path</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={5}>
                  <strong>No routes yet.</strong>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>Use the Create panel above to add your first route.</p>
                </td>
              </tr>
            ) : null}
            {routes.map((route) => (
              <tr key={route.id}>
                <td>
                  <strong>{route.name || route.id}</strong>
                  {route.description ? (
                    <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                      {route.description}
                    </p>
                  ) : null}
                </td>
                <td>
                  <code>{route.method}</code>
                </td>
                <td>
                  <code>{route.path}</code>
                </td>
                <td>
                  {route.enabled ? (
                    <span className="status-badge status-badge--success">Enabled</span>
                  ) : (
                    <span className="status-badge status-badge--muted">Disabled</span>
                  )}
                </td>
                <td>
                  <div className="table-actions">
                    <button className="button secondary" type="button" onClick={() => onEdit?.(route)}>
                      Edit
                    </button>
                    <button
                      className={`button secondary ${activeVarsRouteId === route.id ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => onShowVars?.(route.id)}
                    >
                      Vars
                    </button>
                    <button className="button secondary" type="button" onClick={() => onDownloadOpenApi?.(route)}>
                      OpenAPI
                    </button>
                    <button
                      className={`button secondary ${activeLogsRouteId === route.id ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => onShowLogs?.(route.id)}
                    >
                      Logs
                    </button>
                    <button className="button contrast" type="button" onClick={() => confirmDelete(route.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
