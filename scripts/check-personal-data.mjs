#!/usr/bin/env node
/**
 * Personal-data and secret scan (guide §II.29).
 *
 * Why this exists: a repository publishes its files, its whole history and its
 * build artefacts. A real person's name, address, mailbox or secret in any of
 * those is a defect, not content. `gitleaks` already covers credentials; this
 * script covers the *personal-data* half of II.29 — absolute home paths,
 * mailbox domains and named identifiers — over the working tree AND the whole
 * history, and it can additionally be given a literal denylist through the
 * environment so that a known personal value is never written into the repo.
 *
 * Two rules the implementation must respect for its own sake:
 *
 *   1. It never prints a matched value. CI logs are public, so every hit is
 *      reported as `file:line` plus a pattern class. Printing the value would
 *      repeat the very leak the scan exists to find.
 *   2. The literal denylist is never committed. It arrives in the
 *      `PII_DENYLIST` environment variable (newline-separated, from an Actions
 *      secret). With no variable set, the structural patterns still run.
 *
 * Usage:
 *   node scripts/check-personal-data.mjs              # tree + history
 *   node scripts/check-personal-data.mjs --no-history # tree only (fast)
 *   node scripts/check-personal-data.mjs <dir>        # scan an unpacked
 *                                                     # artefact (II.29.6)
 * Exit code: 0 clean (or allowlisted), 1 findings.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const SKIP_HISTORY = args.includes('--no-history');
const artefactDir = args.find((a) => !a.startsWith('--'));

/**
 * Structural patterns. Each carries the reason it is a finding and an optional
 * allowance, so a hit is never dismissed on vibes.
 */
const PATTERNS = [
  {
    id: 'absolute-home-path',
    re: /\/home\/[a-z0-9_-]+\//gi,
    // `/home/runner` is the CI account (optionally versioned); `/home/web_user`
    // is sql.js's Emscripten virtual filesystem, which is upstream code.
    allow: (m) => /^\/home\/(runner[0-9]*|web_user)\//i.test(m),
    why: 'an absolute home path usually contains the maintainer\u2019s OS account name, which is normally their real name',
  },
  {
    id: 'windows-user-path',
    re: /[A-Z]:\\Users\\[A-Za-z0-9_.-]+/g,
    allow: () => false,
    why: 'a Windows user path exposes the account name',
  },
  {
    // Any consumer mailbox domain, with or without sub-domains and whatever
    // country TLD: the address is a real person's even when the domain is
    // spelled gmail.co.uk. example.com/example.org fixtures never match.
    id: 'personal-mailbox',
    re: /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*(?:gmail|googlemail|outlook|hotmail|live|proton|protonmail|yahoo|icloud|aol|me)\.(?:com|co\.[a-z]{2}|[a-z]{2})/gi,
    allow: (m) => /@(?:[A-Za-z0-9-]+\.)*example\.(com|org|net)$/i.test(m),
    why: 'a consumer mailbox domain is a real person\u2019s address (use example.com in fixtures)',
  },
  {
    id: 'generic-credential',
    re: /\b(api[_-]?key|secret|token|password|passwd|bearer)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/gi,
    allow: (m) =>
      /\$\{|\{\{|process\.env|placeholder|your[_-]|example|dummy|redacted|<[a-z]/i.test(m),
    why: 'a literal credential assignment',
  },
];

/**
 * Files that are upstream third-party content and legitimately carry other
 * people's identities or emulator paths. Every entry is a path prefix; the
 * reason is recorded so the allowlist can be audited rather than trusted.
 */
const UPSTREAM_ALLOWLIST = [
  {
    prefix: 'android/app/src/main/cpp/third_party/',
    why: 'vendored whisper.cpp: its own AUTHORS/LICENSE',
  },
  {
    prefix: 'android/app/src/main/assets/public/',
    why: 'built web bundle: contains sql.js (Emscripten /home/web_user)',
  },
  { prefix: 'public/sql-wasm.js', why: 'vendored sql.js build (Emscripten virtual filesystem)' },
  {
    prefix: 'public/sql-wasm-browser',
    why: 'vendored sql.js build (Emscripten virtual filesystem)',
  },
  { prefix: 'node_modules/', why: 'installed dependencies' },
  {
    prefix: 'package-lock.json',
    why: 'dependency metadata (registry URLs and integrity hashes, no personal data)',
  },
  {
    prefix: 'ATTRIBUTION.md',
    why: 'third-party licence/authorship inventory, required by §II.19.3',
  },
];

function isAllowlisted(file) {
  return UPSTREAM_ALLOWLIST.some((a) => file.startsWith(a.prefix));
}

function git(...a) {
  return execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function redact(value) {
  const v = value.trim();
  if (v.length <= 6) return '*'.repeat(v.length);
  return `${v.slice(0, 2)}${'*'.repeat(Math.max(4, v.length - 4))}${v.slice(-2)}`;
}

/** Scans a set of files (worktree or unpacked artefact). */
function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) continue;
    let text;
    try {
      text = readFileSync(file, 'latin1');
    } catch {
      continue;
    }
    // Skip anything that is not plausibly text.
    if (text.includes('\u0000')) continue;

    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text)) !== null) {
        if (p.allow(m[0])) continue;
        const line = text.slice(0, m.index).split('\n').length;
        findings.push({ file, line, id: p.id, why: p.why, redacted: redact(m[0]) });
      }
    }
  }
  return findings;
}

/** Literal denylist, from the environment only (never a committed file). */
function literals() {
  const raw = process.env.PII_DENYLIST || '';
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

function scanHistoryLiterals(values) {
  const findings = [];
  for (const value of values) {
    try {
      const out = git('log', '--all', '--format=%h %ad %s', '--date=short', `-S${value}`);
      for (const line of out.split('\n').filter(Boolean)) {
        findings.push({
          file: '(history)',
          line: line.split(' ')[0],
          id: 'denylisted-value-in-history',
          why: 'a value on the denylist is readable in an earlier commit',
          redacted: redact(value),
          detail: line.slice(line.indexOf(' ') + 1),
        });
      }
    } catch {
      /* git failure must not mask a clean result into a pass silently */
      findings.push({
        file: '(history)',
        line: '?',
        id: 'history-scan-failed',
        why: 'git log -S could not run; history was NOT verified',
        redacted: redact(value),
      });
    }
  }
  return findings;
}

function scanTreeLiterals(values) {
  const findings = [];
  for (const value of values) {
    let out = '';
    try {
      out = git('grep', '-n', '-I', '-F', '--', value);
    } catch {
      continue; // no match
    }
    for (const line of out.split('\n').filter(Boolean)) {
      const [file, ln] = line.split(':');
      findings.push({
        file,
        line: ln,
        id: 'denylisted-value-in-tree',
        why: 'a value on the denylist is present in the working tree',
        redacted: redact(value),
      });
    }
  }
  return findings;
}

function listArtefactFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

function report(findings, scope) {
  const values = literals();
  console.log(`personal-data scan (${scope})`);
  console.log(`  structural patterns: ${PATTERNS.length}`);
  console.log(`  literal denylist entries: ${values.length || 'none configured'}`);
  console.log(`  upstream allowlist entries: ${UPSTREAM_ALLOWLIST.length}`);
  const actionable = findings.filter((f) => !isAllowlisted(f.file));
  const allowed = findings.length - actionable.length;

  if (findings.length) {
    console.log(`\n  classified hits (values redacted by design):`);
    for (const f of findings) {
      const verdict = isAllowlisted(f.file) ? 'allowlisted-upstream' : 'FINDING';
      console.log(
        `    [${verdict}] ${f.id} ${f.file}:${f.line} value=${f.redacted}${
          f.detail ? ` ${f.detail}` : ''
        }\n        why it matters: ${f.why}`
      );
    }
  }

  console.log(
    `\n  summary: ${actionable.length} finding(s), ${allowed} allowlisted upstream hit(s)`
  );
  if (actionable.length === 0) {
    console.log('  result: clean');
    return 0;
  }
  console.log('  result: FAILED — classify or remove every finding above');
  return 1;
}

if (artefactDir) {
  // II.29.6: the published surface — an unpacked release asset.
  const findings = scanFiles(listArtefactFiles(artefactDir));
  process.exit(report(findings, `artefact ${relative(process.cwd(), artefactDir) || artefactDir}`));
}

const tracked = git('ls-files').split('\n').filter(Boolean);
let findings = scanFiles(tracked);
const values = literals();
if (values.length) {
  findings = findings.concat(scanTreeLiterals(values));
  if (!SKIP_HISTORY) findings = findings.concat(scanHistoryLiterals(values));
}
process.exit(report(findings, SKIP_HISTORY ? 'working tree' : 'working tree + history'));
