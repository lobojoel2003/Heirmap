import { describe, expect, it } from 'vitest';
import { selectVersion } from '../src/rules.js';
import { STATES, STATE_CODES, getStateRules, isSupportedState } from '../src/states/index.js';
import { TreeBuilder, issueCodes, shares } from './helpers.js';

/** Decedent with a spouse and `n` living children. */
function spouseAndKids(n: number, died: string, sex: 'male' | 'female' = 'male') {
  const t = new TreeBuilder();
  const d = t.person('Decedent', { sex, died });
  const s = t.person('Spouse', { sex: sex === 'male' ? 'female' : 'male' });
  t.marry(d, s);
  const kids = Array.from({ length: n }, (_, i) => t.child([d, s], `Child ${i + 1}`));
  return { t, d, s, kids };
}

/** Decedent with no spouse or descendants; living parents and siblings as requested. */
function collateral(opts: { parents: number; siblings: number; died: string }) {
  const t = new TreeBuilder();
  const mom = t.person('Mother', {
    sex: 'female',
    ...(opts.parents >= 1 ? {} : { died: '1950-01-01' }),
  });
  const dad = t.person('Father', {
    sex: 'male',
    ...(opts.parents >= 2 ? {} : { died: '1950-01-01' }),
  });
  t.marry(mom, dad);
  const d = t.child([mom, dad], 'Decedent', { died: opts.died });
  const sibs = Array.from({ length: opts.siblings }, (_, i) =>
    t.child([mom, dad], `Sibling ${i + 1}`),
  );
  return { t, d, mom, dad, sibs };
}

describe('registry', () => {
  it('lists every state and validates versions', () => {
    expect(STATE_CODES).toEqual(['AL', 'GA', 'MS', 'NC', 'SC']);
    expect(isSupportedState('GA')).toBe(true);
    expect(isSupportedState('TX')).toBe(false);
    expect(() => getStateRules('TX' as never)).toThrow();
    for (const rules of Object.values(STATES)) {
      const dates = rules.versions.map((v) => v.effectiveFrom);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(rules.versions.map((v) => v.id)).size).toBe(rules.versions.length);
      for (const v of rules.versions) {
        expect(v.summary.length).toBeGreaterThan(40);
        expect(v.sources.length).toBeGreaterThan(0);
      }
    }
  });

  it('selects the version in force on the date of death', () => {
    const ga = getStateRules('GA');
    expect(selectVersion(ga, '1997-12-31').version.id).toBe('GA-1985');
    expect(selectVersion(ga, '1998-01-01').version.id).toBe('GA-1998');
    expect(selectVersion(ga, '1985-06-30').version.id).toBe('GA-1900');
    expect(selectVersion(ga, '1899-01-01')).toMatchObject({ fallback: true });
  });
});

describe('Georgia', () => {
  it('1998+: spouse shares equally with children but takes at least one-third', () => {
    const one = spouseAndKids(1, '2010-01-01');
    expect(shares(one.t.compute('GA', one.d))).toEqual({ [one.s]: '1/2', [one.kids[0]!]: '1/2' });
    const three = spouseAndKids(3, '2010-01-01');
    const r = three.t.compute('GA', three.d);
    expect(shares(r)[three.s]).toBe('1/3');
    expect(shares(r)[three.kids[0]!]).toBe('2/9');
  });

  it("1985–1997: spouse takes a child's part, at least one-fourth", () => {
    const two = spouseAndKids(2, '1990-01-01', 'female');
    expect(shares(two.t.compute('GA', two.d))[two.s]).toBe('1/3');
    const four = spouseAndKids(4, '1990-01-01', 'female');
    expect(shares(four.t.compute('GA', four.d))[four.s]).toBe('1/4');
    const six = spouseAndKids(6, '1990-01-01');
    expect(shares(six.t.compute('GA', six.d))[six.s]).toBe('1/4');
  });

  it("before July 1985: widow takes a child's part, at least one-fifth", () => {
    const six = spouseAndKids(6, '1961-01-01');
    const r = six.t.compute('GA', six.d);
    expect(shares(r)[six.s]).toBe('1/5');
    expect(shares(r)[six.kids[0]!]).toBe('2/15');
    expect(issueCodes(r)).toContain('DOWER_ELECTION');
    // A husband inheriting from his wife: child's part with no floor, flagged.
    const h = spouseAndKids(6, '1961-01-01', 'female');
    const rh = h.t.compute('GA', h.d);
    expect(shares(rh)[h.s]).toBe('1/7');
    expect(issueCodes(rh)).toContain('RULE_NEEDS_REVIEW');
  });

  it('spouse with no descendants is the sole heir in every period', () => {
    for (const died of ['1961-01-01', '1990-01-01', '2010-01-01']) {
      const t = new TreeBuilder();
      const parent = t.person('Parent');
      const d = t.child(parent, 'D', { sex: 'male', died });
      const s = t.person('S');
      t.marry(d, s);
      expect(shares(t.compute('GA', d))).toEqual({ [s]: '1' });
    }
  });

  it('parents share with siblings before 1998 but take ahead of them after', () => {
    const old = collateral({ parents: 2, siblings: 2, died: '1990-01-01' });
    expect(shares(old.t.compute('GA', old.d))).toEqual({
      [old.mom]: '1/4',
      [old.dad]: '1/4',
      [old.sibs[0]!]: '1/4',
      [old.sibs[1]!]: '1/4',
    });
    const modern = collateral({ parents: 1, siblings: 2, died: '2010-01-01' });
    expect(shares(modern.t.compute('GA', modern.d))).toEqual({ [modern.mom]: '1' });
    const sibsOnly = collateral({ parents: 0, siblings: 2, died: '2010-01-01' });
    expect(shares(sibsOnly.t.compute('GA', sibsOnly.d))).toEqual({
      [sibsOnly.sibs[0]!]: '1/2',
      [sibsOnly.sibs[1]!]: '1/2',
    });
  });

  it('nieces and nephews take per capita when no sibling survives', () => {
    const c = collateral({ parents: 0, siblings: 0, died: '2010-01-01' });
    const s1 = c.t.child([c.mom, c.dad], 'Sib 1', { died: '2000-01-01' });
    const s2 = c.t.child([c.mom, c.dad], 'Sib 2', { died: '2001-01-01' });
    const n1 = c.t.child(s1, 'N1');
    const n2 = c.t.child(s2, 'N2');
    const n3 = c.t.child(s2, 'N3');
    expect(shares(c.t.compute('GA', c.d))).toEqual({ [n1]: '1/3', [n2]: '1/3', [n3]: '1/3' });
  });

  it('grandparents, then uncles and aunts, then first cousins, then remote kin', () => {
    const t = new TreeBuilder();
    const gp1 = t.person('Grandpa', { died: '1980-01-01' });
    const gp2 = t.person('Grandma');
    t.marry(gp1, gp2);
    const parent = t.child([gp1, gp2], 'Parent', { died: '1990-01-01' });
    const d = t.child(parent, 'D', { died: '2010-01-01' });
    const aunt = t.child([gp1, gp2], 'Aunt', { died: '2000-01-01' });
    const cousin1 = t.child(aunt, 'Cousin 1');
    const cousin2 = t.child(aunt, 'Cousin 2');
    expect(shares(t.compute('GA', d))).toEqual({ [gp2]: '1' });
    t.set(gp2, { status: 'deceased', deathDate: '2005-01-01' });
    expect(shares(t.compute('GA', d))).toEqual({ [cousin1]: '1/2', [cousin2]: '1/2' });
  });
});

describe('South Carolina', () => {
  it('1987+: spouse takes one-half with issue, all without', () => {
    const k = spouseAndKids(3, '2015-01-01');
    const r = k.t.compute('SC', k.d);
    expect(shares(r)[k.s]).toBe('1/2');
    expect(shares(r)[k.kids[0]!]).toBe('1/6');
    const t = new TreeBuilder();
    const mom = t.person('Mom');
    const d = t.child(mom, 'D', { died: '2015-01-01' });
    const s = t.person('S');
    t.marry(d, s);
    expect(shares(t.compute('SC', d))).toEqual({ [s]: '1' });
  });

  it('before 1987: widow takes one-half with one child, one-third with more', () => {
    const one = spouseAndKids(1, '1975-01-01');
    expect(shares(one.t.compute('SC', one.d))[one.s]).toBe('1/2');
    const three = spouseAndKids(3, '1975-01-01');
    const r = three.t.compute('SC', three.d);
    expect(shares(r)[three.s]).toBe('1/3');
    expect(shares(r)[three.kids[0]!]).toBe('2/9');
  });

  it('before 1987: spouse takes half and parents and siblings share the rest', () => {
    const c = collateral({ parents: 1, siblings: 1, died: '1975-01-01' });
    const s = c.t.person('Spouse');
    c.t.marry(c.d, s);
    const r = c.t.compute('SC', c.d);
    expect(shares(r)).toEqual({ [s]: '1/2', [c.mom]: '1/4', [c.sibs[0]!]: '1/4' });
    expect(issueCodes(r)).toContain('RULE_NEEDS_REVIEW');
  });

  it('parents, then issue of parents, then grandparents by halves', () => {
    const c = collateral({ parents: 2, siblings: 1, died: '2015-01-01' });
    expect(shares(c.t.compute('SC', c.d))).toEqual({ [c.mom]: '1/2', [c.dad]: '1/2' });
    const s = collateral({ parents: 0, siblings: 2, died: '2015-01-01' });
    expect(shares(s.t.compute('SC', s.d))).toEqual({ [s.sibs[0]!]: '1/2', [s.sibs[1]!]: '1/2' });

    const t = new TreeBuilder();
    const pgf = t.person('Paternal GF');
    const mgm = t.person('Maternal GM');
    const mgf = t.person('Maternal GF');
    const dad = t.child(pgf, 'Dad', { sex: 'male', died: '2000-01-01' });
    const mom = t.child([mgm, mgf], 'Mom', { sex: 'female', died: '2000-01-01' });
    const d = t.child([dad, mom], 'D', { died: '2015-01-01' });
    expect(shares(t.compute('SC', d))).toEqual({ [pgf]: '1/2', [mgm]: '1/4', [mgf]: '1/4' });
  });

  it('stepchildren take before escheat only before 2014', () => {
    const t = new TreeBuilder();
    const d = t.person('D', { died: '2010-01-01' });
    const s = t.person('Late spouse', { died: '2005-01-01' });
    t.marry(d, s);
    const stepkid = t.child(s, 'Stepchild');
    const r = t.compute('SC', d);
    expect(shares(r)).toEqual({ [stepkid]: '1' });
    t.set(d, { deathDate: '2015-01-01' });
    expect(shares(t.compute('SC', d))).toEqual({ 'escheat:SC': '1' });
  });
});

describe('North Carolina', () => {
  it('spouse takes 1/2 of land with one child, 1/3 with two or more', () => {
    const one = spouseAndKids(1, '2015-01-01');
    expect(shares(one.t.compute('NC', one.d))[one.s]).toBe('1/2');
    const two = spouseAndKids(2, '2015-01-01');
    const r = two.t.compute('NC', two.d);
    expect(shares(r)[two.s]).toBe('1/3');
    expect(shares(r)[two.kids[0]!]).toBe('1/3');
  });

  it('spouse takes 1/2 with a parent and no descendants, all otherwise', () => {
    const c = collateral({ parents: 1, siblings: 2, died: '2015-01-01' });
    const s = c.t.person('Spouse');
    c.t.marry(c.d, s);
    expect(shares(c.t.compute('NC', c.d))).toEqual({ [s]: '1/2', [c.mom]: '1/2' });
    const n = collateral({ parents: 0, siblings: 2, died: '2015-01-01' });
    const s2 = n.t.person('Spouse');
    n.t.marry(n.d, s2);
    expect(shares(n.t.compute('NC', n.d))).toEqual({ [s2]: '1' });
  });

  it('descendants take per capita at each generation', () => {
    const t = new TreeBuilder();
    const d = t.person('D', { died: '2015-01-01' });
    const a = t.child(d, 'A');
    const b = t.child(d, 'B', { died: '2000-01-01' });
    const c = t.child(d, 'C', { died: '2001-01-01' });
    const b1 = t.child(b, 'B1');
    const c1 = t.child(c, 'C1');
    const c2 = t.child(c, 'C2');
    const c3 = t.child(c, 'C3');
    expect(shares(t.compute('NC', d))).toEqual({
      [a]: '1/3',
      [b1]: '1/6',
      [c1]: '1/6',
      [c2]: '1/6',
      [c3]: '1/6',
    });
  });

  it('applies the 120-hour rule only to deaths from October 1, 2007', () => {
    for (const [died, childDied, expected] of [
      ['2000-01-01', '2000-01-03', 'through-child'],
      ['2010-01-01', '2010-01-03', 'skip-child'],
    ] as const) {
      const t = new TreeBuilder();
      const d = t.person('D', { died });
      const a = t.child(d, 'A', { died: childDied });
      const spouseOfA = t.person('Spouse of A');
      t.marry(a, spouseOfA);
      const a1 = t.child([a, spouseOfA], 'A1');
      const r = shares(t.compute('NC', d));
      if (expected === 'through-child') expect(r[spouseOfA]).toBe('1/2');
      else expect(r).toEqual({ [a1]: '1' });
    }
  });

  it('limits collateral kin to the fifth degree unless needed to avoid escheat', () => {
    const t = new TreeBuilder();
    const parent = t.person('Parent', { died: '1950-01-01' });
    const d = t.child(parent, 'D', { died: '2015-01-01' });
    let line = t.child(parent, 'Sibling', { died: '1960-01-01' });
    for (let i = 0; i < 4; i++)
      line = t.child(line, `Desc ${i}`, i < 3 ? { died: `197${i}-01-01` } : {});
    // line is now a great-great-grandniece: degree 6.
    const r = t.compute('NC', d);
    expect(shares(r)).toEqual({ [line]: '1' });
    expect(issueCodes(r)).toContain('COLLATERAL_LIMIT_LIFTED');
  });
});

describe('Mississippi', () => {
  it("spouse takes a child's part", () => {
    const three = spouseAndKids(3, '2015-01-01');
    const r = three.t.compute('MS', three.d);
    expect(shares(r)[three.s]).toBe('1/4');
    expect(shares(r)[three.kids[0]!]).toBe('1/4');
  });

  it('parents share equally with brothers and sisters', () => {
    const c = collateral({ parents: 2, siblings: 2, died: '2015-01-01' });
    expect(shares(c.t.compute('MS', c.d))).toEqual({
      [c.mom]: '1/4',
      [c.dad]: '1/4',
      [c.sibs[0]!]: '1/4',
      [c.sibs[1]!]: '1/4',
    });
  });

  it('prefers the whole blood to the half blood in the same degree', () => {
    const c = collateral({ parents: 0, siblings: 1, died: '2015-01-01' });
    const otherParent = c.t.person('Other parent');
    const half = c.t.child([c.dad, otherParent], 'Half sibling');
    const r = c.t.compute('MS', c.d);
    expect(shares(r)).toEqual({ [c.sibs[0]!]: '1' });
    expect(issueCodes(r)).toContain('WHOLE_BLOOD_PREFERRED');
    void half;
  });

  it('grandparents and uncles and aunts take equally, without representation', () => {
    const t = new TreeBuilder();
    const gp = t.person('Grandparent');
    const parent = t.child(gp, 'Parent', { died: '1990-01-01' });
    const d = t.child(parent, 'D', { died: '2015-01-01' });
    const uncle = t.child(gp, 'Uncle');
    const deadAunt = t.child(gp, 'Aunt', { died: '2000-01-01' });
    t.child(deadAunt, 'Cousin');
    expect(shares(t.compute('MS', d))).toEqual({ [gp]: '1/2', [uncle]: '1/2' });
  });

  it('before July 1, 1981 a nonmarital child could not inherit from the father', () => {
    for (const [died, inherits] of [
      ['1975-01-01', false],
      ['1990-01-01', true],
    ] as const) {
      const t = new TreeBuilder();
      const father = t.person('Father', { sex: 'male', died });
      const mother = t.person('Mother', { sex: 'female' });
      const kid = t.child([father, mother], 'Kid');
      const grandma = t.person('Grandma');
      t.link(grandma, father);
      const r = shares(t.compute('MS', father));
      expect(r[kid] === '1').toBe(inherits);
    }
  });
});

describe('Alabama', () => {
  it('1983+: spouse takes the first $50,000 plus half the balance when all issue are common', () => {
    const k = spouseAndKids(2, '2015-01-01');
    k.t.set(k.d, { estateValue: 150_000 });
    const r = k.t.compute('AL', k.d);
    expect(shares(r)[k.s]).toBe('2/3'); // (150k + 50k) / 300k
    expect(shares(r)[k.kids[0]!]).toBe('1/6');

    k.t.set(k.d, { estateValue: 40_000 });
    expect(shares(k.t.compute('AL', k.d))).toEqual({ [k.s]: '1' });

    k.t.set(k.d, { estateValue: undefined });
    const missing = k.t.compute('AL', k.d);
    expect(shares(missing)[k.s]).toBe('1/2');
    expect(issueCodes(missing)).toContain('ESTATE_VALUE_NEEDED');
  });

  it("1983+: spouse takes one-half when some issue are not the spouse's", () => {
    const k = spouseAndKids(1, '2015-01-01');
    const other = k.t.person('Former partner');
    const stepkid = k.t.child([k.d, other], 'Child of former relationship');
    const r = k.t.compute('AL', k.d);
    expect(shares(r)).toEqual({ [k.s]: '1/2', [k.kids[0]!]: '1/4', [stepkid]: '1/4' });
  });

  it('1983+: spouse with parents takes the first $100,000 plus half', () => {
    const c = collateral({ parents: 1, siblings: 0, died: '2015-01-01' });
    const s = c.t.person('Spouse');
    c.t.marry(c.d, s);
    c.t.set(c.d, { estateValue: 300_000 });
    expect(shares(c.t.compute('AL', c.d))).toEqual({ [s]: '2/3', [c.mom]: '1/3' });
  });

  it('before 1983: the widow takes no fee when descendants survive', () => {
    const k = spouseAndKids(2, '1970-01-01');
    const r = k.t.compute('AL', k.d);
    expect(shares(r)).toEqual({ [k.kids[0]!]: '1/2', [k.kids[1]!]: '1/2' });
    expect(issueCodes(r)).toContain('DOWER_LIFE_ESTATE');
  });

  it('the 1980 amendment moved the spouse ahead of collateral kin', () => {
    for (const [died, spouseTakes] of [
      ['1979-01-01', false],
      ['1981-01-01', true],
    ] as const) {
      const c = collateral({ parents: 0, siblings: 1, died });
      const s = c.t.person('Spouse');
      c.t.marry(c.d, s);
      expect(shares(c.t.compute('AL', c.d))[s] === '1').toBe(spouseTakes);
    }
  });
});
