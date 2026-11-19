import { describe, expect, it } from 'vitest';
import type { StateCode } from '../src/types.js';
import { TreeBuilder, issueCodes, shares } from './helpers.js';

/**
 * A decedent whose closest relatives are configurable, for walking each
 * state's order of heirs down to escheat.
 *
 *   ggp ─┬─ gp1 ─┬─ dad ─┬─ D
 *        │       │       └─ (siblings)
 *        │       └─ aunt ── cousin
 *        └─ great-aunt ── second-cousin-ish
 *   gm (maternal grandmother) ── mom
 */
function remote(died: string) {
  const t = new TreeBuilder();
  const ggp = t.person('Great-grandparent', { died: '1900-01-01' });
  const gp1 = t.child(ggp, 'Paternal grandparent', { died: '1940-01-01' });
  const gp2 = t.person('Paternal grandparent 2', { died: '1941-01-01' });
  t.marry(gp1, gp2);
  const greatAunt = t.child(ggp, 'Great-aunt', { sex: 'female' });
  const dad = t.child([gp1, gp2], 'Dad', { sex: 'male', died: '1960-01-01' });
  const aunt = t.child([gp1, gp2], 'Aunt', { sex: 'female', died: '1970-01-01' });
  const cousin = t.child(aunt, 'Cousin');
  const gm = t.person('Maternal grandmother', { died: '1945-01-01' });
  const mom = t.child(gm, 'Mom', { sex: 'female', died: '1965-01-01' });
  t.marry(dad, mom);
  const d = t.child([dad, mom], 'Decedent', { died, sex: 'male' });
  return { t, d, ggp, gp1, gp2, greatAunt, dad, aunt, cousin, gm, mom };
}

describe('remote kin across states', () => {
  it('Georgia (1998): first cousins when no uncle or aunt survives', () => {
    const r = remote('2010-01-01');
    expect(shares(r.t.compute('GA', r.d))).toEqual({ [r.cousin]: '1' });
    r.t.set(r.cousin, { status: 'deceased', deathDate: '2000-01-01' });
    expect(shares(r.t.compute('GA', r.d))).toEqual({ [r.greatAunt]: '1' });
    r.t.set(r.greatAunt, { status: 'deceased', deathDate: '2000-01-01' });
    expect(shares(r.t.compute('GA', r.d))).toEqual({ 'escheat:GA': '1' });
  });

  it('Georgia (before 1985): uncles/aunts and remote kin are flagged', () => {
    const r = remote('1975-01-01');
    const res = r.t.compute('GA', r.d);
    expect(shares(res)).toEqual({ [r.cousin]: '1' });
    expect(issueCodes(res)).toContain('RULE_NEEDS_REVIEW');
    r.t.set(r.cousin, { status: 'deceased', deathDate: '1974-01-01' });
    expect(shares(r.t.compute('GA', r.d))).toEqual({ [r.greatAunt]: '1' });
    r.t.set(r.greatAunt, { status: 'deceased', deathDate: '1974-01-01' });
    expect(shares(r.t.compute('GA', r.d))).toEqual({ 'escheat:GA': '1' });
    // A surviving grandparent stands next in degree.
    r.t.set(r.gm, { status: 'living', deathDate: undefined });
    expect(shares(r.t.compute('GA', r.d))).toEqual({ [r.gm]: '1' });
  });

  it("South Carolina (1987+): grandparents' issue by halves, then great-grandparents", () => {
    const r = remote('2015-01-01');
    expect(shares(r.t.compute('SC', r.d))).toEqual({ [r.cousin]: '1' });
    r.t.set(r.cousin, { status: 'deceased', deathDate: '2000-01-01' });
    expect(shares(r.t.compute('SC', r.d))).toEqual({ [r.greatAunt]: '1' });
  });

  it('South Carolina (before 1987): remote kin with and without a spouse', () => {
    const r = remote('1975-01-01');
    const res = r.t.compute('SC', r.d);
    // Cousin and great-aunt are both kin in the fourth degree.
    expect(shares(res)).toEqual({ [r.cousin]: '1/2', [r.greatAunt]: '1/2' });
    expect(issueCodes(res)).toContain('RULE_NEEDS_REVIEW');
    const s = r.t.person('Spouse');
    r.t.marry(r.d, s);
    expect(shares(r.t.compute('SC', r.d))).toEqual({
      [s]: '1/2',
      [r.cousin]: '1/4',
      [r.greatAunt]: '1/4',
    });
    for (const id of [r.cousin, r.greatAunt])
      r.t.set(id, { status: 'deceased', deathDate: '1974-01-01' });
    expect(shares(r.t.compute('SC', r.d))).toEqual({ [s]: '1' });
  });

  it('South Carolina (before 1987): no spouse, parents and siblings share; then escheat', () => {
    const t = new TreeBuilder();
    const mom = t.person('Mom', { sex: 'female' });
    const dad = t.person('Dad', { sex: 'male', died: '1960-01-01' });
    t.marry(mom, dad);
    const d = t.child([mom, dad], 'D', { died: '1975-01-01' });
    const sib = t.child([mom, dad], 'Sib');
    const other = t.person('Other');
    const half = t.child([dad, other], 'Half');
    const r = t.compute('SC', d);
    expect(shares(r)).toEqual({ [mom]: '1/3', [sib]: '1/3', [half]: '1/3' });
    expect(issueCodes(r)).toContain('RULE_NEEDS_REVIEW');
    const lone = new TreeBuilder();
    const x = lone.person('Alone', { died: '1975-01-01' });
    expect(shares(lone.compute('SC', x))).toEqual({ 'escheat:SC': '1' });
  });

  it('North Carolina: uncles, aunts and cousins on a side with no grandparent', () => {
    const r = remote('2015-01-01');
    expect(shares(r.t.compute('NC', r.d))).toEqual({ [r.cousin]: '1' });
    r.t.set(r.cousin, { status: 'deceased', deathDate: '2000-01-01' });
    // The great-aunt is a descendant of a great-grandparent, beyond § 29-15's tiers.
    expect(shares(r.t.compute('NC', r.d))).toEqual({ 'escheat:NC': '1' });
  });

  it('Mississippi: next of kin by degree, then escheat', () => {
    const r = remote('2015-01-01');
    // Uncle/aunt dead, no representation → next of kin in equal degree: cousin (4th) vs great-aunt (4th).
    expect(shares(r.t.compute('MS', r.d))).toEqual({ [r.cousin]: '1/2', [r.greatAunt]: '1/2' });
    for (const id of [r.cousin, r.greatAunt])
      r.t.set(id, { status: 'deceased', deathDate: '2000-01-01' });
    expect(shares(r.t.compute('MS', r.d))).toEqual({ 'escheat:MS': '1' });
  });

  it('Mississippi: flags the grandparents/uncles/aunts step before 1953 and half-blood issues', () => {
    const r = remote('1950-01-01');
    r.t.set(r.dad, { deathDate: '1948-01-01' });
    r.t.set(r.mom, { deathDate: '1949-01-01' });
    r.t.set(r.aunt, { status: 'living', deathDate: undefined });
    const res = r.t.compute('MS', r.d);
    expect(shares(res)).toEqual({ [r.aunt]: '1' });
    expect(issueCodes(res)).toContain('RULE_NEEDS_REVIEW');

    const halfAunt = r.t.child([r.gp1, r.t.person('Other grandparent')], 'Half aunt');
    r.t.set(r.d, { deathDate: '2015-01-01' });
    const res2 = r.t.compute('MS', r.d);
    expect(shares(res2)).toEqual({ [r.aunt]: '1' });
    expect(issueCodes(res2)).toContain('WHOLE_BLOOD_PREFERRED');
    void halfAunt;
  });

  it('Mississippi: a parent with half-blood siblings is flagged', () => {
    const t = new TreeBuilder();
    const mom = t.person('Mom');
    const dad = t.person('Dad', { died: '1990-01-01' });
    t.marry(mom, dad);
    const d = t.child([mom, dad], 'D', { died: '2015-01-01' });
    const half = t.child([dad, t.person('Other')], 'Half');
    const r = t.compute('MS', d);
    expect(shares(r)).toEqual({ [mom]: '1/2', [half]: '1/2' });
    expect(issueCodes(r)).toContain('RULE_NEEDS_REVIEW');
  });

  it("Alabama (1983+): siblings, then grandparents' issue, then escheat", () => {
    const r = remote('2015-01-01');
    expect(shares(r.t.compute('AL', r.d))).toEqual({ [r.cousin]: '1' });
    const sib = r.t.child([r.dad, r.mom], 'Sibling');
    expect(shares(r.t.compute('AL', r.d))).toEqual({ [sib]: '1' });
    r.t.set(sib, { status: 'deceased', deathDate: '2000-01-01' });
    r.t.set(r.cousin, { status: 'deceased', deathDate: '2000-01-01' });
    expect(shares(r.t.compute('AL', r.d))).toEqual({ 'escheat:AL': '1' });
  });

  it('Alabama (1983+): spouse takes all with no issue or parent', () => {
    const r = remote('2015-01-01');
    const s = r.t.person('Spouse');
    r.t.marry(r.d, s);
    expect(shares(r.t.compute('AL', r.d))).toEqual({ [s]: '1' });
  });

  it('Alabama (before 1980): collateral order ends with the spouse', () => {
    const r = remote('1975-01-01');
    const s = r.t.person('Spouse');
    r.t.marry(r.d, s);
    const res = r.t.compute('AL', r.d);
    expect(issueCodes(res)).toContain('RULE_NEEDS_REVIEW');
    expect(Object.keys(shares(res))).not.toContain(s);
    for (const id of [r.cousin, r.greatAunt])
      r.t.set(id, { status: 'deceased', deathDate: '1970-01-01' });
    expect(shares(r.t.compute('AL', r.d))).toEqual({ [s]: '1' });
    r.t.set(s, { status: 'deceased', deathDate: '1974-01-01' });
    expect(shares(r.t.compute('AL', r.d))).toEqual({ 'escheat:AL': '1' });
  });

  it('Alabama (before 1980): parents, then siblings', () => {
    const r = remote('1975-01-01');
    r.t.set(r.mom, { status: 'living', deathDate: undefined });
    expect(shares(r.t.compute('AL', r.d))).toEqual({ [r.mom]: '1' });
    r.t.set(r.mom, { status: 'deceased', deathDate: '1965-01-01' });
    const sib = r.t.child([r.dad, r.mom], 'Sibling');
    expect(shares(r.t.compute('AL', r.d))).toEqual({ [sib]: '1' });
  });

  it('every state warns when only one parent is recorded at the grandparent step', () => {
    const t = new TreeBuilder();
    const gp = t.person('GP');
    const parent = t.child(gp, 'Parent', { died: '1990-01-01' });
    const d = t.child(parent, 'D', { died: '2015-01-01' });
    for (const s of ['SC', 'NC', 'AL'] as StateCode[]) {
      const r = t.compute(s, d);
      expect(shares(r)).toEqual({ [gp]: '1' });
      expect(issueCodes(r)).toContain('ONE_PARENT_RECORDED');
    }
  });
});

describe('older Georgia edge cases', () => {
  it('flags pre-1932 half-blood siblings and parents sharing with nieces', () => {
    const t = new TreeBuilder();
    const mom = t.person('Mom', { sex: 'female' });
    const dad = t.person('Dad', { sex: 'male', died: '1920-01-01' });
    t.marry(mom, dad);
    const d = t.child([mom, dad], 'D', { died: '1925-01-01' });
    const half = t.child([dad, t.person('Other')], 'Half');
    const r = t.compute('GA', d);
    expect(shares(r)).toEqual({ [mom]: '1/2', [half]: '1/2' });
    expect(issueCodes(r)).toContain('RULE_NEEDS_REVIEW');

    t.set(half, { status: 'deceased', deathDate: '1924-01-01' });
    const niece = t.child(half, 'Niece');
    const r2 = t.compute('GA', d);
    expect(shares(r2)).toEqual({ [mom]: '1/2', [niece]: '1/2' });
  });

  it("flags the widow's share when the decedent's sex is unknown", () => {
    const t = new TreeBuilder();
    const d = t.person('D', { died: '1970-01-01' });
    const s = t.person('S');
    t.marry(d, s);
    t.child([d, s], 'K');
    expect(issueCodes(t.compute('GA', d))).toContain('RULE_NEEDS_REVIEW');
  });
});
