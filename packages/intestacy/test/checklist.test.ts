import { describe, expect, it } from 'vitest';
import { buildDocumentChecklist } from '../src/checklist.js';
import { TreeBuilder } from './helpers.js';

describe('buildDocumentChecklist', () => {
  it('lists the documents that prove the chain of title', () => {
    const t = new TreeBuilder();
    const owner = t.person('Owner', { sex: 'male', died: '2001-01-01' });
    const wife = t.person('Wife');
    t.marry(owner, wife, { startDate: '1960-01-01' });
    const ex = t.person('Ex');
    t.marry(owner, ex, { startDate: '1950-01-01', endDate: '1955-01-01', endReason: 'divorce' });
    const kid = t.child([owner, wife], 'Kid', { died: '2010-01-01' });
    const adopted = t.person('Adopted');
    t.link(kid, adopted, { kind: 'adopted' });
    const other = t.person('Other mother', { sex: 'female' });
    const nonmarital = t.child([owner, other], 'Nonmarital');
    const unknown = t.child(owner, 'Unknown', { status: 'unknown' });
    const willed = t.child(owner, 'Willed', { died: '2012-01-01' });
    t.set(willed, {
      will: { probated: true, devises: [{ personId: wife, share: '1' }], reference: 'Will Book 9' },
    });
    const noDate = t.child(owner, 'No date', { status: 'deceased' });
    void [adopted, nonmarital, unknown, noDate];

    const result = t.compute('GA', owner, {
      county: 'Greene',
      parcelId: '042-17',
      deedReference: 'Deed Book 12, p. 301',
    });
    const items = buildDocumentChecklist(t.tree, result.property, result);
    const keys = items.map((i) => i.key);
    expect(keys[0]).toBe('deed:vesting');
    expect(keys).toEqual(
      expect.arrayContaining([
        'deed:tax-plat',
        'research:later-conveyances',
        `death:${owner}`,
        `probate:search:${owner}`,
        `probate:will:${willed}`,
        `identity:${wife}`,
        'affidavit:heirship',
      ]),
    );
    const cats = new Set(items.map((i) => i.category));
    for (const c of ['marriage', 'divorce', 'adoption', 'paternity', 'research', 'identity']) {
      expect(cats.has(c as never)).toBe(true);
    }
    expect(items.find((i) => i.key === 'deed:vesting')!.reason).toContain('Greene County');
    expect(items.find((i) => i.key === 'deed:tax-plat')!.title).toContain('042-17');
    expect(keys.at(-1)).toBe('affidavit:heirship');
  });
});
