#!/usr/bin/env node
// Print the CHANGELOG section for a version (default: package.json), plus build details.
//   node scripts/release-notes.mjs 1.0.0
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const version =
  process.argv[2]?.replace(/^v/, '') ??
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

const lines = changelog.split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
if (end === -1) end = lines.length;
const body = lines
  .slice(start + 1, end)
  .filter((l) => !/^\[[^\]]+\]: /.test(l))
  .join('\n')
  .trim();

const build = process.env.HEIRMAP_BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER;
const sha = process.env.GITHUB_SHA?.slice(0, 7);
const repo = process.env.GITHUB_REPOSITORY ?? 'lobojoel2003/Heirmap';

console.log(body);
console.log(`
### Downloads

| File | What it is |
|---|---|
| \`heirmap-web-${version}.zip\` | The Heirmap web app as static files. Unzip and serve the folder, or host it on any static site host. |
| \`heirmap-intestacy-${version}.tgz\` | The \`@heirmap/intestacy\` rules engine (Apache-2.0). Install with \`npm install ./heirmap-intestacy-${version}.tgz\`. |
| \`build-info.json\` | Version, build number and commit for this release. |
| \`SHA256SUMS.txt\` | SHA-256 checksums for the files above. |
${build ? `\n**Build:** \`${version}+${build}${sha ? `.${sha}` : ''}\`` : ''}

**Full changelog:** https://github.com/${repo}/blob/v${version}/CHANGELOG.md

> Heirmap is a research aid, not legal advice. Have an attorney licensed in the state where the land is located review any result.`);
