import { syncInboundEmailForAllCompanies } from '../services/inboundEmail.service.js';

let intervalHandle = null;
let isRunning = false;

const state = {
  enabled: false,
  intervalSeconds: 0,
  startedAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  lastResult: null
};

function readBoolEnv(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function readIntEnv(value, defaultValue) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

async function runOnce() {
  if (isRunning) return;
  isRunning = true;
  state.lastRunAt = new Date();
  try {
    const res = await syncInboundEmailForAllCompanies();
    state.lastSuccessAt = new Date();
    state.lastErrorAt = null;
    state.lastErrorMessage = null;
    state.lastResult = res;
    console.log(`[InboundEmailAutoSync] Synced total=${res?.total ?? 0}`);
  } catch (err) {
    state.lastErrorAt = new Date();
    state.lastErrorMessage = err?.message || String(err);
    console.error('[InboundEmailAutoSync] Failed:', state.lastErrorMessage);
  } finally {
    isRunning = false;
  }
}

export function startInboundEmailAutoSync() {
  const enabled = readBoolEnv(process.env.INBOUND_EMAIL_AUTO_SYNC_ENABLED, false);
  const intervalSeconds = readIntEnv(process.env.INBOUND_EMAIL_AUTO_SYNC_INTERVAL_SECONDS, 60);
  const runOnStart = readBoolEnv(process.env.INBOUND_EMAIL_AUTO_SYNC_RUN_ON_START, true);

  state.enabled = enabled;
  state.intervalSeconds = intervalSeconds;

  if (!enabled) {
    console.log('[InboundEmailAutoSync] Disabled (set INBOUND_EMAIL_AUTO_SYNC_ENABLED=true to enable)');
    return { stop: () => {}, state };
  }

  state.startedAt = new Date();
  console.log(`[InboundEmailAutoSync] Enabled interval=${intervalSeconds}s runOnStart=${runOnStart}`);

  if (runOnStart) {
    runOnce();
  }

  intervalHandle = setInterval(runOnce, intervalSeconds * 1000);
  if (typeof intervalHandle?.unref === 'function') {
    intervalHandle.unref();
  }

  const stop = () => {
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = null;
  };

  return { stop, state };
}

export function getInboundEmailAutoSyncState() {
  return { ...state, isRunning };
}

