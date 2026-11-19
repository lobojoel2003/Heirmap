#!/usr/bin/env node
// Fail if any package.json (or the library's VERSION constant) disagrees with the expected version.
//   node scripts/check-version.mjs 1.0.0
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const expected = (process.argv[2] ?? '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(expected)) {
  console.error(`Usage: check-version.mjs <semver>  (got "${process.argv[2] ?? ''}")`);
  process.exit(2);
}
const files = ['package.json', 'packages/intestacy/package.json', 'apps/web/package.json'];
const problems = [];
for (const f of files) {
  const v = JSON.parse(readFileSync(join(root, f), 'utf8')).version;
  if (v !== expected) problems.push(`${f} is ${v}`);
}
const src = readFileSync(join(root, 'packages/intestacy/src/version.ts'), 'utf8');
const constant = /VERSION = '([^']+)'/.exec(src)?.[1];
if (constant !== expected) problems.push(`packages/intestacy/src/version.ts is ${constant}`);
if (!readFileSync(join(root, 'CHANGELOG.md'), 'utf8').includes(`## [${expected}]`)) {
  problems.push(`CHANGELOG.md has no "## [${expected}]" section`);
}
if (problems.length) {
  console.error(`Version mismatch for ${expected}:\n  ${problems.join('\n  ')}`);
  console.error('Run "pnpm version:set <version>" and update CHANGELOG.md.');
  process.exit(1);
}
console.log(`All packages are at ${expected}.`);
