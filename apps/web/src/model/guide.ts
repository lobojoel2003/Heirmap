import { formatDate, type Person } from '@heirmap/intestacy';
import type { Analysis } from './analysis';
import type { CaseFile } from './case';

export type GuideAction =
  | { kind: 'add-spouse'; personId: string }
  | { kind: 'add-child'; personId: string }
  | { kind: 'add-parent'; personId: string }
  | { kind: 'add-sibling'; personId: string }
  | { kind: 'confirm'; personId: string; field: 'spouses' | 'children' | 'parents' | 'siblings' }
  | { kind: 'set-status'; personId: string; status: Person['status'] }
  | { kind: 'select'; personId: string; focus?: string }
  | { kind: 'paternity'; linkId: string; value: boolean | undefined }
  | { kind: 'edit-property' };

export interface GuideStep {
  id: string;
  /** Generation of the person relative to the owner of record (0 = owner). */
  generation: number;
  personId?: string;
  title: string;
  detail: string;
  actions: Array<{ label: string; action: GuideAction; primary?: boolean }>;
}

/**
 * The guided builder: walk the family forward from the owner of record, one
 * estate at a time, asking only the questions the calculation depends on.
 */
export function guideSteps(file: CaseFile, analysis: Analysis): GuideStep[] {
  const steps: GuideStep[] = [];
  const { index, result } = analysis;
  const owners = file.property.owners.map((o) => o.personId);
  const generation = generations(file, owners);

  if (!file.property.county || !file.property.parcelId) {
    steps.push({
      id: 'property',
      generation: -1,
      title: 'Describe the land',
      detail:
        'Add the county and parcel number from the tax bill or deed so the family chart and checklist identify the property.',
      actions: [{ label: 'Edit property', action: { kind: 'edit-property' }, primary: true }],
    });
  }

  for (const ownerId of owners) {
    const owner = index.maybePerson(ownerId);
    if (!owner) continue;
    if (owner.status !== 'deceased' || !owner.deathDate) {
      steps.push({
        id: `owner-death:${owner.id}`,
        generation: 0,
        personId: owner.id,
        title: `When did ${owner.name} die?`,
        detail:
          'The date of death on the death certificate decides which version of the intestacy statute applies.',
        actions: [
          {
            label: 'Enter date of death',
            action: { kind: 'select', personId: owner.id, focus: 'deathDate' },
            primary: true,
          },
          {
            label: 'Still living',
            action: { kind: 'set-status', personId: owner.id, status: 'living' },
          },
        ],
      });
    }
  }

  for (const estate of result.estates) {
    const d = index.person(estate.decedentId);
    const gen = generation.get(d.id) ?? 0;
    const when = formatDate(d.deathDate);
    const c = d.confirmed ?? {};
    if (!c.spouses) {
      steps.push({
        id: `spouse:${d.id}`,
        generation: gen,
        personId: d.id,
        title: `Was ${d.name} married when they died on ${when}?`,
        detail: 'Include common-law marriages and marriages that ended in divorce, with the dates.',
        actions: [
          { label: 'Add spouse', action: { kind: 'add-spouse', personId: d.id }, primary: true },
          {
            label: 'All marriages entered',
            action: { kind: 'confirm', personId: d.id, field: 'spouses' },
          },
        ],
      });
    }
    if (!c.children) {
      steps.push({
        id: `children:${d.id}`,
        generation: gen,
        personId: d.id,
        title: `Did ${d.name} have children?`,
        detail:
          'Include adopted children, children born outside marriage, and children who died before them (their descendants may inherit).',
        actions: [
          { label: 'Add child', action: { kind: 'add-child', personId: d.id }, primary: true },
          {
            label: 'All children entered',
            action: { kind: 'confirm', personId: d.id, field: 'children' },
          },
        ],
      });
    }
    const collateral = estate.reliedOn.some((r) =>
      ['parents', 'siblings', 'grandparents', 'kindred'].includes(r),
    );
    if (collateral && !c.parents) {
      steps.push({
        id: `parents:${d.id}`,
        generation: gen,
        personId: d.id,
        title: `Who were ${d.name}'s parents?`,
        detail: `${d.name} left no descendants${estate.reliedOn.includes('spouse') ? ' or spouse' : ''}, so the share passes to parents, brothers and sisters, or more distant kin.`,
        actions: [
          { label: 'Add parent', action: { kind: 'add-parent', personId: d.id }, primary: true },
          {
            label: 'Both parents entered',
            action: { kind: 'confirm', personId: d.id, field: 'parents' },
          },
        ],
      });
    }
    if (collateral && !c.siblings && index.legalParentIds(d.id).length > 0) {
      steps.push({
        id: `siblings:${d.id}`,
        generation: gen,
        personId: d.id,
        title: `Did ${d.name} have brothers or sisters?`,
        detail: 'Include half-brothers and half-sisters, and siblings who died earlier.',
        actions: [
          { label: 'Add sibling', action: { kind: 'add-sibling', personId: d.id }, primary: true },
          {
            label: 'All siblings entered',
            action: { kind: 'confirm', personId: d.id, field: 'siblings' },
          },
        ],
      });
    }
  }

  for (const h of result.holdings) {
    const holder = h.holder;
    if (holder.kind !== 'unresolved') continue;
    if (steps.some((st) => st.id === `owner-death:${holder.personId}`)) continue;
    const p = index.person(holder.personId);
    const gen = generation.get(p.id) ?? 0;
    if (p.status === 'unknown') {
      steps.push({
        id: `status:${p.id}`,
        generation: gen,
        personId: p.id,
        title: `Is ${p.name} living?`,
        detail: `${p.name}'s ${h.share.toString()} share cannot be assigned until we know.`,
        actions: [
          {
            label: 'Living',
            action: { kind: 'set-status', personId: p.id, status: 'living' },
            primary: true,
          },
          { label: 'Deceased', action: { kind: 'select', personId: p.id, focus: 'deathDate' } },
        ],
      });
    } else if (p.status === 'deceased' && !p.deathDate) {
      steps.push({
        id: `death-date:${p.id}`,
        generation: gen,
        personId: p.id,
        title: `When did ${p.name} die?`,
        detail: 'The date decides who survived whom and which statute applies.',
        actions: [
          {
            label: 'Enter date of death',
            action: { kind: 'select', personId: p.id, focus: 'deathDate' },
            primary: true,
          },
        ],
      });
    }
  }

  for (const issue of result.issues) {
    const [childId, fatherId] = issue.personIds ?? [];
    if (issue.code === 'PATERNITY_UNCONFIRMED' && childId && fatherId) {
      const link = file.tree.parentChild.find(
        (l) => l.childId === childId && l.parentId === fatherId,
      );
      if (!link) continue;
      steps.push({
        id: `paternity:${link.id}`,
        generation: generation.get(childId) ?? 0,
        personId: childId,
        title: `Was ${index.name(fatherId)}'s paternity of ${index.name(childId)} legally established?`,
        detail:
          'For example a legitimation or paternity order, a sworn acknowledgment, or the father signing the birth certificate. A child of unmarried parents inherits from the father only with proof.',
        actions: [
          {
            label: 'Yes, established',
            action: { kind: 'paternity', linkId: link.id, value: true },
            primary: true,
          },
          { label: 'No', action: { kind: 'paternity', linkId: link.id, value: false } },
        ],
      });
    }
    if (issue.code === 'ESTATE_VALUE_NEEDED' && childId) {
      steps.push({
        id: `estate-value:${childId}`,
        generation: generation.get(childId) ?? 0,
        personId: childId,
        title: `What was ${index.name(childId)}'s estate worth?`,
        detail:
          'The spouse’s share includes a dollar amount, so the fraction depends on the net value of the whole estate.',
        actions: [
          {
            label: 'Enter estate value',
            action: { kind: 'select', personId: childId, focus: 'estateValue' },
            primary: true,
          },
        ],
      });
    }
  }

  const seen = new Set<string>();
  return steps
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .sort((a, b) => a.generation - b.generation);
}

/** Generations below the owner(s) of record, following parent→child and marriage links. */
export function generations(file: CaseFile, roots: string[]): Map<string, number> {
  const gen = new Map<string, number>();
  const queue: Array<[string, number]> = roots.map((r) => [r, 0]);
  while (queue.length) {
    const [id, g] = queue.shift()!;
    if (gen.has(id)) continue;
    gen.set(id, g);
    for (const l of file.tree.parentChild) {
      if (l.parentId === id) queue.push([l.childId, g + 1]);
      if (l.childId === id) queue.push([l.parentId, g - 1]);
    }
    for (const u of file.tree.unions) {
      if (u.partnerIds.includes(id)) {
        const other = u.partnerIds[0] === id ? u.partnerIds[1] : u.partnerIds[0];
        queue.push([other, g]);
      }
    }
  }
  return gen;
}

/** How many questions the guide has answered vs. would still ask. */
export function guideProgress(file: CaseFile, steps: GuideStep[]): { done: number; total: number } {
  let done = 0;
  for (const p of file.tree.people) {
    const c = p.confirmed ?? {};
    done += [c.spouses, c.children, c.parents, c.siblings].filter(Boolean).length;
  }
  return { done, total: done + steps.length };
}
