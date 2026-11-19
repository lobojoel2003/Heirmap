import { beforeEach, describe, expect, it } from 'vitest';
import { sampleCase } from '../model/sample';
import { useStore } from './store';

const get = () => useStore.getState();
const active = () => get().cases[get().activeId!]!;

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    cases: {},
    activeId: null,
    selectedId: null,
    history: { past: [], future: [] },
    report: null,
    asOf: null,
  });
});

describe('store', () => {
  it('creates a case and builds a family with undo and redo', () => {
    get().createCase({
      title: 'Test',
      state: 'GA',
      ownerName: 'Owner',
      ownerDeathDate: '2000-01-01',
    });
    const owner = active().property.owners[0]!.personId;
    expect(get().selectedId).toBe(owner);

    const spouse = get().addSpouse(owner, { name: 'Spouse' });
    const child = get().addChild([owner, spouse], { name: 'Kid' });
    expect(active().tree.unions).toHaveLength(1);
    expect(active().tree.parentChild.filter((l) => l.childId === child)).toHaveLength(2);
    expect(get().selectedId).toBe(child);

    const sibling = get().addSibling(child);
    expect(sibling).toBeTruthy();
    expect(active().tree.parentChild.filter((l) => l.childId === sibling)).toHaveLength(2);
    expect(get().addSibling(owner)).toBeNull();

    const p1 = get().addParent(owner, { name: 'Dad' });
    get().addParent(owner, { name: 'Mom' });
    expect(active().tree.unions.some((u) => u.partnerIds.includes(p1))).toBe(true);

    const count = active().tree.people.length;
    get().undo();
    expect(active().tree.people.length).toBe(count - 1);
    get().redo();
    expect(active().tree.people.length).toBe(count);

    get().updatePerson(child, { status: 'deceased', deathDate: '2010-01-01', notes: undefined });
    expect(active().tree.people.find((p) => p.id === child)).toMatchObject({
      status: 'deceased',
      deathDate: '2010-01-01',
    });
    get().updatePerson(child, { status: 'living' });
    expect(active().tree.people.find((p) => p.id === child)!.deathDate).toBeUndefined();

    get().removePerson(spouse);
    expect(active().tree.unions).toHaveLength(1); // Dad + Mom
    expect(active().tree.parentChild.some((l) => l.parentId === spouse)).toBe(false);
  });

  it('edits unions, links and documents', () => {
    get().loadSample();
    get().updateUnion('u_ruth_samuel', { endReason: 'divorce', endDate: '1980-01-01' });
    expect(active().tree.unions.find((u) => u.id === 'u_ruth_samuel')).toMatchObject({
      endReason: 'divorce',
    });
    get().updateUnion('u_ruth_samuel', { endReason: undefined, endDate: undefined });
    expect(active().tree.unions.find((u) => u.id === 'u_ruth_samuel')!.endReason).toBeUndefined();
    get().removeUnion('u_ruth_samuel');
    expect(active().tree.unions.some((u) => u.id === 'u_ruth_samuel')).toBe(false);

    get().updateLink('l_lucius_calvin', { paternityEstablished: true });
    expect(
      active().tree.parentChild.find((l) => l.id === 'l_lucius_calvin')!.paternityEstablished,
    ).toBe(true);
    get().updateLink('l_lucius_calvin', { paternityEstablished: undefined });
    expect(
      'paternityEstablished' in active().tree.parentChild.find((l) => l.id === 'l_lucius_calvin')!,
    ).toBe(false);
    get().removeLink('l_lucius_calvin');
    get().linkParent('calvin', 'lucius');
    get().linkParent('calvin', 'lucius');
    expect(
      active().tree.parentChild.filter((l) => l.childId === 'calvin' && l.parentId === 'lucius'),
    ).toHaveLength(1);

    get().setDocument('death:hattie', { status: 'obtained' });
    expect(active().documents['death:hattie']!.status).toBe('obtained');
    get().renameCase('Renamed');
    expect(active().title).toBe('Renamed');
  });

  it('imports, opens and deletes cases', () => {
    const first = get().importCase(sampleCase());
    const second = get().importCase(sampleCase());
    expect(first.id).not.toBe(second.id);
    expect(Object.keys(get().cases)).toHaveLength(2);
    get().openCase(first.id);
    expect(get().activeId).toBe(first.id);
    get().deleteCase(first.id);
    expect(get().activeId).toBeNull();
    expect(Object.keys(get().cases)).toHaveLength(1);
    get().edit(() => {
      throw new Error('should not run without an active case');
    });
  });

  it('tracks UI state', () => {
    get().loadSample();
    get().select('ruth', 'name');
    expect(get()).toMatchObject({ selectedId: 'ruth', focusField: 'name', tab: 'person' });
    get().setTab('law');
    get().setReport('chart');
    get().setAsOf('1960-01-01');
    get().setPropertyOpen(true);
    get().setDirection('TB');
    expect(get()).toMatchObject({
      tab: 'law',
      report: 'chart',
      asOf: '1960-01-01',
      propertyOpen: true,
      direction: 'TB',
    });
    get().removePerson('ruth');
    expect(get().selectedId).toBeNull();
  });
});
