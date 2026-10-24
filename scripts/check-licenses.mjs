#!/usr/bin/env node
/**
 * check-licenses.mjs
 *
 * Dependency licence gate (guide §19.2, §19.4, §25). Walks every installed
 * package under `node_modules/` (direct and transitive), reads its declared
 * licence, and fails the build if any package can **only** be used under a
 * licence class that is incompatible with shipping VellumScribe under MIT.
 *
 * SPDX expressions are evaluated properly:
 *   - `A OR B` is acceptable if either side is acceptable (you may choose the
 *     permissive option), so `MIT OR GPL-3.0-or-later` passes.
 *   - `A AND B` requires every side to be acceptable.
 *
 * It fails on *disallowed* classes rather than allow-listing every known good
 * licence, so an unfamiliar-but-permissive licence does not break the build;
 * unknown licences are reported for a human to confirm.
 *
 * Usage: node scripts/check-licenses.mjs
 * Exit:  0 = no disallowed licences, 1 = at least one disallowed licence.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

/** Disallowed licence classes (guide §19.2). [test, class, reason]. */
const DENIED = [
  [/SSPL/i, 'Source-available', 'SSPL is not OSI open source and restricts use.'],
  [/BUSL|Business Source/i, 'Source-available', 'Business Source License restricts use.'],
  [/Commons Clause/i, 'Source-available', 'Commons Clause forbids commercial use.'],
  [/Elastic License/i, 'Source-available', 'Elastic License 2.0 restricts use.'],
  [/CC-BY-NC|NonCommercial/i, 'Non-commercial', 'NC restrictions are not open-source compatible.'],
  [/proprietary/i, 'Proprietary', 'Proprietary terms cannot be redistributed under MIT.'],
  [/UNLICENSED/i, 'Unlicensed', 'No licence means no redistribution permission.'],
];

/** Licences we recognise as fine, so they are not reported as "unknown". */
const KNOWN_PERMISSIVE =
  /^(MIT|ISC|Apache-2\.0|Apache-1\.1|BSD|BSD-2-Clause|BSD-3-Clause|0BSD|Unlicense|CC0-1\.0|MPL-2\.0|Python-2\.0|PSF-2\.0|Zlib|BlueOak-1\.0\.0|CC-BY-4\.0|CC-BY-3\.0|WTFPL|OFL-1\.1|MIT-0|BSL-1\.0|Artistic-2\.0|PostgreSQL|NCSA|Ruby|Vim|curl|Boost|Public Domain|X11|JSON|Unicode-3\.0|Unicode-DFS-2016)$/i;

/**
 * Classify one licence token (no OR/AND).
 * @returns {{ok: boolean, known: boolean, klass?: string, reason?: string}}
 */
function classify(token) {
  const t = token.trim();
  if (!t) return { ok: true, known: true };
  // LGPL is weak copyleft: usable with an MIT project if its rules are met.
  if (/LGPL/i.test(t)) return { ok: true, known: true };

  const rule = DENIED.find(([test]) => test.test(t));
  if (rule) return { ok: false, known: true, klass: rule[1], reason: rule[2] };

  if (/\bAGPL\b|\bGPL\b/i.test(t)) {
    return {
      ok: false,
      known: true,
      klass: 'Strong copyleft',
      reason: 'would force VellumScribe off MIT',
    };
  }
  if (KNOWN_PERMISSIVE.test(t)) return { ok: true, known: true };
  return { ok: true, known: false };
}

/**
 * Evaluate an SPDX expression.
 * @returns {{ok: boolean, known: boolean, klass?: string, reason?: string}}
 */
function evaluate(spdx) {
  const cleaned = String(spdx).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { ok: true, known: false };

  const alternatives = cleaned.split(/\s+OR\s+/i);
  let lastFailure = null;
  for (const alt of alternatives) {
    const required = alt
      .split(/\s+AND\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);
    let ok = true;
    let unknown = false;
    let failure = null;
    for (const part of required) {
      const r = classify(part);
      if (!r.ok) {
        ok = false;
        failure = r;
      }
      if (!r.known) unknown = true;
    }
    if (ok) {
      // This alternative is usable; acceptable overall (warn if unrecognised).
      return { ok: true, known: !unknown };
    }
    lastFailure = failure;
  }
  return { ok: false, known: true, klass: lastFailure?.klass, reason: lastFailure?.reason };
}

function readLicense(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses
      .map((l) => (typeof l === 'string' ? l : l && l.type))
      .filter(Boolean)
      .join(' OR ');
  }
  return null;
}

function listPackages() {
  if (!fs.existsSync(NODE_MODULES)) {
    console.error('check-licenses: node_modules/ not found — run the install first.');
    process.exit(1);
  }
  const out = [];
  for (const entry of fs.readdirSync(NODE_MODULES)) {
    if (entry.startsWith('.')) continue;
    const full = path.join(NODE_MODULES, entry);
    if (entry.startsWith('@')) {
      for (const inner of fs.readdirSync(full)) out.push(path.join(full, inner));
    } else {
      out.push(full);
    }
  }
  return out;
}

const denied = [];
const unknown = [];
let checked = 0;

for (const dir of listPackages()) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) continue;
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    continue; // unreadable package.json — not our concern here
  }
  if (!pkg.name) continue;
  checked += 1;

  const license = readLicense(pkg);
  const label = `${pkg.name}@${pkg.version || '?'}`;
  if (!license) {
    unknown.push(`${label} — (no licence field)`);
    continue;
  }

  const result = evaluate(license);
  if (!result.ok) {
    denied.push(`${label} — ${license} [${result.klass}: ${result.reason}]`);
  } else if (!result.known) {
    unknown.push(`${label} — ${license}`);
  }
}

console.log(`check-licenses: inspected ${checked} packages.`);

if (unknown.length > 0) {
  console.log(`\nUnrecognised licences (review recommended, not blocking): ${unknown.length}`);
  for (const u of unknown.slice(0, 30)) console.log(`  ? ${u}`);
  if (unknown.length > 30) console.log(`  … and ${unknown.length - 30} more`);
}

if (denied.length > 0) {
  console.error(`\nFAIL: ${denied.length} package(s) under a disallowed licence class:`);
  for (const d of denied) console.error(`  ✗ ${d}`);
  console.error(
    '\nReplace the package, or record an explicit decision in DECISIONS.md before shipping it.'
  );
  process.exit(1);
}

console.log('\nOK: no disallowed licence classes found.');
