// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Deterministic frontend source fingerprint generator.
 * Computes a canonical SHA-256 hash over all build-relevant frontend inputs
 * with LF normalization and lexicographical path ordering.
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

const STATIC_INPUTS = [
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'scripts/fingerprint.mjs',
];

function collectFiles(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
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

export function computeFingerprint(guiRoot = GUI_ROOT) {
  const fileSet = new Set();

  for (const rel of STATIC_INPUTS) {
    const full = path.join(guiRoot, rel);
    if (fs.existsSync(full)) {
      fileSet.add(rel.replace(/\\/g, '/'));
    }
  }

  const srcFiles = collectFiles(path.join(guiRoot, 'src'), guiRoot);
  for (const rel of srcFiles) {
    fileSet.add(rel);
  }

  const sortedFiles = Array.from(fileSet).sort();
  const hash = crypto.createHash('sha256');

  for (const rel of sortedFiles) {
    const full = path.join(guiRoot, rel);
    const content = fs.readFileSync(full);
    // LF normalization
    const normalized = Buffer.from(content.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');

    hash.update(Buffer.from(rel, 'utf8'));
    hash.update(Buffer.from('\n', 'utf8'));
    hash.update(normalized);
    hash.update(Buffer.from('\n', 'utf8'));
  }

  return hash.digest('hex');
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[-] Dist directory does not exist: ${DIST_DIR}`);
    process.exit(1);
  }

  const digest = computeFingerprint(GUI_ROOT);
  fs.writeFileSync(FINGERPRINT_FILE, digest + '\n', 'utf8');
  console.log(`[+] Deterministic frontend fingerprint generated: ${digest}`);
  console.log(`    Written to: ${FINGERPRINT_FILE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
