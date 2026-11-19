import { describe, expect, it } from 'vitest';
import { EstateContext } from '../src/context.js';
import { FamilyIndex } from '../src/family.js';
import { Fraction } from '../src/fraction.js';
import { georgia } from '../src/states/ga.js';
import type { RepresentationMethod } from '../src/types.js';
import { TreeBuilder } from './helpers.js';

/**
 * Classic textbook family: the decedent's three children A, B, C.
 * Scenario 1: all children predeceased; A has 1 child, B 2, C 3.
 * Scenario 2: A survives; B (1 child) and C (3 children) predeceased.
 */
function build(aSurvives: boolean) {
  const t = new TreeBuilder();
  const d = t.person('Decedent', { died: '2000-01-01' });
  const a = t.child(d, 'A', aSurvives ? {} : { died: '1990-01-01' });
  const b = t.child(d, 'B', { died: '1991-01-01' });
  const c = t.child(d, 'C', { died: '1992-01-01' });
  const grandkids = {
    a: aSurvives ? [] : [t.child(a, 'A1')],
    b: [t.child(b, 'B1')].concat(aSurvives ? [] : [t.child(b, 'B2')]),
    c: [t.child(c, 'C1'), t.child(c, 'C2'), t.child(c, 'C3')],
  };
  const index = new FamilyIndex(t.tree);
  const ctx = new EstateContext(index, d, georgia, georgia.versions[2]!, () => {});
  const split = (method: RepresentationMethod) => {
    const parts = ctx.divide(ctx.line(d), Fraction.ONE, method);
    const out: Record<string, string> = {};
    for (const p of parts)
      if (p.to.kind !== 'escheat') out[index.name(p.to.personId)] = p.share.toString();
    return out;
  };
  return { split, a, grandkids, ctx };
}

describe('representation methods', () => {
  it('per stirpes divides at the children', () => {
    const { split } = build(false);
    expect(split('per-stirpes')).toEqual({
      A1: '1/3',
      B1: '1/6',
      B2: '1/6',
      C1: '1/9',
      C2: '1/9',
      C3: '1/9',
    });
  });

  it('per capita with representation divides at the nearest generation with a survivor', () => {
    const { split } = build(false);
    expect(split('per-capita-with-representation')).toEqual({
      A1: '1/6',
      B1: '1/6',
      B2: '1/6',
      C1: '1/6',
      C2: '1/6',
      C3: '1/6',
    });
  });

  it('per capita at each generation pools deceased shares', () => {
    const { split } = build(true);
    expect(split('per-stirpes')).toEqual({ A: '1/3', B1: '1/3', C1: '1/9', C2: '1/9', C3: '1/9' });
    expect(split('per-capita-with-representation')).toEqual({
      A: '1/3',
      B1: '1/3',
      C1: '1/9',
      C2: '1/9',
      C3: '1/9',
    });
    expect(split('per-capita-at-each-generation')).toEqual({
      A: '1/3',
      B1: '1/6',
      C1: '1/6',
      C2: '1/6',
      C3: '1/6',
    });
  });

  it('counts shares for "child\'s part" rules', () => {
    const { ctx } = build(true);
    const lines = ctx.line(ctx.decedentId);
    expect(ctx.shareCount(lines, 'per-stirpes')).toBe(3);
    expect(ctx.shareCount(lines, 'per-capita-at-each-generation')).toBe(3);
    expect(ctx.takers(lines)).toHaveLength(5);
  });

  it('records the predeceased ancestors a share passed through', () => {
    const { ctx } = build(false);
    const parts = ctx.divide(ctx.line(ctx.decedentId), Fraction.ONE, 'per-stirpes');
    const a1 = parts.find((p) => p.to.kind === 'person' && ctx.name(p.to.personId) === 'A1')!;
    expect(a1.via.map((id) => ctx.name(id))).toEqual(['A']);
    expect(a1.depth).toBe(2);
  });

  it('returns nothing when no line has a taker', () => {
    const t = new TreeBuilder();
    const d = t.person('D', { died: '2000-01-01' });
    t.child(d, 'Gone', { died: '1999-01-01' });
    const ctx = new EstateContext(
      new FamilyIndex(t.tree),
      d,
      georgia,
      georgia.versions[2]!,
      () => {},
    );
    for (const m of [
      'per-stirpes',
      'per-capita-with-representation',
      'per-capita-at-each-generation',
    ] as const) {
      expect(ctx.divide(ctx.line(d), Fraction.ONE, m)).toEqual([]);
    }
  });
});
