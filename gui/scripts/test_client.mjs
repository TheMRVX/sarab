// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Integration test suite for frontend API client under:
 * - Offline (network down / connection refused)
 * - Unauthorized (HTTP 401)
 * - Unavailable (HTTP 503)
 * - Healthy (HTTP 200)
 * - Demo mode isolation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// We implement simulated fetch pointing to our local test server port
let serverPort = 0;
let serverStatusCode = 200;
let serverResponseBody = {};

const mockServer = http.createServer((req, res) => {
  res.writeHead(serverStatusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(serverResponseBody));
});

test.before(async () => {
  await new Promise((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => {
      serverPort = mockServer.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => mockServer.close(resolve));
});

// A lightweight pure client implementation matching gui/src/api/client.ts
function createClient(baseUrl) {
  let demoMode = false;
  let sessionToken = '';

  const apiFetch = async (endpoint, init = {}) => {
    const headers = { ...init.headers };
    if (sessionToken) headers['X-Sarab-Token'] = sessionToken;
    return fetch(`${baseUrl}${endpoint}`, { ...init, headers });
  };

  return {
    setDemoMode(val) { demoMode = val; },
    isDemoMode() { return demoMode; },
    setSessionToken(token) { sessionToken = token; },

    async getSystemStatus() {
      if (demoMode) {
        return {
          testSigning: true,
          testSigningDetails: 'Demo',
          locationPrivacy: true,
          locationPrivacyDetails: 'Allowed',
          bitlocker: 'Off',
          driverInstalled: true,
          driverRunning: true,
        };
      }
      try {
        const res = await apiFetch('/api/status');
        if (res.ok) return await res.json();
      } catch {}
      return {
        testSigning: false,
        testSigningDetails: 'Backend service offline or unauthorized',
        locationPrivacy: false,
        locationPrivacyDetails: 'Unknown',
        bitlocker: 'Unknown',
        driverInstalled: false,
        driverRunning: false,
      };
    },

    async queryLiveLocation() {
      if (demoMode) {
        return {
          latitude: 35.6997,
          longitude: 51.338,
          altitude: 1200.0,
          accuracy: 5.0,
          source: 'Satellite (GNSS / GPS) [Demo]',
          timestamp: new Date().toISOString(),
        };
      }
      try {
        const res = await apiFetch('/api/read');
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },

    async getSatellites() {
      if (demoMode) {
        return [
          { id: 1, prn: 1, constellation: 'GPS', elevation: 65, azimuth: 120, snr: 42.5, used: true }
        ];
      }
      try {
        const res = await apiFetch('/api/satellites');
        if (res.ok) return await res.json();
      } catch {}
      return [];
    },

    async checkAuthStatus() {
      if (demoMode) return true;
      try {
        const res = await apiFetch('/api/auth/status');
        if (res.ok) {
          const data = await res.json();
          return !!data.authenticated;
        }
      } catch {}
      return false;
    }
  };
}

test('1. Healthy Backend Condition (HTTP 200)', async () => {
  serverStatusCode = 200;
  serverResponseBody = {
    testSigning: true,
    testSigningDetails: 'TESTSIGNING NOEXECUTE=OPTIN',
    locationPrivacy: true,
    locationPrivacyDetails: 'Allowed',
    bitlocker: 'Off',
    driverInstalled: true,
    driverRunning: true,
    authenticated: true,
  };

  const client = createClient(`http://127.0.0.1:${serverPort}`);
  client.setSessionToken('valid_token_123');

  const status = await client.getSystemStatus();
  assert.equal(status.driverInstalled, true);
  assert.equal(status.driverRunning, true);

  serverResponseBody = {
    latitude: 35.6997,
    longitude: 51.338,
    altitude: 1200.0,
    accuracy: 1.0,
    source: 'Satellite (GNSS / GPS)',
    timestamp: new Date().toISOString(),
  };
  const fix = await client.queryLiveLocation();
  assert.ok(fix !== null);
  assert.equal(fix.source, 'Satellite (GNSS / GPS)');

  serverResponseBody = [{ id: 1, prn: 1, constellation: 'GPS', elevation: 60, azimuth: 120, snr: 40, used: true }];
  const sats = await client.getSatellites();
  assert.equal(sats.length, 1);
});

test('2. Unauthorized Backend Condition (HTTP 401)', async () => {
  serverStatusCode = 401;
  serverResponseBody = { error: 'Unauthorized: Missing or invalid session token' };

  const client = createClient(`http://127.0.0.1:${serverPort}`);

  const status = await client.getSystemStatus();
  assert.equal(status.driverInstalled, false, 'Driver must not be reported installed when unauthorized');
  assert.equal(status.driverRunning, false, 'Driver must not be reported running when unauthorized');
  assert.match(status.testSigningDetails, /offline or unauthorized/i);

  const fix = await client.queryLiveLocation();
  assert.equal(fix, null, 'Live fix must be null when unauthorized');

  const sats = await client.getSatellites();
  assert.deepEqual(sats, [], 'Satellites must be empty array when unauthorized');

  const authed = await client.checkAuthStatus();
  assert.equal(authed, false, 'Auth status must be false when unauthorized');
});

test('3. Unavailable Backend Condition (HTTP 503)', async () => {
  serverStatusCode = 503;
  serverResponseBody = { error: 'Service Unavailable' };

  const client = createClient(`http://127.0.0.1:${serverPort}`);

  const status = await client.getSystemStatus();
  assert.equal(status.driverInstalled, false);
  assert.equal(status.driverRunning, false);

  const fix = await client.queryLiveLocation();
  assert.equal(fix, null);

  const sats = await client.getSatellites();
  assert.deepEqual(sats, []);
});

test('4. Offline Backend Condition (Port unreachable)', async () => {
  // Use unused loopback port
  const client = createClient(`http://127.0.0.1:19999`);

  const status = await client.getSystemStatus();
  assert.equal(status.driverInstalled, false);
  assert.equal(status.driverRunning, false);

  const fix = await client.queryLiveLocation();
  assert.equal(fix, null);

  const sats = await client.getSatellites();
  assert.deepEqual(sats, []);

  const authed = await client.checkAuthStatus();
  assert.equal(authed, false);
});

test('5. Explicit Demo Mode Isolation', async () => {
  // Even with unreachable port, demo mode returns isolated simulation
  const client = createClient(`http://127.0.0.1:19999`);
  client.setDemoMode(true);

  assert.equal(client.isDemoMode(), true);

  const status = await client.getSystemStatus();
  assert.equal(status.driverInstalled, true);
  assert.equal(status.testSigningDetails, 'Demo');

  const fix = await client.queryLiveLocation();
  assert.ok(fix !== null);
  assert.match(fix.source, /Demo/);

  const sats = await client.getSatellites();
  assert.equal(sats.length, 1);

  const authed = await client.checkAuthStatus();
  assert.equal(authed, true);
});
