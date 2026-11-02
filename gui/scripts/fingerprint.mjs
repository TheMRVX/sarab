// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Deterministic frontend source & output fingerprint generator.
 * Computes canonical SHA-256 hashes over all build-relevant frontend inputs
 * (sources, config, environment files, Vite environment variables, public assets)
 * as well as generated output assets (dist/) with LF normalization for text files
 * and bit-perfect raw byte hashing for binary assets.
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

export const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
  '.css',
  '.scss',
  '.svg',
  '.md',
  '.txt',
  '.toml',
  '.yaml',
  '.yml',
  '.env',
]);

export function isTextFile(relPath) {
  const lower = relPath.toLowerCase();
  const ext = path.extname(lower);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (path.basename(lower).startsWith('.env')) return true;
  return false;
}

export function normalizeCrlfBytes(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d && i + 1 < buf.length && buf[i + 1] === 0x0a) {
      out.push(0x0a);
      i++;
    } else {
      out.push(buf[i]);
    }
  }
  return Buffer.from(out);
}

export function collectFiles(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && !entry.name.startsWith('.env')) continue;
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

export async function resolveEffectiveViteConfig(guiRoot = GUI_ROOT, cliMode = undefined) {
  try {
    const { resolveConfig } = await import('vite');
    const resolved = await resolveConfig({ mode: cliMode }, 'build', 'production');
    return resolved;
  } catch {
    return {
      mode: cliMode || 'production',
      env: {},
    };
  }
}

export function getApplicableViteEnv(env = process.env, resolvedViteEnv = {}) {
  const result = {};
  const combined = { ...resolvedViteEnv, ...env };
  const keys = Object.keys(combined)
    .filter((k) => k.startsWith('VITE_') || k.startsWith('TAURI_'))
    .sort();
  for (const k of keys) {
    result[k] = combined[k] ?? '';
  }
  return result;
}

export function computeSourceFingerprint(guiRoot = GUI_ROOT, mode = 'production', env = process.env, resolvedViteEnv = {}) {
  const fileSet = new Set();

  for (const rel of STATIC_CONFIG_FILES) {
    const full = path.join(guiRoot, rel);
    if (fs.existsSync(full)) {
      fileSet.add(rel.replace(/\\/g, '/'));
    }
  }

  // Base and mode-specific environment files
  const envCandidates = [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
    '.env.production',
    '.env.production.local',
    '.env.development',
    '.env.development.local',
    '.env.test',
    '.env.test.local',
  ];

  for (const rel of envCandidates) {
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

  // 1. Hash files: byte-level CRLF normalization for text, bit-perfect for binaries
  for (const rel of sortedFiles) {
    const full = path.join(guiRoot, rel);
    const content = fs.readFileSync(full);
    const normalized = isTextFile(rel) ? normalizeCrlfBytes(content) : content;

    hash.update(Buffer.from(rel, 'utf8'));
    hash.update(Buffer.from('\n', 'utf8'));
    hash.update(normalized);
    hash.update(Buffer.from('\n', 'utf8'));
  }

  // 2. Hash mode & effective environment variables
  hash.update(Buffer.from(`mode:${mode}\n`, 'utf8'));
  const viteEnv = getApplicableViteEnv(env, resolvedViteEnv);
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

export async function generateFingerprintPayload(guiRoot = GUI_ROOT, cliMode = undefined, env = process.env) {
  const distDir = path.resolve(guiRoot, 'dist');
  const resolvedConfig = await resolveEffectiveViteConfig(guiRoot, cliMode);
  const effectiveMode = resolvedConfig.mode || 'production';
  const sourceHash = computeSourceFingerprint(guiRoot, effectiveMode, env, resolvedConfig.env);
  const { distHash, assetHashes } = computeDistFingerprint(distDir);
  const viteEnv = getApplicableViteEnv(env, resolvedConfig.env);

  return {
    version: 1,
    mode: effectiveMode,
    source_hash: sourceHash,
    dist_hash: distHash,
    build_env: {
      mode: effectiveMode,
      vite_env: viteEnv,
    },
    assets: assetHashes,
  };
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[-] Dist directory does not exist: ${DIST_DIR}`);
    process.exit(1);
  }

  let cliMode = undefined;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--mode' || process.argv[i] === '-m') {
      cliMode = process.argv[i + 1];
      break;
    } else if (process.argv[i].startsWith('--mode=')) {
      cliMode = process.argv[i].slice(7);
      break;
    }
  }

  const payload = await generateFingerprintPayload(GUI_ROOT, cliMode);
  fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`[+] Deterministic frontend fingerprint generated (mode: ${payload.mode}):`);
  console.log(`    Source Hash: ${payload.source_hash}`);
  console.log(`    Dist Hash:   ${payload.dist_hash} (${Object.keys(payload.assets).length} assets)`);
  console.log(`    Written to:  ${FINGERPRINT_FILE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
