#!/usr/bin/env node
/**
 * vendor-sql-wasm.mjs — regenerate the sql.js WebAssembly pair in `public/`.
 *
 * Why this exists: `src/lib/sqlite/sqliteEngine.ts` force-serves the SQLite
 * WebAssembly binary from `/sql-wasm.wasm` (direct fetch plus `locateFile`),
 * while the JS glue is bundled by Vite from the *installed* sql.js package.
 * The glue and the binary must come from the same sql.js build — when they
 * disagree, engine init fails at boot (observed as `ka is not a function`
 * when the bundled sql.js 1.16 glue met a hand-committed 1.14 binary).
 *
 * These two files used to be hand-committed copies of
 * `node_modules/sql.js/dist/`, which is exactly how that drift happened:
 * nothing kept them in sync with the installed package. They are now
 * generated at build time (npm runs this script via `prebuild` and
 * `prebuild:spa`) and untracked in git, so they can never drift from the
 * package Vite bundles.
 *
 * Usage: node scripts/vendor-sql-wasm.mjs
 *        (also runs automatically before `npm run build` / `npm run build:spa`)
 * Exit:  0 = pair (re)generated and verified; 1 = sql.js is not installed or
 *        its dist layout changed.
 *
 * Implementation: no shell-outs (no execSync, no cp) — plain `node:fs` copies
 * and a `node:crypto` sha-256 check. Idempotent: the same installed package
 * always produces the same bytes, so re-running is always safe.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_DIR = join(ROOT, 'node_modules', 'sql.js');
const PKG_DIST = join(PKG_DIR, 'dist');
const PUBLIC_DIR = join(ROOT, 'public');

/** The pair the app serves from `public/`, each copied from sql.js `dist/`. */
const PAIR = [
  { dist: 'sql-wasm.js', dest: 'sql-wasm.js' },
  { dist: 'sql-wasm.wasm', dest: 'sql-wasm.wasm' },
];

function fail(message) {
  console.error(`[vendor-sql-wasm] ${message}`);
  process.exit(1);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function fmt(bytes) {
  return bytes.toLocaleString('en-US');
}

// sql.js must be installed. npm lifecycle hooks only ever fire after an
// install, but a bare `node scripts/vendor-sql-wasm.mjs` on a fresh checkout
// deserves a plain-language answer instead of a stack trace.
const pkgJsonPath = join(PKG_DIR, 'package.json');
if (!existsSync(pkgJsonPath)) {
  fail(
    'node_modules/sql.js is missing — install dependencies first (`npm ci` or `npm install`), then re-run.'
  );
}

let version;
try {
  version = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
} catch {
  fail('node_modules/sql.js/package.json could not be read as JSON.');
}
console.log(`[vendor-sql-wasm] sql.js ${version} (from node_modules/sql.js)`);

// Assert both upstream files exist before touching anything in public/.
for (const { dist } of PAIR) {
  if (!existsSync(join(PKG_DIST, dist))) {
    fail(
      `sql.js ${version} is installed but dist/${dist} is missing — the upstream package layout changed; update this script.`
    );
  }
}

mkdirSync(PUBLIC_DIR, { recursive: true });

const copied = [];
for (const { dist, dest } of PAIR) {
  const srcPath = join(PKG_DIST, dist);
  const destPath = join(PUBLIC_DIR, dest);
  copyFileSync(srcPath, destPath);
  // The copy is only useful if it is byte-identical to the upstream file.
  const hash = sha256(srcPath);
  if (sha256(destPath) !== hash) {
    fail(
      `${relative(ROOT, destPath)} does not match ${relative(ROOT, srcPath)} after the copy — refusing to continue.`
    );
  }
  const size = statSync(srcPath).size;
  console.log(
    `[vendor-sql-wasm] ${relative(ROOT, srcPath)} -> ${relative(ROOT, destPath)}: ${fmt(size)} bytes, sha256 ${hash}`
  );
  copied.push({ dest: relative(ROOT, destPath), size });
}

const summary = copied.map((c) => `${c.dest} (${fmt(c.size)} B)`).join(' + ');
console.log(
  `[vendor-sql-wasm] vendored sql.js ${version}: ${summary} — glue and binary now match the bundled package.`
);
