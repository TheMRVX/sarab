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
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(REPO_ROOT, 'app');

// Resolve Playwright
const require = createRequire(import.meta.url);
let playwright;
const pwCandidates = [
  'playwright',
  '/usr/lib/node_modules/@playwright/mcp/node_modules/playwright',
  '/usr/lib/node_modules/@executeautomation/playwright-mcp-server/node_modules/playwright',
];
for (const cand of pwCandidates) {
  try {
    playwright = require(cand);
    break;
  } catch {}
}
if (!playwright) {
  console.error('[-] Playwright not found in candidate paths.');
  process.exit(1);
}

const { chromium } = playwright;

const SARAB_PORT = 18092;
const ATTACKER_PORT = 18098;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBrowserSecuritySuite() {
  console.log('[*] Starting Sarab Browser-Level Security Regression Suite...');

  // 1. Locate Sarab executable
  const isWindows = process.platform === 'win32';
  const binName = isWindows ? 'sarab.exe' : 'sarab';
  const binPath = path.join(APP_DIR, 'target', 'debug', binName);

  // 2. Start Sarab Server
  console.log(`[*] Spawning Sarab GUI server on port ${SARAB_PORT}...`);
  const sarabProc = cp.spawn(binPath, ['gui', '--port', String(SARAB_PORT)], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverStarted = false;
  sarabProc.stdout.on('data', (d) => {
    if (d.toString().includes('Listening on:')) serverStarted = true;
  });

  // Wait for Sarab server readiness
  for (let i = 0; i < 40; i++) {
    if (serverStarted) break;
    await sleep(100);
  }

  // Retrieve valid session token via CLI
  const tokenProc = cp.spawnSync(binPath, ['token', '--raw'], {
    cwd: APP_DIR,
    encoding: 'utf-8',
  });
  const validToken = tokenProc.stdout.trim();
  assert.equal(validToken.length, 32, `Expected 32-char token, got: ${validToken}`);
  console.log(`  [+] Retrieved valid session token from CLI: ${validToken.slice(0, 8)}...`);

  // 3. Start Attacker HTTP Server on foreign port
  const attackerServer = http.createServer((req, res) => {
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
        const res = await fetch('http://127.0.0.1:${SARAB_PORT}/api/config', {
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
        const res = await fetch('http://127.0.0.1:${SARAB_PORT}/api/config', {
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
        const res = await fetch('http://127.0.0.1:${SARAB_PORT}/api/config', {
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
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext();
    const dashboardPage = await context.newPage();

    // =========================================================================
    // Test 1: Trusted Dashboard Launch & Token Sanitization
    // =========================================================================
    console.log('[*] Test 1: Launching Dashboard with initial token in query params...');
    await dashboardPage.goto(`http://127.0.0.1:${SARAB_PORT}/?token=${validToken}`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait 250ms for React / client.ts initAuthFromLocation() to execute
    await sleep(250);

    const currentUrl = dashboardPage.url();
    console.log(`  [+] Dashboard current URL: ${currentUrl}`);
    assert.equal(
      currentUrl,
      `http://127.0.0.1:${SARAB_PORT}/`,
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
    assert.equal(storedToken, null, 'No token should be stored in sessionStorage');

    // Verify cookies in browser context
    const cookies = await context.cookies(`http://127.0.0.1:${SARAB_PORT}`);
    const sessionCookie = cookies.find((c) => c.name === 'sarab_session');
    assert.ok(sessionCookie, 'sarab_session cookie must be set in browser context');
    assert.equal(sessionCookie.value, validToken, 'sarab_session cookie value must match token');
    assert.ok(sessionCookie.httpOnly, 'sarab_session cookie must be HttpOnly');
    assert.equal(sessionCookie.sameSite, 'Strict', 'sarab_session cookie must be SameSite=Strict');
    console.log('  [+] HttpOnly SameSite=Strict session cookie verified.');

    // Same-origin API call within dashboard page succeeds
    const sessionRes = await dashboardPage.evaluate(async () => {
      const r = await fetch('/api/auth/session');
      return { status: r.status, data: await r.json() };
    });
    assert.equal(sessionRes.status, 200, 'Same-origin /api/auth/session should succeed');
    assert.equal(sessionRes.data.authenticated, true);
    assert.equal(sessionRes.data.token, validToken);
    console.log('  [+] Same-origin session rehydration verified.');

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

    // =========================================================================
    // Test 2: Cross-Origin Boundary & Anti-CSRF on Foreign Localhost Port
    // =========================================================================
    console.log('[*] Test 2: Testing cross-origin attack from foreign localhost port...');
    const attackerPage = await context.newPage();
    await attackerPage.goto(`http://127.0.0.1:${ATTACKER_PORT}/`, {
      waitUntil: 'domcontentloaded',
    });

    // Run Attack 1: Attempted Cross-Origin Read
    await attackerPage.evaluate(async () => {
      await window.runReadAttack();
    });
    const readResult = await attackerPage.evaluate(() => window.attackResults);
    // Either browser CORS blocked it (readBlocked) or server responded 403 Forbidden
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
      mutationResult.mutationBlocked || mutationResult.mutationStatus === 403,
      `Expected cross-origin mutation without token to return 403 or be blocked, got: ${JSON.stringify(mutationResult)}`
    );
    console.log('  [+] Cross-origin CSRF mutation attack without token rejected (403 Forbidden).');

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

    // =========================================================================
    // Test 3: Security Headers Verification
    // =========================================================================
    console.log('[*] Test 3: Verifying Security Headers in browser response...');
    const resp = await dashboardPage.goto(`http://127.0.0.1:${SARAB_PORT}/`);
    const headers = resp.headers();
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['referrer-policy'], 'no-referrer');
    assert.ok(headers['cache-control'].includes('no-store'));
    console.log('  [+] Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Cache-Control) verified.');

    console.log('=== All Browser Security Regression Invariants Passed (3/3) ===');
  } finally {
    await browser.close();
    attackerServer.close();
    sarabProc.kill();
  }
}

runBrowserSecuritySuite().catch((err) => {
  console.error('[-] Test suite failed:', err);
  process.exit(1);
});
