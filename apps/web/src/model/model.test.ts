import { Fraction } from '@heirmap/intestacy';
import { describe, expect, it } from 'vitest';
import { analyze, slotColor } from './analysis';
import { lifespan, newCase, parseCaseFile, CaseFormatError } from './case';
import {
  caseJSON,
  checklistCSV,
  checklistMarkdown,
  familyChartSVG,
  sharesCSV,
  slug,
  toCSV,
} from './exporters';
import { generations, guideProgress, guideSteps } from './guide';
import { layoutFamily } from './layout';
import { sampleCase } from './sample';

describe('sample case', () => {
  it('computes exact shares that add up to the whole', () => {
    const a = analyze(sampleCase());
    expect(a.error).toBeUndefined();
    expect(a.result.total.equals(Fraction.ONE)).toBe(true);
    const byName = Object.fromEntries(
      a.result.holdings.map((h) => [
        h.holder.kind === 'escheat' ? 'escheat' : a.index.name(h.holder.personId),
        h.share.toString(),
      ]),
    );
    expect(byName).toMatchObject({
      'Gloria Brooks': '1/4',
      'Thomas Daniels': '1/8',
      'Henry Wright': '1/24',
      'Lorraine Freeman': '1/15',
      'Denise Freeman': '11/180',
      'Ronald Freeman': '7/72',
      'Calvin Freeman': '1/18',
    });
    expect(a.result.rulesUsed.map((r) => r.id)).toEqual(['GA-1900', 'GA-1985', 'GA-1998']);
  });

  it('groups heirs into stable family branches', () => {
    const a = analyze(sampleCase());
    expect(a.branches.map((b) => b.label)).toEqual([
      'Ruth Freeman Daniels line',
      'Lucius Freeman line',
      'Lena Freeman Brooks line',
      'James "J.T." Freeman Jr. line',
      'Unresolved',
    ]);
    expect(Fraction.sum(a.branches.map((b) => b.share)).equals(Fraction.ONE)).toBe(true);
    expect(slotColor(0)).toBe('var(--series-1)');
    expect(slotColor(-1)).toBe('var(--series-other)');
    expect(slotColor(-2)).toBe('var(--series-unresolved)');
    expect(slotColor(-3)).toBe('var(--series-escheat)');
    expect(a.relationOf('elijah')).toBe('owner of record');
    expect(a.relationOf('gloria')).toBe('granddaughter');
  });

  it('caches by case and as-of date', () => {
    const file = sampleCase();
    expect(analyze(file)).toBe(analyze(file));
    const past = analyze(file, '1960-01-01');
    expect(past).not.toBe(analyze(file));
    expect(
      past.result.holdings.map((h) => (h.holder.kind === 'escheat' ? '' : h.holder.personId)),
    ).toContain('hattie');
  });

  it('reports engine failures instead of throwing', () => {
    const file = sampleCase();
    file.property.state = 'ZZ' as never;
    const a = analyze(file);
    expect(a.error).toBeTruthy();
    expect(a.result.issues[0]!.code).toBe('ENGINE_ERROR');
  });
});

describe('case files', () => {
  it('creates a new case around the owner of record', () => {
    const c = newCase({
      title: '  ',
      state: 'MS',
      ownerName: 'Ada Lee',
      ownerDeathDate: '1980-02-02',
      ownerSex: 'female',
      county: 'Holmes',
    });
    expect(c.title).toBe('Ada Lee property');
    expect(c.tree.people[0]).toMatchObject({
      name: 'Ada Lee',
      status: 'deceased',
      deathDate: '1980-02-02',
      sex: 'female',
    });
    expect(c.property.owners[0]!.personId).toBe(c.tree.people[0]!.id);
    const blank = newCase({ title: 'X', state: 'GA', ownerName: '' });
    expect(blank.tree.people[0]!.status).toBe('unknown');
  });

  it('round-trips through JSON and rejects bad files', () => {
    const file = sampleCase();
    expect(parseCaseFile(JSON.parse(caseJSON(file)))).toEqual(file);
    expect(() => parseCaseFile(null)).toThrow(CaseFormatError);
    expect(() => parseCaseFile({ schema: 2 })).toThrow(/unsupported version/);
    expect(() => parseCaseFile({ ...file, property: { ...file.property, state: 'TX' } })).toThrow(
      /Unsupported state/,
    );
    const badDate = structuredClone(file);
    badDate.tree.people[0]!.deathDate = '1958-13-45';
    expect(() => parseCaseFile(badDate)).toThrow(/invalid date/);
    const noId = { ...file, id: undefined, documents: undefined, createdAt: undefined };
    const parsed = parseCaseFile(noId);
    expect(parsed.id).toMatch(/^case_/);
    expect(parsed.documents).toEqual({});
  });

  it('formats lifespans', () => {
    expect(
      lifespan({
        id: 'a',
        name: 'A',
        status: 'deceased',
        birthDate: '1900-01-01',
        deathDate: '1950-01-01',
      }),
    ).toBe('1900–1950');
    expect(lifespan({ id: 'a', name: 'A', status: 'deceased', deathDate: '1950-01-01' })).toBe(
      'd. 1950',
    );
    expect(lifespan({ id: 'a', name: 'A', status: 'living', birthDate: '1990-01-01' })).toBe(
      'b. 1990',
    );
    expect(lifespan({ id: 'a', name: 'A', status: 'deceased', birthDate: '1990-01-01' })).toBe(
      '1990–?',
    );
    expect(lifespan({ id: 'a', name: 'A', status: 'deceased' })).toBe('deceased');
    expect(lifespan({ id: 'a', name: 'A', status: 'living' })).toBe('');
  });
});

describe('layout', () => {
  it('places every person and connects children through family nodes', () => {
    const file = sampleCase();
    for (const dir of ['LR', 'TB'] as const) {
      const layout = layoutFamily(file.tree, dir);
      expect(layout.direction).toBe(dir);
      expect(layout.people).toHaveLength(file.tree.people.length);
      expect(layout.width).toBeGreaterThan(0);
      // James had a son with no recorded mother: a single-parent connector.
      expect(layout.unions.some((u) => u.id === 'solo:james' && u.solo)).toBe(true);
      // Lucius and Ida Mae Carter never married: a co-parent connector.
      expect(layout.unions.some((u) => u.id.startsWith('coparent:') && !u.union)).toBe(true);
      expect(layout.edges.filter((e) => e.kind === 'child')).toHaveLength(18);
    }
    const lr = layoutFamily(file.tree, 'LR');
    const x = (id: string) => lr.people.find((p) => p.id === id)!.x;
    expect(x('elijah')).toBeLessThan(x('ruth'));
    expect(x('ruth')).toBeLessThan(x('clara'));
    expect(x('clara')).toBeLessThan(x('angela'));
    expect(x('ruth')).toBe(x('samuel'));
  });
});

describe('guide', () => {
  it('asks only the open questions for the sample', () => {
    const file = sampleCase();
    const steps = guideSteps(file, analyze(file));
    expect(steps.map((s) => s.id)).toEqual([
      'children:lucius',
      'status:thomas',
      'paternity:l_lucius_calvin',
    ]);
    const progress = guideProgress(file, steps);
    expect(progress.total).toBe(progress.done + 3);
    expect(generations(file, ['elijah']).get('angela')).toBe(3);
  });

  it('starts a new case with the land and the owner’s death', () => {
    const file = newCase({ title: 'T', state: 'GA', ownerName: 'Owner' });
    const steps = guideSteps(file, analyze(file));
    expect(steps.map((s) => s.id)).toEqual(['property', expect.stringMatching(/^owner-death:/)]);
  });

  it('walks the estates and asks about collateral heirs and estate values', () => {
    const file = newCase({
      title: 'T',
      state: 'AL',
      ownerName: 'Owner',
      ownerDeathDate: '2015-01-01',
      county: 'Dallas',
      parcelId: '1',
    });
    const owner = file.tree.people[0]!;
    file.tree.people.push(
      { id: 'mom', name: 'Mom', status: 'living' },
      { id: 'sp', name: 'Spouse', status: 'living' },
    );
    file.tree.parentChild.push({
      id: 'l1',
      parentId: 'mom',
      childId: owner.id,
      kind: 'biological',
    });
    file.tree.unions.push({ id: 'u1', partnerIds: [owner.id, 'sp'], kind: 'marriage' });
    const ids = guideSteps(file, analyze(file)).map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        `spouse:${owner.id}`,
        `children:${owner.id}`,
        `parents:${owner.id}`,
        `siblings:${owner.id}`,
        `estate-value:${owner.id}`,
      ]),
    );
    owner.status = 'deceased';
    delete owner.deathDate;
    const missing = guideSteps(file, analyze(structuredClone(file))).map((s) => s.id);
    // The owner's missing date of death is asked once, not twice.
    expect(missing).toContain(`owner-death:${owner.id}`);
    expect(missing).not.toContain(`death-date:${owner.id}`);

    // A non-owner heir who died without a recorded date gets their own question.
    const kid = { id: 'kid', name: 'Kid', status: 'deceased' as const };
    const withKid = structuredClone(file);
    withKid.tree.people[0]!.deathDate = '2015-01-01';
    withKid.tree.people.push(kid);
    withKid.tree.parentChild.push({
      id: 'l2',
      parentId: owner.id,
      childId: 'kid',
      kind: 'biological',
    });
    expect(guideSteps(withKid, analyze(withKid)).map((st) => st.id)).toContain('death-date:kid');
  });
});

describe('exporters', () => {
  it('escapes CSV and builds slugs', () => {
    expect(toCSV([['a,b', 'say "hi"', 'plain'], ['x\ny']])).toBe(
      '"a,b","say ""hi""",plain\n"x\ny"\n',
    );
    expect(slug('Freeman home place (sample)!')).toBe('freeman-home-place-sample');
    expect(slug('***')).toBe('heirmap');
  });

  it('exports shares, the checklist and the chart', () => {
    const file = sampleCase();
    const a = analyze(file);
    const csv = sharesCSV(file, a);
    expect(csv.split('\n')[0]).toContain('Share (x/360)');
    expect(csv).toContain('Gloria Brooks,granddaughter,Living,1/4,90/360,25.0000%');
    expect(csv).toContain('O.C.G.A. § 53-2-1(c)(1)');
    const list = checklistCSV(file, a);
    expect(list).toContain('Obtained');
    expect(list.split('\n').length).toBeGreaterThan(20);
    const md = checklistMarkdown(file, a);
    expect(md).toMatch(/^# Document checklist — Freeman home place/);
    expect(md).toContain('- [x] **Vesting deed into Elijah Freeman**');
    const svg = familyChartSVG(file, a, layoutFamily(file.tree));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Owner of record');
    expect(svg).toContain('Holds 1/8 (unresolved)');
    expect(svg).toContain('James &#34;J.T.&#34; Freeman Jr.');
    const tb = familyChartSVG(file, a, layoutFamily(file.tree, 'TB'));
    expect(tb).toContain(' V');
  });
});
