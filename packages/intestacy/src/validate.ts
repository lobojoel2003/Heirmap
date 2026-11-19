import { daysBetween, isISODate } from './dates.js';
import { FamilyIndex } from './family.js';
import { Fraction } from './fraction.js';
import type { FamilyTree, Issue, Property } from './types.js';

/**
 * Structural and common-sense checks on a family tree and property record.
 * Errors make a computation unreliable; warnings are worth a second look.
 */
export function validateCase(tree: FamilyTree, property: Property): Issue[] {
  const issues: Issue[] = [];
  const index = new FamilyIndex(tree);
  const ids = new Set<string>();

  for (const p of tree.people) {
    if (ids.has(p.id)) {
      issues.push({
        level: 'error',
        code: 'DUPLICATE_ID',
        message: `Duplicate person id "${p.id}".`,
        personIds: [p.id],
      });
    }
    ids.add(p.id);
    for (const [label, value] of [
      ['birth', p.birthDate],
      ['death', p.deathDate],
    ] as const) {
      if (value !== undefined && value !== '' && !isISODate(value)) {
        issues.push({
          level: 'error',
          code: 'INVALID_DATE',
          message: `${p.name || 'A person'} has an invalid ${label} date "${value}". Use YYYY-MM-DD.`,
          personIds: [p.id],
        });
      }
    }
    if (p.status !== 'deceased' && p.deathDate) {
      issues.push({
        level: 'warning',
        code: 'DEATH_DATE_BUT_NOT_DECEASED',
        message: `${p.name} has a date of death but is not marked as deceased.`,
        personIds: [p.id],
      });
    }
    if (isISODate(p.birthDate) && isISODate(p.deathDate) && p.deathDate < p.birthDate) {
      issues.push({
        level: 'error',
        code: 'DEATH_BEFORE_BIRTH',
        message: `${p.name}'s date of death is before their date of birth.`,
        personIds: [p.id],
      });
    }
    if (p.will) {
      let total = Fraction.ZERO;
      for (const d of p.will.devises) {
        const share = Fraction.tryParse(d.share);
        if (!share || !share.isPositive()) {
          issues.push({
            level: 'error',
            code: 'INVALID_DEVISE',
            message: `${p.name}'s will has an invalid share "${d.share}".`,
            personIds: [p.id],
          });
          continue;
        }
        if (!ids.has(d.personId) && !tree.people.some((x) => x.id === d.personId)) {
          issues.push({
            level: 'error',
            code: 'UNKNOWN_DEVISEE',
            message: `${p.name}'s will names a person who is not in the tree.`,
            personIds: [p.id],
          });
        }
        total = total.add(share);
      }
      if (total.gt(Fraction.ONE)) {
        issues.push({
          level: 'error',
          code: 'DEVISES_EXCEED_WHOLE',
          message: `${p.name}'s will gives away more than the whole interest (${total.toString()}).`,
          personIds: [p.id],
        });
      }
    }
  }

  for (const link of tree.parentChild) {
    const parent = index.maybePerson(link.parentId);
    const child = index.maybePerson(link.childId);
    if (!parent || !child) {
      issues.push({
        level: 'error',
        code: 'DANGLING_LINK',
        message: 'A parent–child link points to someone who is not in the tree.',
      });
      continue;
    }
    if (parent.id === child.id) {
      issues.push({
        level: 'error',
        code: 'SELF_PARENT',
        message: `${parent.name} is recorded as their own parent.`,
        personIds: [parent.id],
      });
    }
    if (isISODate(parent.birthDate) && isISODate(child.birthDate)) {
      const years = daysBetween(parent.birthDate, child.birthDate) / 365.25;
      if (years < 10 && link.kind === 'biological') {
        issues.push({
          level: 'warning',
          code: 'IMPLAUSIBLE_PARENT_AGE',
          message: `${parent.name} would have been ${Math.max(0, Math.floor(years))} at ${child.name}'s birth. Check the dates.`,
          personIds: [parent.id, child.id],
        });
      }
    }
    if (
      link.kind === 'biological' &&
      parent.sex === 'female' &&
      isISODate(parent.deathDate) &&
      isISODate(child.birthDate) &&
      child.birthDate > parent.deathDate
    ) {
      issues.push({
        level: 'warning',
        code: 'BORN_AFTER_MOTHER_DIED',
        message: `${child.name} is recorded as born after their mother ${parent.name} died.`,
        personIds: [parent.id, child.id],
      });
    }
  }

  const parentsByChild = new Map<string, number>();
  for (const link of tree.parentChild) {
    if (link.kind !== 'biological') continue;
    parentsByChild.set(link.childId, (parentsByChild.get(link.childId) ?? 0) + 1);
  }
  for (const [childId, count] of parentsByChild) {
    if (count > 2) {
      issues.push({
        level: 'error',
        code: 'TOO_MANY_PARENTS',
        message: `${index.name(childId)} has more than two biological parents.`,
        personIds: [childId],
      });
    }
  }

  // Ancestry cycles.
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') return true;
    state.set(id, 'visiting');
    for (const link of index.childLinks(id)) {
      if (visit(link.childId)) return true;
    }
    state.set(id, 'done');
    return false;
  };
  for (const p of tree.people) {
    if (visit(p.id)) {
      issues.push({
        level: 'error',
        code: 'ANCESTRY_CYCLE',
        message: 'The tree contains a loop where someone is their own ancestor.',
      });
      break;
    }
  }

  for (const u of tree.unions) {
    const [a, b] = u.partnerIds.map((id) => index.maybePerson(id));
    if (!a || !b) {
      issues.push({
        level: 'error',
        code: 'DANGLING_UNION',
        message: 'A marriage points to someone who is not in the tree.',
      });
      continue;
    }
    if (a.id === b.id) {
      issues.push({
        level: 'error',
        code: 'SELF_UNION',
        message: `${a.name} is recorded as married to themselves.`,
        personIds: [a.id],
      });
    }
    if (u.startDate && u.endDate && u.endDate < u.startDate) {
      issues.push({
        level: 'error',
        code: 'UNION_ENDS_BEFORE_START',
        message: `The marriage of ${a.name} and ${b.name} ends before it begins.`,
        personIds: [a.id, b.id],
      });
    }
    for (const p of [a, b]) {
      if (u.startDate && isISODate(p.deathDate) && u.startDate > p.deathDate) {
        issues.push({
          level: 'error',
          code: 'MARRIED_AFTER_DEATH',
          message: `The marriage of ${a.name} and ${b.name} starts after ${p.name} died.`,
          personIds: [a.id, b.id],
        });
      }
    }
  }

  // Property.
  if (property.owners.length === 0) {
    issues.push({
      level: 'error',
      code: 'NO_OWNER',
      message: 'Choose the owner of record (the person named on the vesting deed).',
    });
  }
  let ownerTotal = Fraction.ZERO;
  let explicit = 0;
  for (const owner of property.owners) {
    if (!index.has(owner.personId)) {
      issues.push({
        level: 'error',
        code: 'UNKNOWN_OWNER',
        message: 'The owner of record is not in the family tree.',
      });
    }
    if (owner.share !== undefined) {
      const share = Fraction.tryParse(owner.share);
      if (!share || !share.isPositive()) {
        issues.push({
          level: 'error',
          code: 'INVALID_OWNER_SHARE',
          message: `Invalid owner share "${owner.share}".`,
          personIds: [owner.personId],
        });
      } else {
        explicit += 1;
        ownerTotal = ownerTotal.add(share);
      }
    }
  }
  if (explicit > 0 && explicit === property.owners.length && !ownerTotal.equals(Fraction.ONE)) {
    issues.push({
      level: 'warning',
      code: 'OWNER_SHARES_NOT_WHOLE',
      message: `Owner shares on the deed add up to ${ownerTotal.toString()}, not 1. Results show only the interests entered.`,
    });
  }
  return issues;
}
