import { describe, expect, it } from 'vitest';
import { FamilyIndex } from '../src/family.js';
import { bloodDistance, describeRelationship } from '../src/relationship.js';
import { TreeBuilder } from './helpers.js';

function family() {
  const t = new TreeBuilder();
  const gpa = t.person('Grandpa', { sex: 'male' });
  const gma = t.person('Grandma', { sex: 'female' });
  t.marry(gpa, gma);
  const dad = t.child([gpa, gma], 'Dad', { sex: 'male' });
  const mom = t.person('Mom', { sex: 'female' });
  t.marry(dad, mom);
  const uncle = t.child([gpa, gma], 'Uncle', { sex: 'male' });
  const me = t.child([dad, mom], 'Me', { sex: 'female' });
  const bro = t.child([dad, mom], 'Brother', { sex: 'male' });
  const other = t.person('Other mom');
  const half = t.child([dad, other], 'Half sister', { sex: 'female' });
  const cousin = t.child(uncle, 'Cousin');
  const cousinKid = t.child(cousin, 'Cousin kid', { sex: 'male' });
  const son = t.child(me, 'Son', { sex: 'male' });
  const sonWife = t.person('Son wife', { sex: 'female' });
  t.marry(son, sonWife);
  const grandkid = t.child(son, 'Grandkid', { sex: 'female' });
  const ggkid = t.child(grandkid, 'Great-grandkid');
  const gggkid = t.child(ggkid, 'GGG', { sex: 'male' });
  const nephew = t.child(bro, 'Nephew', { sex: 'male' });
  const grandnephew = t.child(nephew, 'Grandnephew', { sex: 'male' });
  const husband = t.person('Husband', { sex: 'male' });
  t.marry(me, husband, { endReason: 'divorce', endDate: '2000-01-01' });
  const stepkid = t.person('Stepkid', { sex: 'male' });
  t.link(husband, stepkid);
  const fosterKid = t.person('Foster');
  t.link(me, fosterKid, { kind: 'foster' });
  const stepLinked = t.person('Step linked', { sex: 'female' });
  t.link(me, stepLinked, { kind: 'step' });
  const husbandMom = t.person('Husband mom', { sex: 'female' });
  t.link(husbandMom, husband);
  const husbandBro = t.child(husbandMom, 'Husband brother', { sex: 'male' });
  const husbandNiece = t.child(husbandBro, 'Husband niece', { sex: 'female' });
  const broWife = t.person('Brother wife', { sex: 'female' });
  t.marry(bro, broWife);
  const nephewWife = t.person('Nephew wife');
  t.marry(nephew, nephewWife);
  const stranger = t.person('Stranger');
  const index = new FamilyIndex(t.tree);
  const rel = (id: string) => describeRelationship(index, me, id);
  return {
    index,
    me,
    rel,
    ids: {
      gpa,
      gma,
      dad,
      mom,
      uncle,
      bro,
      half,
      cousin,
      cousinKid,
      son,
      sonWife,
      grandkid,
      ggkid,
      gggkid,
      nephew,
      grandnephew,
      husband,
      stepkid,
      fosterKid,
      stepLinked,
      husbandMom,
      husbandBro,
      husbandNiece,
      broWife,
      nephewWife,
      stranger,
    },
  };
}

describe('describeRelationship', () => {
  it('labels blood relatives', () => {
    const { rel, ids, me } = family();
    expect(rel(me)).toBe('self');
    expect(rel(ids.dad)).toBe('father');
    expect(rel(ids.mom)).toBe('mother');
    expect(rel(ids.gpa)).toBe('grandfather');
    expect(rel(ids.gma)).toBe('grandmother');
    expect(rel(ids.uncle)).toBe('uncle');
    expect(rel(ids.bro)).toBe('brother');
    expect(rel(ids.half)).toBe('half-sister');
    expect(rel(ids.cousin)).toBe('first cousin');
    expect(rel(ids.cousinKid)).toBe('first cousin once removed');
    expect(rel(ids.son)).toBe('son');
    expect(rel(ids.grandkid)).toBe('granddaughter');
    expect(rel(ids.ggkid)).toBe('great-grandchild');
    expect(rel(ids.gggkid)).toBe('great-great-grandson');
    expect(rel(ids.nephew)).toBe('nephew');
    expect(rel(ids.grandnephew)).toBe('grandnephew');
  });

  it('labels relatives by marriage', () => {
    const { rel, ids } = family();
    expect(rel(ids.husband)).toBe('former husband');
    expect(rel(ids.sonWife)).toBe('daughter-in-law');
    expect(rel(ids.broWife)).toBe('sister-in-law');
    expect(rel(ids.nephewWife)).toBe('spouse of nephew Nephew');
    expect(rel(ids.stepkid)).toBe('stepson');
    expect(rel(ids.stepLinked)).toBe('stepdaughter');
    expect(rel(ids.fosterKid)).toBe('foster child');
    expect(rel(ids.husbandMom)).toBe('mother-in-law');
    expect(rel(ids.husbandBro)).toBe('brother-in-law');
    expect(rel(ids.husbandNiece)).toBe('niece of spouse Husband');
    expect(rel(ids.stranger)).toBe('related by marriage');
  });

  it('measures blood distance and handles unknown ids', () => {
    const { index, me, ids } = family();
    expect(bloodDistance(index, me, ids.cousin)).toEqual({ up: 2, down: 2 });
    expect(bloodDistance(index, me, ids.stranger)).toBeUndefined();
    expect(describeRelationship(index, me, 'nope')).toBe('relative');
  });

  it('labels distant cousins and great-aunts', () => {
    const t = new TreeBuilder();
    const root = t.person('Root');
    const a = t.child(root, 'A');
    const b = t.child(root, 'B', { sex: 'female' });
    const a1 = t.child(a, 'A1');
    const a2 = t.child(a1, 'A2');
    const a3 = t.child(a2, 'A3');
    const b1 = t.child(b, 'B1');
    const b2 = t.child(b1, 'B2');
    const b3 = t.child(b2, 'B3');
    const index = new FamilyIndex(t.tree);
    expect(describeRelationship(index, a3, b3)).toBe('third cousin');
    expect(describeRelationship(index, a3, b1)).toBe('first cousin twice removed');
    expect(describeRelationship(index, a2, b)).toBe('great-aunt');
    expect(describeRelationship(index, a3, root)).toBe('great-great-grandparent');
    expect(describeRelationship(index, a, b2)).toBe('grandniece or grandnephew');
  });
});
