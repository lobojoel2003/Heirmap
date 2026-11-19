import { describe, expect, it } from 'vitest';
import { computeShares } from '../src/engine.js';
import { Fraction } from '../src/fraction.js';
import { TreeBuilder, issueCodes, shares } from './helpers.js';

describe('computeShares — chain of title', () => {
  it('passes the interest through successive deaths under the rules of each date', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { sex: 'male', died: '1961-03-04' });
    const wife = t.person('Wife', { sex: 'female', died: '1975-06-01' });
    t.marry(owner, wife);
    const a = t.child([owner, wife], 'A', { died: '2005-01-01' });
    const b = t.child([owner, wife], 'B');
    const aSpouse = t.person('A spouse');
    t.marry(a, aSpouse);
    const a1 = t.child(a, 'A1');
    const a2 = t.child(a, 'A2');
    const a3 = t.child(a, 'A3');

    const r = t.compute('GA', owner);
    // 1961: widow takes a child's part with 2 children → 1/3 each.
    // 1975: widow's 1/3 → A and B (1/6 each).
    // 2005 (GA-1998): A's 1/2 → spouse 1/3 floor (4 shares → 1/4 < 1/3), children 2/9 each.
    expect(shares(r)).toEqual({
      [b]: '1/2',
      [aSpouse]: '1/6',
      [a1]: '1/9',
      [a2]: '1/9',
      [a3]: '1/9',
    });
    expect(r.total.toString()).toBe('1');
    expect(r.rulesUsed.map((v) => v.id)).toEqual(['GA-1900', 'GA-1998']);
    expect(r.estates.map((e) => e.decedentId)).toEqual([owner, wife, a]);

    const a1Holding = r.holdings.find(
      (h) => h.holder.kind === 'person' && h.holder.personId === a1,
    )!;
    // Two chains: owner → A → A1, and owner → wife → A → A1.
    expect(a1Holding.paths).toHaveLength(2);
    const chain = a1Holding.paths[0]!.steps.map((s) => s.basis);
    expect(chain[0]).toBe('deed');
    expect(a1Holding.paths.every((p) => p.steps.at(-1)!.ruleVersionId === 'GA-1998')).toBe(true);
    expect(a1Holding.paths[0]!.steps.at(-1)!.citations[0]!.section).toContain('53-2-1');
  });

  it('supports an as-of date', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '1990-01-01' });
    const a = t.child(owner, 'A', { died: '2010-01-01' });
    const a1 = t.child(a, 'A1');
    expect(shares(t.compute('MS', owner, { asOf: '2000-01-01' }))).toEqual({ [a]: '1' });
    expect(shares(t.compute('MS', owner, { asOf: '1980-01-01' }))).toEqual({ [owner]: '1' });
    expect(shares(t.compute('MS', owner))).toEqual({ [a1]: '1' });
  });

  it('splits among co-owners and applies survivorship', () => {
    const t = new TreeBuilder();
    const h = t.person('Husband', { died: '1980-01-01' });
    const w = t.person('Wife', { died: '1990-01-01' });
    const kid = t.child([h, w], 'Kid');
    const other = t.child(h, 'Other child of husband');
    const common = computeShares(t.tree, {
      name: 'x',
      state: 'MS',
      owners: [{ personId: h }, { personId: w }],
    });
    expect(shares(common)).toEqual({ [kid]: '3/4', [other]: '1/4' });

    const surv = computeShares(t.tree, {
      name: 'x',
      state: 'MS',
      owners: [{ personId: h }, { personId: w }],
      tenancy: 'survivorship',
    });
    expect(shares(surv)).toEqual({ [kid]: '1' });
    const path = surv.holdings[0]!.paths.find((p) =>
      p.steps.some((s) => s.basis === 'survivorship'),
    );
    expect(path).toBeDefined();
  });

  it('honors explicit owner shares', () => {
    const t = new TreeBuilder();
    const a = t.person('A');
    const b = t.person('B');
    const r = computeShares(t.tree, {
      name: 'x',
      state: 'GA',
      owners: [
        { personId: a, share: '2/3' },
        { personId: b, share: '1/3' },
      ],
    });
    expect(shares(r)).toEqual({ [a]: '2/3', [b]: '1/3' });
  });

  it('marks unknown status and missing death dates as unresolved', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2000-01-01' });
    const a = t.child(owner, 'A', { status: 'unknown' });
    const b = t.child(owner, 'B', { status: 'deceased' });
    const c = t.child(owner, 'C');
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [`?${a}`]: '1/3', [`?${b}`]: '1/3', [c]: '1/3' });
    expect(issueCodes(r)).toContain('UNRESOLVED_SHARE');
  });

  it('flags a holder who died without a recorded date', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { status: 'deceased' });
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [`?${owner}`]: '1' });
    expect(issueCodes(r)).toContain('DEATH_DATE_NEEDED');
  });

  it('escheats when no heir is found', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2000-01-01' });
    const r = t.compute('SC', owner);
    expect(shares(r)).toEqual({ 'escheat:SC': '1' });
    expect(issueCodes(r)).toContain('ESCHEAT');
  });

  it('warns when a death predates the modeled rules', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '1950-01-01' });
    t.child(owner, 'A');
    expect(issueCodes(t.compute('NC', owner))).toContain('RULES_PREDATE');
  });
});

describe('wills', () => {
  it('follows a probated will and falls back to intestacy for the rest', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2001-01-01' });
    const a = t.child(owner, 'A');
    const b = t.child(owner, 'B');
    const friend = t.person('Friend');
    t.set(owner, {
      will: {
        probated: true,
        devises: [{ personId: friend, share: '1/2' }],
        reference: 'Will Book 3, p. 12',
      },
    });
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [friend]: '1/2', [a]: '1/4', [b]: '1/4' });
    expect(r.estates[0]!.basis).toBe('will');
    const friendStep = r.holdings
      .find((h) => h.holder.kind === 'person' && h.holder.personId === friend)!
      .paths[0]!.steps.at(-1)!;
    expect(friendStep.basis).toBe('will');
    expect(friendStep.citations[0]!.section).toBe('Will Book 3, p. 12');
  });

  it('lapses a devise to someone who predeceased', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2001-01-01' });
    const a = t.child(owner, 'A');
    const gone = t.person('Gone', { died: '2000-01-01' });
    t.set(owner, { will: { probated: true, devises: [{ personId: gone, share: '1' }] } });
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [a]: '1' });
    expect(issueCodes(r)).toContain('LAPSED_DEVISE');
  });

  it('treats an unprobated will as intestacy with a warning', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2001-01-01' });
    const a = t.child(owner, 'A');
    const friend = t.person('Friend');
    t.set(owner, { will: { probated: false, devises: [{ personId: friend, share: '1' }] } });
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [a]: '1' });
    expect(issueCodes(r)).toContain('UNPROBATED_WILL');
  });
});

describe('who counts as an heir', () => {
  it('applies a 120-hour survival rule', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2010-01-01' });
    const a = t.child(owner, 'A', { died: '2010-01-03' }); // 2 days
    const a1 = t.child(a, 'A1');
    const b = t.child(owner, 'B', { died: '2010-01-06' }); // 5 days: borderline
    const b1 = t.child(b, 'B1');
    const r = t.compute('SC', owner);
    expect(shares(r)).toEqual({ [a1]: '1/2', [b1]: '1/2' });
    expect(issueCodes(r)).toEqual(
      expect.arrayContaining(['SURVIVAL_PERIOD', 'SURVIVAL_BORDERLINE']),
    );
    // A's share went straight to A1 (A treated as predeceased); B's passed through B's estate.
    const b1Path = r.holdings.find((h) => h.holder.kind === 'person' && h.holder.personId === b1)!
      .paths[0]!;
    expect(b1Path.steps).toHaveLength(3);
  });

  it('treats same-day deaths as simultaneous where there is no 120-hour rule', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '1990-05-05' });
    const wife = t.person('Wife', { died: '1990-05-05' });
    t.marry(owner, wife);
    const kid = t.child(owner, 'Kid');
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [kid]: '1' });
    expect(issueCodes(r)).toContain('SIMULTANEOUS_DEATH');
  });

  it('excludes divorced spouses and those married after the death', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2010-01-01' });
    const ex = t.person('Ex');
    t.marry(owner, ex, { startDate: '1980-01-01', endDate: '1990-01-01', endReason: 'divorce' });
    const kid = t.child([owner, ex], 'Kid');
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [kid]: '1' });
    expect(issueCodes(r)).toContain('DIVORCED_SPOUSE');
  });

  it('warns about more than one spouse and uses the latest marriage', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2010-01-01' });
    const w1 = t.person('W1');
    const w2 = t.person('W2');
    t.marry(owner, w1, { startDate: '1970-01-01' });
    t.marry(owner, w2, { startDate: '1990-01-01' });
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [w2]: '1' });
    expect(issueCodes(r)).toContain('MULTIPLE_SPOUSES');
  });

  it('applies common-law marriage cutoffs', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2010-01-01' });
    const before = t.person('Before');
    t.marry(owner, before, { kind: 'common-law', startDate: '1990-01-01' });
    expect(shares(t.compute('GA', owner))).toEqual({ [before]: '1' });

    const t2 = new TreeBuilder();
    const o2 = t2.person('Owner', { died: '2010-01-01' });
    const after = t2.person('After');
    t2.marry(o2, after, { kind: 'common-law', startDate: '1999-01-01' });
    const sib = t2.person('Parent', { died: '1950-01-01' });
    t2.link(sib, o2);
    const bro = t2.child(sib, 'Brother');
    const r2 = t2.compute('GA', o2);
    expect(shares(r2)).toEqual({ [bro]: '1' });
    expect(issueCodes(r2)).toContain('COMMON_LAW_AFTER_CUTOFF');

    const t3 = new TreeBuilder();
    const o3 = t3.person('Owner', { died: '2010-01-01' });
    const cl = t3.person('Partner');
    t3.marry(o3, cl, { kind: 'common-law' });
    const r3 = t3.compute('NC', o3);
    expect(issueCodes(r3)).toContain('COMMON_LAW_NOT_RECOGNIZED');
    const r4 = t3.compute('GA', o3);
    expect(issueCodes(r4)).toContain('COMMON_LAW_DATE_MISSING');
  });

  it('includes adopted children and excludes step, foster and adopted-away children', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2010-01-01' });
    const adopted = t.person('Adopted');
    t.link(owner, adopted, { kind: 'adopted' });
    const step = t.person('Step');
    t.link(owner, step, { kind: 'step' });
    const foster = t.person('Foster');
    t.link(owner, foster, { kind: 'foster' });
    const away = t.person('Away');
    t.link(owner, away, { adoptedAway: true });
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [adopted]: '1' });
    expect(issueCodes(r)).toContain('ADOPTED_AWAY');
  });

  it('handles children of unmarried parents inheriting from the father', () => {
    const t = new TreeBuilder();
    const father = t.person('Father', { sex: 'male', died: '2010-01-01' });
    const mother = t.person('Mother', { sex: 'female' });
    const unknown = t.child([father, mother], 'Unknown paternity');
    const proven = t.person('Proven');
    t.link(father, proven, { paternityEstablished: true });
    t.link(mother, proven);
    const denied = t.person('Denied');
    t.link(father, denied, { paternityEstablished: false });
    t.link(mother, denied);
    const r = t.compute('GA', father);
    expect(shares(r)).toEqual({ [unknown]: '1/2', [proven]: '1/2' });
    expect(issueCodes(r)).toEqual(
      expect.arrayContaining(['PATERNITY_UNCONFIRMED', 'PATERNITY_NOT_ESTABLISHED']),
    );
  });

  it('treats disclaimants and slayers as predeceased', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2010-01-01' });
    const a = t.child(owner, 'A');
    const a1 = t.child(a, 'A1');
    const b = t.child(owner, 'B');
    t.exclude(a, owner);
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [a1]: '1/2', [b]: '1/2' });
    expect(issueCodes(r)).toContain('EXCLUDED_HEIR');
  });

  it('counts posthumous children and ignores descendants born long after the death', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '2010-01-01' });
    const posthumous = t.child(owner, 'Posthumous', { born: '2010-06-01' });
    const late = t.child(owner, 'Later', { born: '2015-01-01' });
    void late;
    const r = t.compute('GA', owner);
    expect(shares(r)).toEqual({ [posthumous]: '1' });
    expect(issueCodes(r)).toContain('POSTHUMOUS_HEIR');
  });

  it('keeps totals exact across a large family', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { died: '1940-01-01' });
    let frontier = [owner];
    let year = 1950;
    for (let gen = 0; gen < 4; gen++) {
      const next: string[] = [];
      for (const p of frontier) {
        for (let i = 0; i < 3; i++) {
          next.push(
            t.child(p, `G${gen}-${i}`, gen < 3 ? { died: `${year + gen * 15}-0${i + 1}-01` } : {}),
          );
        }
      }
      frontier = next;
      year += 1;
    }
    for (const state of ['GA', 'SC', 'NC', 'MS', 'AL'] as const) {
      const r = t.compute(state, owner);
      expect(r.total.equals(Fraction.ONE)).toBe(true);
      expect(r.holdings).toHaveLength(81);
    }
  });
});
