#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function getFiles(dir, exts = ['.ts', '.tsx']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, exts));
    } else {
      const ext = path.extname(file);
      if (exts.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const srcDir = path.resolve('src');
const allSrcFiles = getFiles(srcDir);
const allFilesToSearch = [
  ...allSrcFiles,
  path.resolve('server.ts'),
  path.resolve('index.html'),
].filter((f) => fs.existsSync(f));

// Read all file contents
const fileContents = allFilesToSearch.map((f) => ({
  path: f,
  content: fs.readFileSync(f, 'utf8'),
}));

// Known entry points or global declarations that don't need imports
const entryPoints = new Set([
  path.resolve('src/main.tsx'),
  path.resolve('src/types.ts'),
  path.resolve('src/vite-env.d.ts'),
  path.resolve('src/setupTests.ts'),
]);

const orphans = [];

for (const file of allSrcFiles) {
  if (entryPoints.has(file)) continue;
  if (file.endsWith('.test.ts') || file.endsWith('.test.tsx') || file.endsWith('.spec.ts'))
    continue;
  if (file.endsWith('.d.ts')) continue;

  const baseNameWithoutExt = path.basename(file, path.extname(file));
  // Check relative imports or references
  let isReferenced = false;

  for (const target of fileContents) {
    if (target.path === file) continue; // Don't check against self

    // Match import ... from '.../baseName' or import('.../baseName')
    if (
      target.content.includes(`/${baseNameWithoutExt}`) ||
      target.content.includes(`'./${baseNameWithoutExt}'`) ||
      target.content.includes(`"/${baseNameWithoutExt}"`) ||
      target.content.includes(`"./${baseNameWithoutExt}"`) ||
      target.content.includes(baseNameWithoutExt)
    ) {
      isReferenced = true;
      break;
    }
  }

  if (!isReferenced) {
    orphans.push(path.relative(process.cwd(), file));
  }
}

if (orphans.length > 0) {
  console.error(`[check:orphans] Found ${orphans.length} unreferenced source file(s):`);
  orphans.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.log(
    `[check:orphans] All ${allSrcFiles.length} source files in src/ have valid importers or entry points.`
  );
}
