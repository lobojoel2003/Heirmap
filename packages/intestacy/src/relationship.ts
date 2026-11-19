import type { FamilyIndex } from './family.js';
import type { Sex } from './types.js';

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];
const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times'];

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

function gendered(sex: Sex | undefined, male: string, female: string, neutral: string): string {
  return sex === 'male' ? male : sex === 'female' ? female : neutral;
}

/** `great-`, `great-great-`, then `3rd great-` … */
function greats(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return 'great-';
  if (count === 2) return 'great-great-';
  const suffix = count === 3 ? 'rd' : 'th';
  return `${count}${suffix} great-`;
}

/** Ancestors of `id` (including itself at depth 0) through biological/adoptive links. */
function ancestorDepths(index: FamilyIndex, id: string): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: Array<[string, number]> = [[id, 0]];
  while (queue.length) {
    const [current, depth] = queue.shift()!;
    if (depths.has(current) || depth > 12) continue;
    depths.set(current, depth);
    for (const parentId of index.legalParentIds(current)) queue.push([parentId, depth + 1]);
  }
  return depths;
}

/** Generations (up from `fromId`, down to `toId`) through the nearest common ancestor. */
export function bloodDistance(
  index: FamilyIndex,
  fromId: string,
  toId: string,
): { up: number; down: number } | undefined {
  const a = ancestorDepths(index, fromId);
  const b = ancestorDepths(index, toId);
  let best: { up: number; down: number } | undefined;
  for (const [ancestor, up] of a) {
    const down = b.get(ancestor);
    if (down === undefined) continue;
    if (!best || up + down < best.up + best.down) best = { up, down };
  }
  return best;
}

function bloodLabel(index: FamilyIndex, fromId: string, toId: string): string | undefined {
  const dist = bloodDistance(index, fromId, toId);
  if (!dist) return undefined;
  const sex = index.maybePerson(toId)?.sex;
  const { up, down } = dist;
  if (up === 0 && down === 0) return 'self';
  if (up === 0) {
    if (down === 1) return gendered(sex, 'son', 'daughter', 'child');
    return greats(down - 2) + gendered(sex, 'grandson', 'granddaughter', 'grandchild');
  }
  if (down === 0) {
    if (up === 1) return gendered(sex, 'father', 'mother', 'parent');
    return greats(up - 2) + gendered(sex, 'grandfather', 'grandmother', 'grandparent');
  }
  if (up === 1 && down === 1) {
    const mine = new Set(index.legalParentIds(fromId));
    const theirs = index.legalParentIds(toId);
    const shared = theirs.filter((p) => mine.has(p)).length;
    const half = shared === 1 && mine.size >= 2 && theirs.length >= 2;
    return (half ? 'half-' : '') + gendered(sex, 'brother', 'sister', 'sibling');
  }
  if (up === 1) {
    if (down === 2) return gendered(sex, 'nephew', 'niece', 'niece or nephew');
    return (
      greats(down - 3) + gendered(sex, 'grandnephew', 'grandniece', 'grandniece or grandnephew')
    );
  }
  if (down === 1) {
    if (up === 2) return gendered(sex, 'uncle', 'aunt', 'aunt or uncle');
    return greats(up - 2) + gendered(sex, 'uncle', 'aunt', 'aunt or uncle');
  }
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  return `${ordinal(degree)} cousin${removed ? ` ${TIMES[removed] ?? `${removed} times`} removed` : ''}`;
}

function inLaw(base: string, sex: Sex | undefined): string | undefined {
  if (['son', 'daughter', 'child'].includes(base)) {
    return gendered(sex, 'son-in-law', 'daughter-in-law', 'child-in-law');
  }
  if (base.endsWith('brother') || base.endsWith('sister') || base.endsWith('sibling')) {
    return gendered(sex, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
  }
  return undefined;
}

/**
 * Plain-English relationship of `toId` to `fromId` — "granddaughter",
 * "first cousin once removed", "spouse of grandson Ben Freeman".
 */
export function describeRelationship(index: FamilyIndex, fromId: string, toId: string): string {
  if (!index.has(fromId) || !index.has(toId)) return 'relative';
  const to = index.person(toId);

  const blood = bloodLabel(index, fromId, toId);
  if (blood) return blood;

  // Direct spouse.
  const direct = index.unionsBetween(fromId, toId);
  if (direct.length > 0) {
    const divorced = direct.every((u) => u.endReason);
    const label = gendered(to.sex, 'husband', 'wife', 'spouse');
    return divorced ? `former ${label}` : label;
  }

  // Step relations.
  const stepLink = index.parentLinks(toId).find((l) => l.parentId === fromId && l.kind === 'step');
  if (stepLink) return gendered(to.sex, 'stepson', 'stepdaughter', 'stepchild');
  const fosterLink = index.parentLinks(toId).find((l) => l.parentId === fromId);
  if (fosterLink?.kind === 'foster') return 'foster child';

  // Spouse of a blood relative.
  let best: { label: string; score: number } | undefined;
  for (const union of index.unionsOf(toId)) {
    const relativeId = index.partnerIn(union, toId);
    const dist = bloodDistance(index, fromId, relativeId);
    const relLabel = bloodLabel(index, fromId, relativeId);
    if (!dist || !relLabel || relLabel === 'self') continue;
    const score = dist.up + dist.down;
    if (best && best.score <= score) continue;
    const special = inLaw(relLabel, to.sex);
    best = {
      label: special ?? `spouse of ${relLabel} ${index.name(relativeId)}`,
      score,
    };
  }
  if (best) return best.label;

  // Blood relative of the spouse.
  for (const union of index.unionsOf(fromId)) {
    const spouseId = index.partnerIn(union, fromId);
    const relLabel = bloodLabel(index, spouseId, toId);
    if (!relLabel || relLabel === 'self') continue;
    if (['son', 'daughter', 'child'].includes(relLabel)) {
      return gendered(to.sex, 'stepson', 'stepdaughter', 'stepchild');
    }
    if (['father', 'mother', 'parent'].includes(relLabel)) {
      return gendered(to.sex, 'father-in-law', 'mother-in-law', 'parent-in-law');
    }
    const special = inLaw(relLabel, to.sex);
    if (special) return special;
    return `${relLabel} of spouse ${index.name(spouseId)}`;
  }

  return 'related by marriage';
}
