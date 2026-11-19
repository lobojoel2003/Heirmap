#!/usr/bin/env node
// Bump every package to a new version and stamp the library's VERSION constant.
//   pnpm version:set 1.1.0
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: pnpm version:set <semver>, e.g. pnpm version:set 1.1.0');
  process.exit(2);
}
for (const f of ['package.json', 'packages/intestacy/package.json', 'apps/web/package.json']) {
  const path = join(root, f);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  json.version = version;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`${f} → ${version}`);
}
const vfile = join(root, 'packages/intestacy/src/version.ts');
writeFileSync(
  vfile,
  readFileSync(vfile, 'utf8').replace(/VERSION = '[^']+'/, `VERSION = '${version}'`),
);
console.log(`packages/intestacy/src/version.ts → ${version}`);
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  console.log(
    `\nNext: add a "## [${version}] - YYYY-MM-DD" section to CHANGELOG.md, commit, then:`,
  );
  console.log(`  git tag -a v${version} -m "Heirmap v${version}" && git push origin v${version}`);
}
