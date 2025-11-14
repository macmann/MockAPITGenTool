import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const MCP_SERVER_ENTRY = path.join(projectRoot, 'mcp-server.js');

const processRegistry = new Map();

function buildStatus(record) {
  if (!record) {
    return { state: 'idle' };
  }

  const { state, child, startedAt, stoppedAt, exitCode, signal, error } = record;
  return {
    state,
    pid: child && typeof child.pid === 'number' ? child.pid : null,
    startedAt: startedAt || null,
    stoppedAt: stoppedAt || null,
    exitCode: typeof exitCode === 'number' ? exitCode : exitCode ?? null,
    signal: signal || null,
    error: error || null
  };
}

export function getMcpServerRuntimeStatus(serverId) {
  return buildStatus(processRegistry.get(serverId));
}

export function getAllMcpServerRuntimeStatuses() {
  const statuses = {};
  for (const [id, record] of processRegistry.entries()) {
    statuses[id] = buildStatus(record);
  }
  return statuses;
}

export function startMcpServerRuntime(serverConfig) {
  if (!serverConfig || !serverConfig.id) {
    throw new Error('Invalid MCP server configuration');
  }

  const existing = processRegistry.get(serverConfig.id);
  if (existing) {
    if (existing.state === 'running') {
      return { started: false, alreadyRunning: true, status: buildStatus(existing) };
    }
    if (existing.state === 'stopping') {
      throw new Error('MCP server is currently stopping. Try again shortly.');
    }
  }

  const env = {
    ...process.env,
    MCP_SERVER_ID: serverConfig.id
  };

  if (serverConfig.base_url) {
    env.MOCK_BASE_URL = serverConfig.base_url;
  }

  const child = spawn(process.execPath, [MCP_SERVER_ENTRY], {
    env,
    stdio: 'inherit'
  });

  const record = {
    child,
    state: 'running',
    serverId: serverConfig.id,
    startedAt: Date.now(),
    stoppedAt: null,
    exitCode: null,
    signal: null,
    error: null
  };

  processRegistry.set(serverConfig.id, record);

  child.on('exit', (code, signal) => {
    record.state = 'stopped';
    record.child = null;
    record.exitCode = typeof code === 'number' ? code : null;
    record.signal = signal || null;
    record.stoppedAt = Date.now();
  });

  child.on('error', (err) => {
    record.state = 'error';
    record.error = err?.message || String(err);
    record.stoppedAt = Date.now();
  });

  return { started: true, status: buildStatus(record) };
}

export function stopMcpServerRuntime(serverId) {
  const record = processRegistry.get(serverId);
  if (!record) {
    return { stopped: false, code: 'not-found', status: { state: 'idle' } };
  }

  if (record.state === 'stopping') {
    return { stopped: true, code: 'stopping', status: buildStatus(record) };
  }

  if (record.state !== 'running' || !record.child) {
    return { stopped: false, code: 'not-running', status: buildStatus(record) };
  }

  record.state = 'stopping';
  const killed = record.child.kill('SIGTERM');
  if (!killed) {
    record.state = 'running';
    return { stopped: false, code: 'signal-failed', status: buildStatus(record) };
  }

  return { stopped: true, code: 'stopping', status: buildStatus(record) };
}
