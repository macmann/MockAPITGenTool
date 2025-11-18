'use client';

export default function LegacyMcpServerList({
  servers = [],
  statusMessage = '',
  statusType = 'success',
  activeInfoServerId,
  onEdit,
  onDelete,
  onToggle,
  onShowInfo
}) {
  const confirmDelete = (serverId) => {
    if (!window.confirm('Delete this MCP server?')) return;
    onDelete?.(serverId);
  };

  return (
    <section className="surface-card surface-card--stacked">
      <header className="section-heading">
        <div>
          <h3>List MCP servers</h3>
          <p className="muted" style={{ margin: 0 }}>Matches the Express-era table for MCP HTTP servers.</p>
        </div>
        <span className="status-pill">{servers.length} total</span>
      </header>

      {statusMessage ? <div className={`flash ${statusType === 'error' ? 'flash-error' : 'flash-success'}`}>{statusMessage}</div> : null}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>MCP URL</th>
              <th>Base URL</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={5}>
                  No MCP servers yet. Use the Create panel to add one.
                </td>
              </tr>
            ) : null}
            {servers.map((server) => (
              <tr key={server.id}>
                <td>
                  <strong>{server.name}</strong>
                  {server.description ? (
                    <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                      {server.description}
                    </p>
                  ) : null}
                </td>
                <td>
                  <code>{server.mcpPath}</code>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>Slug: {server.slug}</p>
                </td>
                <td>
                  <code>{server.baseUrl || '—'}</code>
                </td>
                <td>
                  {server.isEnabled ? (
                    <span className="status-badge status-badge--success">Enabled</span>
                  ) : (
                    <span className="status-badge status-badge--muted">Disabled</span>
                  )}
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className={`button secondary ${activeInfoServerId === server.id ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => onShowInfo?.(server.id)}
                    >
                      Info
                    </button>
                    <button className="button secondary" type="button" onClick={() => onEdit?.(server)}>
                      Edit
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      title="Tool configuration lives in the OpenAPI/Tool Mapping utilities."
                      onClick={() => window.alert('Tool configuration lives in the Tool Mappings utilities—coming soon to this port.')}
                    >
                      Tools
                    </button>
                    {server.isEnabled ? (
                      <button className="button contrast" type="button" onClick={() => onToggle?.(server.id, false)}>
                        Disable
                      </button>
                    ) : (
                      <button className="button" type="button" onClick={() => onToggle?.(server.id, true)}>
                        Enable
                      </button>
                    )}
                    <button className="button contrast" type="button" onClick={() => confirmDelete(server.id)}>
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
