#!/usr/bin/env node
// Package build outputs into ./release for CI artifacts and GitHub releases:
//   heirmap-web-<version>.zip         static app (deploy anywhere, or open index.html)
//   heirmap-intestacy-<version>.tgz   npm tarball of the rules engine
//   build-info.json                   version, build number, commit, date
//   SHA256SUMS.txt                    checksums of the above
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'release');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const build = process.env.HEIRMAP_BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER ?? 'local';
const commit = (process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD')).slice(0, 7);

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root }).toString().trim();
  } catch {
    return 'unknown';
  }
}

const webDist = join(root, 'apps/web/dist');
const libDist = join(root, 'packages/intestacy/dist');
for (const dir of [webDist, libDist]) {
  if (!existsSync(dir)) {
    console.error(`Missing ${dir}. Run "pnpm build" first.`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Static web app.
const webZip = join(out, `heirmap-web-${version}.zip`);
execFileSync('zip', ['-qr', webZip, '.', '-x', '*.map'], { cwd: webDist, stdio: 'inherit' });

// Rules engine tarball.
execFileSync('pnpm', ['pack', '--pack-destination', out], {
  cwd: join(root, 'packages/intestacy'),
  stdio: 'inherit',
});
for (const f of readdirSync(out)) {
  if (f.endsWith('.tgz') && f !== `heirmap-intestacy-${version}.tgz`) {
    renameSync(join(out, f), join(out, `heirmap-intestacy-${version}.tgz`));
  }
}

const info = {
  name: 'heirmap',
  version,
  build,
  commit,
  semver: `${version}+${build}.${commit}`,
  date: new Date().toISOString(),
};
writeFileSync(join(out, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);

const sums = readdirSync(out)
  .filter((f) => f !== 'SHA256SUMS.txt')
  .sort()
  .map(
    (f) =>
      `${createHash('sha256')
        .update(readFileSync(join(out, f)))
        .digest('hex')}  ${f}`,
  );
writeFileSync(join(out, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);

console.log(`Packaged Heirmap ${info.semver}:`);
for (const f of readdirSync(out)) console.log(`  release/${f}`);
