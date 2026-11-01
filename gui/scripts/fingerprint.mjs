// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Deterministic frontend source & output fingerprint generator.
 * Computes canonical SHA-256 hashes over all build-relevant frontend inputs
 * (sources, config, environment files, Vite environment variables, public assets)
 * as well as generated output assets (dist/) with LF normalization.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUI_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(GUI_ROOT, 'dist');
const FINGERPRINT_FILE = path.resolve(DIST_DIR, '.fingerprint');

export const STATIC_CONFIG_FILES = [
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'scripts/fingerprint.mjs',
];

export const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
];

export function collectFiles(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push(relPath);
    }
  }
  return results;
}

export function getApplicableViteEnv(env = process.env) {
  const result = {};
  const keys = Object.keys(env)
    .filter((k) => k.startsWith('VITE_') || k.startsWith('TAURI_'))
    .sort();
  for (const k of keys) {
    result[k] = env[k] ?? '';
  }
  return result;
}

export function computeSourceFingerprint(guiRoot = GUI_ROOT, env = process.env) {
  const fileSet = new Set();

  for (const rel of STATIC_CONFIG_FILES) {
    const full = path.join(guiRoot, rel);
    if (fs.existsSync(full)) {
      fileSet.add(rel.replace(/\\/g, '/'));
    }
  }

  for (const rel of ENV_FILES) {
    const full = path.join(guiRoot, rel);
    if (fs.existsSync(full)) {
      fileSet.add(rel.replace(/\\/g, '/'));
    }
  }

  const publicFiles = collectFiles(path.join(guiRoot, 'public'), guiRoot);
  for (const rel of publicFiles) {
    fileSet.add(rel);
  }

  const srcFiles = collectFiles(path.join(guiRoot, 'src'), guiRoot);
  for (const rel of srcFiles) {
    fileSet.add(rel);
  }

  const sortedFiles = Array.from(fileSet).sort();
  const hash = crypto.createHash('sha256');

  // 1. Hash files with LF normalization
  for (const rel of sortedFiles) {
    const full = path.join(guiRoot, rel);
    const content = fs.readFileSync(full);
    const normalized = Buffer.from(content.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');

    hash.update(Buffer.from(rel, 'utf8'));
    hash.update(Buffer.from('\n', 'utf8'));
    hash.update(normalized);
    hash.update(Buffer.from('\n', 'utf8'));
  }

  // 2. Hash applicable environment variables
  const viteEnv = getApplicableViteEnv(env);
  for (const [key, val] of Object.entries(viteEnv)) {
    hash.update(Buffer.from(`env:${key}=${val}\n`, 'utf8'));
  }

  return hash.digest('hex');
}

export function computeDistFingerprint(distDir = DIST_DIR) {
  if (!fs.existsSync(distDir)) {
    return { distHash: '', assetHashes: {} };
  }

  const distFiles = collectFiles(distDir, distDir)
    .filter((rel) => rel !== '.fingerprint' && !rel.startsWith('.git'))
    .sort();

  const assetHashes = {};
  const masterHash = crypto.createHash('sha256');

  for (const rel of distFiles) {
    const full = path.join(distDir, rel);
    const content = fs.readFileSync(full);
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    assetHashes[rel] = fileHash;

    masterHash.update(Buffer.from(rel, 'utf8'));
    masterHash.update(Buffer.from('\n', 'utf8'));
    masterHash.update(Buffer.from(fileHash, 'utf8'));
    masterHash.update(Buffer.from('\n', 'utf8'));
  }

  return {
    distHash: masterHash.digest('hex'),
    assetHashes,
  };
}

export function generateFingerprintPayload(guiRoot = GUI_ROOT, env = process.env) {
  const distDir = path.resolve(guiRoot, 'dist');
  const sourceHash = computeSourceFingerprint(guiRoot, env);
  const { distHash, assetHashes } = computeDistFingerprint(distDir);
  const viteEnv = getApplicableViteEnv(env);

  return {
    version: 1,
    source_hash: sourceHash,
    dist_hash: distHash,
    build_env: {
      vite_env: viteEnv,
    },
    assets: assetHashes,
  };
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[-] Dist directory does not exist: ${DIST_DIR}`);
    process.exit(1);
  }

  const payload = generateFingerprintPayload(GUI_ROOT);
  fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`[+] Deterministic frontend fingerprint generated:`);
  console.log(`    Source Hash: ${payload.source_hash}`);
  console.log(`    Dist Hash:   ${payload.dist_hash} (${Object.keys(payload.assets).length} assets)`);
  console.log(`    Written to:  ${FINGERPRINT_FILE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
