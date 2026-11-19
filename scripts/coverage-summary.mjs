#!/usr/bin/env node
// Markdown coverage table for the GitHub job summary.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const rows = [];
for (const [name, dir] of [
  ['@heirmap/intestacy', 'packages/intestacy'],
  ['@heirmap/web', 'apps/web'],
]) {
  const file = join(root, dir, 'coverage/coverage-summary.json');
  if (!existsSync(file)) continue;
  const t = JSON.parse(readFileSync(file, 'utf8')).total;
  rows.push(
    `| ${name} | ${t.statements.pct}% | ${t.branches.pct}% | ${t.functions.pct}% | ${t.lines.pct}% |`,
  );
}
console.log('### Test coverage\n');
console.log('| Package | Statements | Branches | Functions | Lines |');
console.log('|---|---|---|---|---|');
console.log(rows.join('\n'));
