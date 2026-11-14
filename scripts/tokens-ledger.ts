#!/usr/bin/env node
/**
 * Token-ledger CLI for the release workflow (guide.md §12.1).
 *
 * The release job runs this on every semver tag to record the tokens spent on
 * that release, then appends the printed {@link releaseNotesSection} to the
 * GitHub release body. It is the only writer of `docs/tokens.json`.
 *
 * Run with:
 *
 *     npx tsx scripts/tokens-ledger.ts --version 3.1.1 --tokens 123456
 *     npx tsx scripts/tokens-ledger.ts --print
 *
 * The file is written with a trailing newline (via `serialiseLedger`) because
 * the repository's Prettier `format` gate expects exactly that; writing without
 * it would fail CI on the very commit the release job makes.
 *
 * All ledger logic lives in `src/lib/tokenLedger.ts` so the app and the release
 * job never diverge; this script only does file I/O and argument handling and
 * depends on nothing beyond `node:fs` and `node:process`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';
import {
  applyRelease,
  readLedger,
  releaseNotesSection,
  serialiseLedger,
} from '../src/lib/tokenLedger';

interface CliOptions {
  version?: string;
  tokens: number;
  file: string;
  print: boolean;
}

/** Print a plain-language reason to stderr and exit non-zero. */
function fail(message: string): never {
  stderr.write(`tokens-ledger: ${message}\n`);
  exit(1);
}

/** Parse `argv` (without the leading node + script entries). */
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { tokens: 0, file: 'docs/tokens.json', print: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--print') {
      options.print = true;
    } else if (arg === '--version' || arg === '--tokens' || arg === '--file') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return fail(`missing value for ${arg}`);
      }
      i += 1;
      if (arg === '--version') {
        options.version = value;
      } else if (arg === '--file') {
        options.file = value;
      } else {
        const tokens = Number(value);
        if (!Number.isInteger(tokens)) {
          return fail(`--tokens must be a whole number, received "${value}"`);
        }
        options.tokens = tokens;
      }
    } else {
      return fail(`unknown argument "${arg}" (expected --version, --tokens, --file or --print)`);
    }
  }

  return options;
}

function main(): void {
  const options = parseArgs(argv.slice(2));

  if (!options.print && !options.version) {
    return fail(
      '--version <semver> is required when writing the ledger (use --print to only preview)'
    );
  }

  let text: string;
  try {
    text = readFileSync(options.file, 'utf8');
  } catch {
    return fail(`could not read ${options.file}`);
  }

  const { ledger, available } = readLedger(text);
  if (!available) {
    return fail(`${options.file} is not a readable token ledger (see its _notes field)`);
  }

  const updated = applyRelease(ledger, options.version ?? '', options.tokens);
  const section = releaseNotesSection(updated);

  if (options.print) {
    stdout.write(`${section}\n`);
    return;
  }

  writeFileSync(options.file, serialiseLedger(updated), 'utf8');
  stdout.write(
    `tokens-ledger: recorded ${updated.release_tokens} tokens for ${updated.release_version} ` +
      `(total ${updated.total_tokens_since_start}) in ${options.file}\n`
  );
}

main();
