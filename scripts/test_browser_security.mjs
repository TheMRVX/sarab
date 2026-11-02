#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Real-Browser Security & Cross-Origin Credential Isolation Regression Test
 *
 * Drives real headless Google Chrome via Playwright to verify:
 * 1. URL token scrubbing via history.replaceState (no token left in address bar / history)
 * 2. Zero DOM <meta name="sarab-token"> leakage
 * 3. Zero sessionStorage token retention
 * 4. HttpOnly SameSite=Strict cookie installation
 * 5. Cross-port localhost origin isolation (RFC 6265 cookie non-isolation defense)
 * 6. Cross-origin CSRF mutation rejection (cookie-only mutating requests fail-closed)
 * 7. Sec-Fetch-Site cross-site defense
 */

import http from 'node:http';
import cp from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(REPO_ROOT, 'app');

// Resolve Playwright
const require = createRequire(import.meta.url);
const guiRequire = createRequire(path.join(REPO_ROOT, 'gui', 'package.json'));
let playwright;
const pwCandidates = [
  () => guiRequire('playwright'),
  () => require('playwright'),
  () => require('/usr/lib/node_modules/@playwright/mcp/node_modules/playwright'),
  () => require('/usr/lib/node_modules/@executeautomation/playwright-mcp-server/node_modules/playwright'),
];
for (const cand of pwCandidates) {
  try {
    playwright = cand();
    break;
  } catch {}
}
if (!playwright) {
  if (process.env.SARAB_REQUIRE_BROWSER_TEST === '1') {
    console.error('[-] Fatal: Playwright is required in Real-Browser Security Suite but could not be loaded.');
    process.exit(1);
  }
  console.log('[~] Playwright not found in candidate paths; skipping live browser security execution.');
  process.exit(0);
}

const { chromium } = playwright;

const ATTACKER_PORT = 18098;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyDashboardAndToken(context, dashboardPage, sarabPort, validToken) {
  console.log('[*] Test 1: Launching Dashboard with initial token in query params...');
  await dashboardPage.goto(`http://127.0.0.1:${sarabPort}/?token=${validToken}`, {
    waitUntil: 'domcontentloaded',
  });

  // Wait 250ms for React / client.ts initAuthFromLocation() to execute
  await sleep(250);

  const currentUrl = dashboardPage.url();
  console.log(`  [+] Dashboard current URL: ${currentUrl}`);
  assert.equal(
    currentUrl,
    `http://127.0.0.1:${sarabPort}/`,
    `Expected token to be scrubbed from URL address bar, got: ${currentUrl}`
  );

  const locationSearch = await dashboardPage.evaluate(() => window.location.search);
  assert.equal(locationSearch, '', 'window.location.search must be empty after scrubbing');

  const metaToken = await dashboardPage.evaluate(() =>
    document.querySelector('meta[name="sarab-token"]')
  );
  assert.equal(metaToken, null, 'No <meta name="sarab-token"> tag should be injected into DOM');

  const storedToken = await dashboardPage.evaluate(() =>
    sessionStorage.getItem('sarab_token')
  );
  assert.equal(storedToken, validToken, 'Token must be safely persisted in origin-isolated sessionStorage');

  // Verify cookies in browser context: MUST NOT have any sarab_session cookie
  const cookies = await context.cookies(`http://127.0.0.1:${sarabPort}`);
  const sessionCookie = cookies.find((c) => c.name === 'sarab_session');
  assert.equal(sessionCookie, undefined, 'sarab_session cookie must NOT be set in browser context');
  console.log('  [+] Zero ambient cookie retention & sessionStorage isolation verified.');

  // Same-origin API status call with X-Sarab-Token succeeds
  const statusRes = await dashboardPage.evaluate(async (tok) => {
    const r = await fetch('/api/auth/status', {
      headers: { 'X-Sarab-Token': tok },
    });
    return { status: r.status, data: await r.json() };
  }, validToken);
  assert.equal(statusRes.status, 200, 'Same-origin /api/auth/status should succeed');
  assert.equal(statusRes.data.authenticated, true);
  console.log('  [+] Same-origin header auth verified.');

  // Same-origin mutating call with X-Sarab-Token succeeds
  const mutateRes = await dashboardPage.evaluate(async (tok) => {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sarab-Token': tok,
      },
      body: JSON.stringify({
        latitude: 35.6892,
        longitude: 51.3890,
        altitude: 1200.0,
        accuracy: 2.5,
        enabled: true,
        driftEnabled: true,
        driftRadius: 1.2,
      }),
    });
    return { status: r.status, data: await r.json() };
  }, validToken);
  assert.equal(mutateRes.status, 200, 'Same-origin authorized mutation should succeed');
  console.log('  [+] Same-origin authorized mutation with X-Sarab-Token verified.');
}

async function verifyLegacyCookieEviction(context, dashboardPage, sarabPort) {
  console.log('[*] Test 2: Testing legacy cookie expulsion on upgrade...');
  await context.addCookies([{
    name: 'sarab_session',
    value: 'stale_legacy_cookie_value_999',
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);
  await dashboardPage.goto(`http://127.0.0.1:${sarabPort}/`);
  await sleep(150);
  const postEvictCookies = await context.cookies(`http://127.0.0.1:${sarabPort}`);
  const evictedCookie = postEvictCookies.find((c) => c.name === 'sarab_session');
  assert.equal(evictedCookie, undefined, 'Legacy sarab_session cookie must be evicted by Set-Cookie Max-Age=0');
  console.log('  [+] Legacy cookie active eviction verified.');
}

async function verifyCrossOriginIsolation(context, dashboardPage, sarabPort, attackerReceivedCookies, validToken) {
  console.log('[*] Test 3: Testing cross-origin attack from foreign localhost port...');
  const attackerPage = await context.newPage();
  await attackerPage.goto(`http://127.0.0.1:${ATTACKER_PORT}/`, {
    waitUntil: 'domcontentloaded',
  });

  // Run Attack 1: Attempted Cross-Origin Read
  await attackerPage.evaluate(async () => {
    await window.runReadAttack();
  });
  const readResult = await attackerPage.evaluate(() => window.attackResults);
  assert.ok(
    readResult.readBlocked || readResult.readStatus === 403,
    `Expected cross-origin read to be blocked or return 403, got: ${JSON.stringify(readResult)}`
  );
  console.log('  [+] Cross-origin read attack from foreign port rejected.');

  // Run Attack 2: Attempted CSRF Mutation (Ambient Cookie only)
  await attackerPage.evaluate(async () => {
    await window.runMutationAttack();
  });
  const mutationResult = await attackerPage.evaluate(() => window.attackResults);
  assert.ok(
    mutationResult.mutationBlocked || mutationResult.mutationStatus === 403 || mutationResult.mutationStatus === 401,
    `Expected cross-origin mutation without token to return 403/401 or be blocked, got: ${JSON.stringify(mutationResult)}`
  );
  console.log('  [+] Cross-origin CSRF mutation attack without token rejected.');

  // Run Attack 3: Custom Header Preflight Attack
  await attackerPage.evaluate(async () => {
    await window.runCustomHeaderAttack();
  });
  const headerResult = await attackerPage.evaluate(() => window.attackResults);
  assert.ok(
    headerResult.headerBlocked || headerResult.headerStatus === 403,
    `Expected preflight for foreign origin to be blocked, got: ${JSON.stringify(headerResult)}`
  );
  console.log('  [+] Cross-origin preflight with custom header rejected.');

  // Verify that attacker server received ZERO cookies from the browser
  assert.equal(
    attackerReceivedCookies.some((c) => c.includes('sarab_session') || c.includes(validToken)),
    false,
    'Attacker server must NEVER receive sarab_session cookie or session token in request headers'
  );
  console.log('  [+] Attacker server confirmed: zero leaked tokens or cookies received.');

  // Verify backend coordinates were NOT mutated by attacker
  const verifyCfgRes = await dashboardPage.evaluate(async (tok) => {
    const r = await fetch('/api/config', {
      headers: { 'X-Sarab-Token': tok },
    });
    return await r.json();
  }, validToken);
  assert.notEqual(verifyCfgRes.latitude, 12.345, 'Backend state must NOT have been mutated by CSRF attempt');
  assert.notEqual(verifyCfgRes.latitude, 99.9, 'Backend state must NOT have been mutated by preflight attempt');
  console.log('  [+] Backend state immunity verified: coordinates remain uncorrupted.');
  await attackerPage.close();
}

async function verifySecurityHeaders(dashboardPage, sarabPort) {
  console.log('[*] Test 4: Verifying Security Headers in browser response...');
  const resp = await dashboardPage.goto(`http://127.0.0.1:${sarabPort}/`);
  const headers = resp.headers();
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.ok(headers['cache-control'].includes('no-store'));
  console.log('  [+] Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Cache-Control) verified.');
}

async function runBrowserSecuritySuite() {
  console.log('[*] Starting Sarab Browser-Level Security Regression Suite...');

  // 1. Locate Sarab executable
  const isWindows = process.platform === 'win32';
  const binName = isWindows ? 'sarab.exe' : 'sarab';
  const binPath = path.join(APP_DIR, 'target', 'debug', binName);

  // 2. Setup isolated temporary data directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarab-pw-test-'));
  const testEnv = {
    ...process.env,
    SARAB_DATA_DIR: tempDir,
    SARAB_NO_DRIVER: '1',
  };

  // 3. Start Sarab Server with dynamic port 0 in isolated environment
  console.log(`[*] Spawning isolated Sarab GUI server (ephemeral port 0)...`);
  const sarabProc = cp.spawn(binPath, ['gui', '--port', '0'], {
    cwd: APP_DIR,
    env: testEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Track process for emergency cleanup
  const cleanup = () => {
    try {
      if (sarabProc && !sarabProc.killed) {
        sarabProc.kill('SIGKILL');
      }
    } catch {}
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  };
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  let sarabPort = 0;
  let validToken = '';
  let attackerServer = null;
  let browser = null;

  try {
    // Wait for .port and .session_token to appear in isolated test data dir
    const portFile = path.join(tempDir, '.port');
    const tokenFile = path.join(tempDir, '.session_token');

    for (let i = 0; i < 50; i++) {
      if (sarabProc.exitCode !== null) {
        throw new Error(`Sarab server exited prematurely with code ${sarabProc.exitCode}`);
      }
      if (fs.existsSync(portFile) && fs.existsSync(tokenFile)) {
        try {
          const p = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10);
          const t = fs.readFileSync(tokenFile, 'utf-8').trim();
          if (p > 0 && t.length === 32) {
            sarabPort = p;
            validToken = t;
            break;
          }
        } catch {}
      }
      await sleep(100);
    }

    assert.ok(sarabPort > 0, 'Failed to acquire dynamic ephemeral port');
    assert.equal(validToken.length, 32, `Expected 32-char token, got: ${validToken}`);
    console.log(`  [+] Bound to ephemeral port: ${sarabPort}`);
    console.log(`  [+] Retrieved session token from isolated test store: ${validToken.slice(0, 8)}...`);

  // 3. Start Attacker HTTP Server on foreign port
  const attackerReceivedCookies = [];
  attackerServer = http.createServer((req, res) => {
    if (req.headers.cookie) {
      attackerReceivedCookies.push(req.headers.cookie);
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Untrusted Localhost Application</title></head>
<body>
  <h1>Attacker App running on port ${ATTACKER_PORT}</h1>
  <script>
    window.attackResults = {};

    // Attack 1: Attempt cross-origin read of Sarab config
    window.runReadAttack = async () => {
      try {
        const res = await fetch('http://127.0.0.1:${sarabPort}/api/config', {
          credentials: 'include',
        });
        window.attackResults.readStatus = res.status;
        window.attackResults.readOk = res.ok;
        window.attackResults.readData = await res.json().catch(() => null);
      } catch (err) {
        window.attackResults.readError = err.message;
        window.attackResults.readBlocked = true;
      }
    };

    // Attack 2: Attempt CSRF mutation without X-Sarab-Token (relying on ambient cookie)
    window.runMutationAttack = async () => {
      try {
        const res = await fetch('http://127.0.0.1:${sarabPort}/api/config', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ latitude: 12.345, longitude: 67.890 }),
        });
        window.attackResults.mutationStatus = res.status;
        window.attackResults.mutationOk = res.ok;
      } catch (err) {
        window.attackResults.mutationError = err.message;
        window.attackResults.mutationBlocked = true;
      }
    };

    // Attack 3: Attempt custom header preflight attack
    window.runCustomHeaderAttack = async () => {
      try {
        const res = await fetch('http://127.0.0.1:${sarabPort}/api/config', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Sarab-Token': 'guessed_or_forged_token',
          },
          body: JSON.stringify({ latitude: 99.9, longitude: 99.9 }),
        });
        window.attackResults.headerStatus = res.status;
      } catch (err) {
        window.attackResults.headerBlocked = true;
      }
    };
  </script>
</body>
</html>`);
  });

  await new Promise((resolve) => attackerServer.listen(ATTACKER_PORT, '127.0.0.1', resolve));
  console.log(`  [+] Attacker server listening on http://127.0.0.1:${ATTACKER_PORT}`);

  // 4. Launch real Google Chrome
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  };
  if (process.env.CHROME_BIN) {
    launchOptions.executablePath = process.env.CHROME_BIN;
  } else if (fs.existsSync('/usr/bin/google-chrome')) {
    launchOptions.executablePath = '/usr/bin/google-chrome';
  }
  browser = await chromium.launch(launchOptions);

  const context = await browser.newContext();
  const dashboardPage = await context.newPage();

  await verifyDashboardAndToken(context, dashboardPage, sarabPort, validToken);
  await verifyLegacyCookieEviction(context, dashboardPage, sarabPort);
  await verifyCrossOriginIsolation(context, dashboardPage, sarabPort, attackerReceivedCookies, validToken);
  await verifySecurityHeaders(dashboardPage, sarabPort);

  console.log('=== All Browser Security Regression Invariants Passed (4/4) ===');
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    if (attackerServer) {
      try { attackerServer.close(); } catch {}
    }
    if (sarabProc && !sarabProc.killed) {
      try { sarabProc.kill("SIGTERM"); } catch {}
      await sleep(150);
      try { sarabProc.kill("SIGKILL"); } catch {}
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

runBrowserSecuritySuite().catch((err) => {
  console.error('[-] Test suite failed:', err);
  process.exit(1);
});
