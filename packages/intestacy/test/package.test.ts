import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as lib from '../src/index.js';

describe('package', () => {
  it('exports a VERSION that matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(lib.VERSION).toBe(pkg.version);
  });

  it('exposes the public API', () => {
    for (const name of [
      'computeShares',
      'Fraction',
      'buildDocumentChecklist',
      'describeRelationship',
      'validateCase',
      'getStateRules',
      'STATES',
      'stateHelpers',
    ]) {
      expect(lib).toHaveProperty(name);
    }
  });
});
