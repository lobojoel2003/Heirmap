import { describe, expect, it } from 'vitest';
import { validateCase } from '../src/validate.js';
import type { FamilyTree, Property } from '../src/types.js';

const prop = (owners: Property['owners']): Property => ({ name: 'x', state: 'GA', owners });

describe('validateCase', () => {
  it('accepts a clean tree', () => {
    const tree: FamilyTree = {
      people: [
        {
          id: 'a',
          name: 'A',
          status: 'deceased',
          deathDate: '2000-01-01',
          birthDate: '1920-01-01',
        },
        { id: 'b', name: 'B', status: 'living', birthDate: '1950-01-01' },
      ],
      parentChild: [{ id: 'l', parentId: 'a', childId: 'b', kind: 'biological' }],
      unions: [],
    };
    expect(validateCase(tree, prop([{ personId: 'a' }]))).toEqual([]);
  });

  it('reports structural and date problems', () => {
    const tree: FamilyTree = {
      people: [
        { id: 'a', name: 'A', status: 'living', deathDate: '2000-01-01', birthDate: '2001-01-01' },
        { id: 'a', name: 'Dup', status: 'living' },
        { id: 'b', name: 'B', status: 'deceased', deathDate: '2000-02-30' },
        { id: 'c', name: 'C', status: 'living', birthDate: '1995-01-01' },
        {
          id: 'm',
          name: 'M',
          sex: 'female',
          status: 'deceased',
          deathDate: '1990-01-01',
          birthDate: '1960-01-01',
        },
        { id: 'k', name: 'K', status: 'living', birthDate: '1991-06-01' },
        { id: 'x', name: 'X', status: 'living' },
        { id: 'y', name: 'Y', status: 'living' },
        { id: 'z', name: 'Z', status: 'living' },
        {
          id: 'w',
          name: 'W',
          status: 'deceased',
          deathDate: '2001-01-01',
          will: {
            probated: true,
            devises: [
              { personId: 'c', share: 'abc' },
              { personId: 'ghost', share: '3/2' },
            ],
          },
        },
      ],
      parentChild: [
        { id: 'l1', parentId: 'a', childId: 'ghost', kind: 'biological' },
        { id: 'l2', parentId: 'c', childId: 'c', kind: 'biological' },
        { id: 'l3', parentId: 'a', childId: 'c', kind: 'biological' },
        { id: 'l4', parentId: 'm', childId: 'k', kind: 'biological' },
        { id: 'l5', parentId: 'x', childId: 'z', kind: 'biological' },
        { id: 'l6', parentId: 'y', childId: 'z', kind: 'biological' },
        { id: 'l7', parentId: 'm', childId: 'z', kind: 'biological' },
        { id: 'l8', parentId: 'z', childId: 'x', kind: 'biological' },
      ],
      unions: [
        { id: 'u1', partnerIds: ['a', 'ghost'], kind: 'marriage' },
        { id: 'u2', partnerIds: ['c', 'c'], kind: 'marriage' },
        {
          id: 'u3',
          partnerIds: ['m', 'k'],
          kind: 'marriage',
          startDate: '1995-01-01',
          endDate: '1994-01-01',
        },
      ],
    };
    const codes = validateCase(tree, prop([{ personId: 'nobody', share: 'x' }])).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'DUPLICATE_ID',
        'INVALID_DATE',
        'DEATH_DATE_BUT_NOT_DECEASED',
        'DEATH_BEFORE_BIRTH',
        'INVALID_DEVISE',
        'UNKNOWN_DEVISEE',
        'DEVISES_EXCEED_WHOLE',
        'DANGLING_LINK',
        'SELF_PARENT',
        'IMPLAUSIBLE_PARENT_AGE',
        'BORN_AFTER_MOTHER_DIED',
        'TOO_MANY_PARENTS',
        'ANCESTRY_CYCLE',
        'DANGLING_UNION',
        'SELF_UNION',
        'UNION_ENDS_BEFORE_START',
        'MARRIED_AFTER_DEATH',
        'UNKNOWN_OWNER',
        'INVALID_OWNER_SHARE',
      ]),
    );
  });

  it('requires an owner and checks explicit shares add up', () => {
    const tree: FamilyTree = {
      people: [
        { id: 'a', name: 'A', status: 'living' },
        { id: 'b', name: 'B', status: 'living' },
      ],
      parentChild: [],
      unions: [],
    };
    expect(validateCase(tree, prop([])).map((i) => i.code)).toContain('NO_OWNER');
    expect(
      validateCase(
        tree,
        prop([
          { personId: 'a', share: '1/2' },
          { personId: 'b', share: '1/3' },
        ]),
      ).map((i) => i.code),
    ).toContain('OWNER_SHARES_NOT_WHOLE');
  });
});
