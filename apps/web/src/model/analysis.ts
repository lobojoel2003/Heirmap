import {
  buildDocumentChecklist,
  computeShares,
  describeRelationship,
  FamilyIndex,
  Fraction,
  recipientKey,
  type DocumentItem,
  type Holding,
  type Issue,
  type ShareResult,
} from '@heirmap/intestacy';
import type { CaseFile } from './case';

/** Categorical slots (validated light/dark pairs — see docs/design.md). */
export const SERIES = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
  { light: '#e87ba4', dark: '#d55181' },
  { light: '#008300', dark: '#0ca30c' },
  { light: '#6250d6', dark: '#9085e9' },
  { light: '#e34948', dark: '#e66767' },
] as const;

export interface Branch {
  id: string;
  label: string;
  /** Index into SERIES, or -1 for "other", -2 for unresolved, -3 for escheat. */
  slot: number;
  share: Fraction;
}

export interface Analysis {
  result: ShareResult;
  checklist: DocumentItem[];
  branches: Branch[];
  /** Recipient key → branch id. */
  branchOf: Map<string, string>;
  /** Person id → their current holding. */
  holdingOf: Map<string, Holding>;
  /** Person id → issues that mention them. */
  issuesOf: Map<string, Issue[]>;
  /** Person id → relationship to the (first) owner of record. */
  relationOf: (personId: string) => string;
  index: FamilyIndex;
  error?: string;
}

const cache = new WeakMap<CaseFile, Map<string, Analysis>>();

export function analyze(file: CaseFile, asOf?: string): Analysis {
  let byDate = cache.get(file);
  if (!byDate) {
    byDate = new Map();
    cache.set(file, byDate);
  }
  const key = asOf ?? '';
  const hit = byDate.get(key);
  if (hit) return hit;
  const value = run(file, asOf);
  byDate.set(key, value);
  return value;
}

function run(file: CaseFile, asOf?: string): Analysis {
  const index = new FamilyIndex(file.tree);
  const anchor = file.property.owners[0]?.personId;
  const relationCache = new Map<string, string>();
  const relationOf = (id: string) => {
    if (!anchor) return '';
    let r = relationCache.get(id);
    if (r === undefined) {
      r = id === anchor ? 'owner of record' : describeRelationship(index, anchor, id);
      relationCache.set(id, r);
    }
    return r;
  };

  let result: ShareResult;
  let error: string | undefined;
  try {
    result = computeShares(file.tree, file.property, asOf ? { asOf } : {});
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    result = {
      property: file.property,
      holdings: [],
      estates: [],
      issues: [
        { level: 'error', code: 'ENGINE_ERROR', message: `The calculation failed: ${error}` },
      ],
      total: Fraction.ZERO,
      rulesUsed: [],
    };
  }

  const checklist = error ? [] : buildDocumentChecklist(file.tree, file.property, result);
  const { branches, branchOf } = assignBranches(file, index, result);

  const holdingOf = new Map<string, Holding>();
  for (const h of result.holdings) {
    if (h.holder.kind !== 'escheat') holdingOf.set(h.holder.personId, h);
  }
  const issuesOf = new Map<string, Issue[]>();
  for (const issue of result.issues) {
    for (const id of issue.personIds ?? []) {
      const list = issuesOf.get(id) ?? [];
      list.push(issue);
      issuesOf.set(id, list);
    }
  }

  return {
    result,
    checklist,
    branches,
    branchOf,
    holdingOf,
    issuesOf,
    relationOf,
    index,
    ...(error ? { error } : {}),
  };
}

/**
 * Group holders into family branches: the owner's child (or other first
 * heir) through whom each share descends. Colors follow the branch in a
 * stable order (by birth), never its size.
 */
function assignBranches(file: CaseFile, index: FamilyIndex, result: ShareResult) {
  const owners = new Set(file.property.owners.map((o) => o.personId));
  const ownerChildren = new Set(
    file.tree.parentChild.filter((l) => owners.has(l.parentId)).map((l) => l.childId),
  );
  const branchOf = new Map<string, string>();
  const totals = new Map<string, Fraction>();

  for (const h of result.holdings) {
    const key = recipientKey(h.holder);
    let branchId: string;
    if (h.holder.kind === 'escheat') branchId = '__escheat';
    else if (h.holder.kind === 'unresolved') branchId = '__unresolved';
    else {
      const largest = [...h.paths].sort((a, b) => b.amount.compare(a.amount))[0];
      const recipients = (largest?.steps ?? [])
        .slice(1)
        .map((s) => (s.to.kind === 'escheat' ? undefined : s.to.personId))
        .filter((id): id is string => Boolean(id));
      branchId =
        recipients.find((id) => ownerChildren.has(id)) ?? recipients[0] ?? h.holder.personId;
    }
    branchOf.set(key, branchId);
    totals.set(branchId, (totals.get(branchId) ?? Fraction.ZERO).add(h.share));
  }

  const regular = [...totals.keys()].filter((id) => !id.startsWith('__'));
  regular.sort((a, b) => {
    const pa = index.maybePerson(a);
    const pb = index.maybePerson(b);
    return (
      (pa?.birthDate ?? '9999').localeCompare(pb?.birthDate ?? '9999') ||
      (pa?.name ?? '').localeCompare(pb?.name ?? '')
    );
  });

  const branches: Branch[] = [];
  let other = Fraction.ZERO;
  regular.forEach((id, i) => {
    if (i < SERIES.length) {
      branches.push({ id, label: `${index.name(id)} line`, slot: i, share: totals.get(id)! });
    } else {
      other = other.add(totals.get(id)!);
      branchOf.forEach((b, k) => {
        if (b === id) branchOf.set(k, '__other');
      });
    }
  });
  if (other.isPositive())
    branches.push({ id: '__other', label: 'Other lines', slot: -1, share: other });
  if (totals.has('__unresolved')) {
    branches.push({
      id: '__unresolved',
      label: 'Unresolved',
      slot: -2,
      share: totals.get('__unresolved')!,
    });
  }
  if (totals.has('__escheat')) {
    branches.push({
      id: '__escheat',
      label: 'Escheat to the State',
      slot: -3,
      share: totals.get('__escheat')!,
    });
  }
  return { branches, branchOf };
}

/** CSS color for a branch slot. Uses CSS variables so dark mode swaps in its own steps. */
export function slotColor(slot: number): string {
  if (slot >= 0) return `var(--series-${slot + 1})`;
  if (slot === -1) return 'var(--series-other)';
  if (slot === -2) return 'var(--series-unresolved)';
  return 'var(--series-escheat)';
}

export function holderLabel(analysis: Analysis, h: Holding): string {
  return h.holder.kind === 'escheat'
    ? `State of ${h.holder.state} (escheat)`
    : analysis.index.name(h.holder.personId);
}
