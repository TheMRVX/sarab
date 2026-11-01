// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Real production frontend client test suite.
 * Executes gui/src/api/client.ts directly via Vite's ssrLoadModule
 * against controlled HTTP network conditions:
 * 1. Healthy backend (200 OK)
 * 2. Unauthorized backend (401 Unauthorized)
 * 3. Unavailable backend (503 Service Unavailable)
 * 4. Offline backend (Connection Refused)
 * 5. Strict Demo Mode Isolation
 * 6. Bootstrap token extraction and URL history scrubbing (replaceState)
 * 7. Session rehydration from same-origin /api/auth/session
 * 8. Mutating API operations enforce X-Sarab-Token header
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer as createViteServer } from 'vite';

let serverPort = 0;
let serverStatusCode = 200;
let serverResponseBody = {};
let lastReceivedHeaders = {};
let lastReceivedMethod = 'GET';
let lastReceivedUrl = '';

const mockServer = http.createServer((req, res) => {
  lastReceivedHeaders = req.headers;
  lastReceivedMethod = req.method;
  lastReceivedUrl = req.url || '';

  res.writeHead(serverStatusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(serverResponseBody));
});

let viteServer = null;
let client = null;

test.before(async () => {
  await new Promise((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => {
      serverPort = mockServer.address().port;
      resolve();
    });
  });

  // Setup browser environment globals for client.ts
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      input = `http://127.0.0.1:${serverPort}${input}`;
    }
    return nativeFetch(input, init);
  };

  const storageMap = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => storageMap.get(k) ?? null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  globalThis.window = {
    location: new URL(`http://127.0.0.1:${serverPort}/`),
    history: {
      replaceState: (_state, _title, url) => {
        globalThis.window.location = new URL(url, `http://127.0.0.1:${serverPort}/`);
      },
    },
    sessionStorage: globalThis.sessionStorage,
  };

  // Load the real production client via Vite ssrLoadModule
  viteServer = await createViteServer({
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
    appType: 'custom',
  });

  client = await viteServer.ssrLoadModule('./src/api/client.ts');
});

test.after(async () => {
  if (viteServer) await viteServer.close();
  await new Promise((resolve) => mockServer.close(resolve));
});

test('1. Healthy Backend Condition (HTTP 200) executes real client', async () => {
  client.setDemoMode(false);
  client.setSessionToken('test_session_token_123');

  serverStatusCode = 200;
  serverResponseBody = {
    testSigning: true,
    testSigningDetails: 'TESTSIGNING ON',
    locationPrivacy: true,
    locationPrivacyDetails: 'Allowed',
    bitlocker: 'Suspended / OFF',
    driverInstalled: true,
    driverRunning: true,
  };

  const status = await client.api.getSystemStatus();
  assert.equal(status.driverInstalled, true, 'Healthy backend must report driver installed');
  assert.equal(
    lastReceivedHeaders['x-sarab-token'],
    'test_session_token_123',
    'Real client must attach X-Sarab-Token header'
  );
});

test('2. Unauthorized Backend Condition (HTTP 401) reports truthful degraded state', async () => {
  client.setDemoMode(false);
  serverStatusCode = 401;
  serverResponseBody = { error: 'Unauthorized: Missing or invalid session token' };

  const status = await client.api.getSystemStatus();
  assert.equal(
    status.driverInstalled,
    false,
    'Unauthorized client must report driverInstalled as false'
  );
  assert.equal(
    status.testSigningDetails,
    'Backend service offline or unauthorized',
    'Unauthorized client must truthfully state backend is offline or unauthorized'
  );

  const loc = await client.api.queryLiveLocation();
  assert.equal(loc, null, 'Unauthorized backend must not return any location fix');

  const sats = await client.api.getSatellites();
  assert.deepEqual(sats, [], 'Unauthorized backend must return empty satellites list');
});

test('3. Unavailable Backend Condition (HTTP 503) handles graceful degradation', async () => {
  client.setDemoMode(false);
  serverStatusCode = 503;
  serverResponseBody = { error: 'Service Unavailable' };

  const status = await client.api.getSystemStatus();
  assert.equal(status.driverInstalled, false);
  assert.equal(status.testSigningDetails, 'Backend service offline or unauthorized');

  const loc = await client.api.queryLiveLocation();
  assert.equal(loc, null);
});

test('4. Offline Backend Condition (Port unreachable) handles network refusal safely', async () => {
  client.setDemoMode(false);

  // Direct fetch to a closed high port
  const offlinePort = 29999;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    return originalFetch(
      typeof input === 'string' && input.startsWith('/')
        ? `http://127.0.0.1:${offlinePort}${input}`
        : input,
      init
    );
  };

  try {
    const status = await client.api.getSystemStatus();
    assert.equal(status.driverInstalled, false);
    assert.equal(status.testSigningDetails, 'Backend service offline or unauthorized');

    const loc = await client.api.queryLiveLocation();
    assert.equal(loc, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('5. Explicit Demo Mode Isolation strictly separates simulated vs live telemetry', async () => {
  // Demo Mode Enabled
  client.setDemoMode(true);
  assert.equal(client.isDemoMode(), true);

  const demoStatus = await client.api.getSystemStatus();
  assert.equal(demoStatus.driverInstalled, true);
  assert.equal(demoStatus.testSigningDetails.includes('Demo'), true);

  const demoSats = await client.api.getSatellites();
  assert.equal(demoSats.length > 0, true, 'Demo mode should return simulated satellites');

  // Demo Mode Disabled
  client.setDemoMode(false);
  assert.equal(client.isDemoMode(), false);

  serverStatusCode = 401;
  const liveStatus = await client.api.getSystemStatus();
  assert.equal(liveStatus.testSigningDetails, 'Backend service offline or unauthorized');
});

test('6. Authenticated browser initialization extracts token and scrubs URL via replaceState', () => {
  // Simulate launching browser with ?token=secret_bootstrap_token_789
  globalThis.window.location = new URL(
    `http://127.0.0.1:${serverPort}/?token=secret_bootstrap_token_789`
  );

  const extracted = client.initAuthFromLocation();
  assert.equal(
    extracted,
    'secret_bootstrap_token_789',
    'initAuthFromLocation must extract query token'
  );
  assert.equal(
    client.getSessionToken(),
    'secret_bootstrap_token_789',
    'getSessionToken must return in-memory token'
  );

  // Assert URL in address bar has been scrubbed
  assert.equal(
    globalThis.window.location.search,
    '',
    'Token query parameter must be removed from window.location via replaceState'
  );
});

test('7. Same-origin session rehydration restores token from /api/auth/session without sessionStorage', async () => {
  client.setSessionToken('');
  assert.equal(client.getSessionToken(), '');

  serverStatusCode = 200;
  serverResponseBody = {
    authenticated: true,
    token: 'rehydrated_session_token_abc',
  };

  const isAuthed = await client.checkAuthStatus();
  assert.equal(isAuthed, true, 'checkAuthStatus must succeed via /api/auth/session');
  assert.equal(
    client.getSessionToken(),
    'rehydrated_session_token_abc',
    'Session token must be rehydrated into inMemoryToken'
  );
});

test('8. Mutating API calls attach X-Sarab-Token header', async () => {
  client.setSessionToken('mutation_test_token_999');
  serverStatusCode = 200;
  serverResponseBody = { success: true };

  await client.api.applySpoofConfig({
    latitude: 35.7,
    longitude: 51.4,
    altitude: 1200.0,
    accuracy: 3.0,
    enabled: true,
    driftEnabled: false,
    driftRadius: 1.0,
  });

  assert.equal(lastReceivedMethod, 'POST');
  assert.equal(lastReceivedUrl, '/api/config');
  assert.equal(
    lastReceivedHeaders['x-sarab-token'],
    'mutation_test_token_999',
    'Mutating API call must attach X-Sarab-Token header'
  );
});
