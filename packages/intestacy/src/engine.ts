import { EstateContext } from './context.js';
import { formatDate } from './dates.js';
import { FamilyIndex } from './family.js';
import { Fraction } from './fraction.js';
import { describeRelationship } from './relationship.js';
import { selectVersion, versionRef, type RuleVersion, type StateRules } from './rules.js';
import { getStateRules } from './states/index.js';
import type {
  Allocation,
  Citation,
  EstateResult,
  FamilyTree,
  Holding,
  ISODate,
  Issue,
  Property,
  Recipient,
  RuleVersionRef,
  ShareResult,
  SharePath,
  TransferStep,
} from './types.js';
import { validateCase } from './validate.js';

export interface ComputeOptions {
  /** Only apply deaths on or before this date ("who owned it in 1985?"). */
  asOf?: ISODate;
  /** Override the rules module (for testing or custom jurisdictions). */
  rules?: StateRules;
}

export function recipientKey(r: Recipient): string {
  return r.kind === 'escheat' ? `escheat:${r.state}` : `${r.kind}:${r.personId}`;
}

class IssueLog {
  private readonly seen = new Map<string, Issue>();
  add = (issue: Issue): void => {
    const key = `${issue.code}|${issue.message}`;
    if (!this.seen.has(key)) this.seen.set(key, issue);
  };
  all(): Issue[] {
    const rank = { error: 0, warning: 1, info: 2 } as const;
    return [...this.seen.values()].sort((a, b) => rank[a.level] - rank[b.level]);
  }
}

interface Bucket {
  recipient: Recipient;
  paths: SharePath[];
}

/**
 * Compute who owns the property today (or `asOf` a date) by applying the
 * deed, then each owner's death — in date order — under the intestacy rules
 * in force on that date (or their probated will).
 */
export function computeShares(
  tree: FamilyTree,
  property: Property,
  options: ComputeOptions = {},
): ShareResult {
  const log = new IssueLog();
  for (const issue of validateCase(tree, property)) log.add(issue);

  const index = new FamilyIndex(tree);
  const rules = options.rules ?? getStateRules(property.state);
  for (const caveat of rules.caveats) {
    log.add({ level: 'info', code: 'STATE_CAVEAT', message: caveat });
  }

  const buckets = new Map<string, Bucket>();
  const put = (recipient: Recipient, path: SharePath) => {
    const key = recipientKey(recipient);
    const bucket = buckets.get(key);
    if (bucket) bucket.paths.push(path);
    else buckets.set(key, { recipient, paths: [path] });
  };

  // 1. Vesting deed.
  const owners = property.owners.filter((o) => index.has(o.personId));
  const deedCitation: Citation = {
    code: property.deedReference ? '' : 'Vesting',
    section: property.deedReference || 'deed',
    title: `Owner of record${property.deedDate ? ` (deed dated ${formatDate(property.deedDate)})` : ''}`,
  };
  for (const owner of owners) {
    const share =
      (owner.share !== undefined ? Fraction.tryParse(owner.share) : undefined) ??
      Fraction.of(1, owners.length);
    if (!share.isPositive()) continue;
    const to: Recipient = { kind: 'person', personId: owner.personId };
    put(to, {
      amount: share,
      steps: [
        {
          basis: 'deed',
          to,
          ...(property.deedDate ? { date: property.deedDate } : {}),
          fraction: share,
          amount: share,
          role: 'owner of record',
          via: [],
          citations: [deedCitation],
          explanation: `${index.name(owner.personId)} holds ${share.equals(Fraction.ONE) ? 'the whole property' : `a ${share.toString()} interest`} under the vesting deed.`,
        },
      ],
    });
  }
  const initialTotal = Fraction.sum(
    [...buckets.values()].flatMap((b) => b.paths.map((p) => p.amount)),
  );

  const reachedBy = (date: ISODate | undefined) =>
    date !== undefined && (!options.asOf || date <= options.asOf);

  // 2. Right of survivorship between co-owners.
  if (property.tenancy === 'survivorship' && owners.length > 1) {
    applySurvivorship(index, rules, owners, buckets, put, reachedBy, log, deedCitation);
  }

  // 3. Estates, in order of death.
  const estates = new Map<string, EstateResult>();
  const distributions = new Map<string, Distribution>();
  for (let guard = 0; guard < 10_000; guard++) {
    const next = nextDecedent(index, buckets, reachedBy);
    if (!next) break;
    const key = recipientKey({ kind: 'person', personId: next });
    const bucket = buckets.get(key)!;
    buckets.delete(key);

    let dist = distributions.get(next);
    if (!dist) {
      dist = distributeEstate(index, rules, next, log);
      distributions.set(next, dist);
    }
    const person = index.person(next);
    const interest = Fraction.sum(bucket.paths.map((p) => p.amount));
    const existing = estates.get(next);
    if (existing) {
      existing.interest = existing.interest.add(interest);
    } else {
      estates.set(next, {
        decedentId: next,
        date: person.deathDate!,
        basis: person.will?.probated ? 'will' : 'intestacy',
        ruleVersion: versionRef(rules, dist.version),
        interest,
        allocations: dist.allocations,
        reliedOn: dist.reliedOn,
      });
    }

    for (const path of bucket.paths) {
      for (const alloc of dist.allocations) {
        const amount = path.amount.mul(alloc.share);
        if (amount.isZero()) continue;
        const step: TransferStep = {
          basis: alloc.citations.some((c) => c.code === 'Will') ? 'will' : 'intestacy',
          fromId: next,
          to: alloc.to,
          date: person.deathDate!,
          fraction: alloc.share,
          amount,
          role: alloc.role,
          via: alloc.via,
          ruleVersionId: dist.version.id,
          citations: alloc.citations,
          explanation: alloc.explanation,
        };
        put(alloc.to, { amount, steps: [...path.steps, step] });
      }
    }
  }

  // 4. Holdings.
  const holdings = new Map<string, Holding>();
  for (const bucket of buckets.values()) {
    let holder = bucket.recipient;
    if (holder.kind === 'person') {
      const p = index.person(holder.personId);
      if (p.status === 'unknown') {
        holder = { kind: 'unresolved', personId: p.id, reason: 'status-unknown' };
      } else if (p.status === 'deceased' && !p.deathDate) {
        holder = { kind: 'unresolved', personId: p.id, reason: 'death-date-missing' };
        log.add({
          level: 'warning',
          code: 'DEATH_DATE_NEEDED',
          message: `${p.name} holds an interest but has no date of death, so their share cannot be passed on. Add the date from the death certificate.`,
          personIds: [p.id],
        });
      }
    }
    const key = recipientKey(holder);
    const share = Fraction.sum(bucket.paths.map((p) => p.amount));
    const existing = holdings.get(key);
    if (existing) {
      existing.share = existing.share.add(share);
      existing.paths.push(...bucket.paths);
    } else {
      holdings.set(key, { holder, share, paths: [...bucket.paths] });
    }
  }

  const sorted = [...holdings.values()].sort(
    (a, b) => b.share.compare(a.share) || holderName(index, a).localeCompare(holderName(index, b)),
  );
  for (const h of sorted) {
    if (h.holder.kind === 'unresolved') {
      const reason =
        h.holder.reason === 'status-unknown'
          ? 'it is not known whether they are living'
          : h.holder.reason === 'death-date-missing'
            ? 'their date of death is missing'
            : 'it is not known whether they outlived the person they would inherit from';
      log.add({
        level: 'warning',
        code: 'UNRESOLVED_SHARE',
        message: `${h.share.toString()} is unresolved because, for ${index.name(h.holder.personId)}, ${reason}.`,
        personIds: [h.holder.personId],
      });
    }
  }

  const total = Fraction.sum(sorted.map((h) => h.share));
  if (!total.equals(initialTotal)) {
    log.add({
      level: 'error',
      code: 'TOTAL_MISMATCH',
      message: `Internal check failed: shares add up to ${total.toString()} instead of ${initialTotal.toString()}.`,
    });
  }

  const estateList = [...estates.values()].sort((a, b) => a.date.localeCompare(b.date));
  const rulesUsed = new Map<string, RuleVersionRef>();
  for (const e of estateList) if (e.ruleVersion) rulesUsed.set(e.ruleVersion.id, e.ruleVersion);

  return {
    property,
    ...(options.asOf ? { asOf: options.asOf } : {}),
    holdings: sorted,
    estates: estateList,
    issues: log.all(),
    total,
    rulesUsed: [...rulesUsed.values()].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    ),
  };
}

function holderName(index: FamilyIndex, h: Holding): string {
  return h.holder.kind === 'escheat' ? `State of ${h.holder.state}` : index.name(h.holder.personId);
}

/** Earliest-dying person who still holds an interest. */
function nextDecedent(
  index: FamilyIndex,
  buckets: Map<string, Bucket>,
  reachedBy: (date: ISODate | undefined) => boolean,
): string | undefined {
  let best: { id: string; date: ISODate } | undefined;
  for (const bucket of buckets.values()) {
    if (bucket.recipient.kind !== 'person') continue;
    const p = index.person(bucket.recipient.personId);
    if (p.status !== 'deceased' || !reachedBy(p.deathDate)) continue;
    const date = p.deathDate!;
    if (!best || date < best.date || (date === best.date && p.id < best.id)) {
      best = { id: p.id, date };
    }
  }
  return best?.id;
}

interface Distribution {
  allocations: Allocation[];
  version: RuleVersion;
  reliedOn: EstateResult['reliedOn'];
}

function distributeEstate(
  index: FamilyIndex,
  rules: StateRules,
  decedentId: string,
  log: IssueLog,
): Distribution {
  const person = index.person(decedentId);
  const date = person.deathDate!;
  const { version, fallback } = selectVersion(rules, date);
  if (fallback) {
    log.add({
      level: 'warning',
      code: 'RULES_PREDATE',
      message: `${person.name} died on ${formatDate(date)}, before the earliest ${rules.name} rules modeled here (${version.title}, effective ${formatDate(version.effectiveFrom)}). Those rules were applied; have an attorney check the statute in force at the time.`,
      personIds: [decedentId],
    });
  }
  const ctx = new EstateContext(index, decedentId, rules, version, log.add);

  let allocations: Allocation[];
  if (person.will?.probated) {
    allocations = distributeByWill(ctx);
  } else {
    if (person.will) {
      log.add({
        level: 'warning',
        code: 'UNPROBATED_WILL',
        message: `${person.name}'s will is not marked as probated. An unprobated will generally does not pass title, so the interest is computed by intestacy. If the will has been probated, mark it as probated.`,
        personIds: [decedentId],
      });
    }
    allocations = version.distribute(ctx);
  }

  allocations = mergeAllocations(allocations);
  const sum = Fraction.sum(allocations.map((a) => a.share));
  if (!sum.equals(Fraction.ONE)) {
    throw new Error(
      `${version.id}: allocations for ${person.name} sum to ${sum.toString()} instead of 1`,
    );
  }
  return { allocations, version, reliedOn: [...ctx.reliedOn] };
}

function distributeByWill(ctx: EstateContext): Allocation[] {
  const person = ctx.decedent;
  const will = person.will!;
  const citation: Citation = {
    code: 'Will',
    section: will.reference || 'Probated will',
    title: `Last will and testament of ${person.name}`,
  };
  const out: Allocation[] = [];
  let disposed = Fraction.ZERO;
  for (const devise of will.devises) {
    const share = Fraction.tryParse(devise.share);
    if (!share || !share.isPositive() || !ctx.index.has(devise.personId)) continue;
    const survival = ctx.survival(devise.personId);
    if (survival === 'predeceased' || survival === 'not-born') {
      ctx.issue({
        level: 'warning',
        code: 'LAPSED_DEVISE',
        message: `${ctx.name(devise.personId)} did not survive ${person.name}, so the ${share.toString()} devise lapses and is computed by intestacy. An anti-lapse statute may instead give it to the devisee's descendants — have an attorney review.`,
        personIds: [devise.personId, person.id],
      });
      continue;
    }
    if (disposed.add(share).gt(Fraction.ONE)) break;
    disposed = disposed.add(share);
    out.push({
      to: ctx.recipientFor(devise.personId, survival),
      share,
      role: describeRelationship(ctx.index, person.id, devise.personId),
      via: [],
      citations: [citation],
      explanation: `Devised ${share.toString()} by the probated will of ${person.name}.`,
    });
  }
  const remainder = Fraction.ONE.sub(disposed);
  if (remainder.isPositive()) {
    const intestate = ctx.version.distribute(ctx);
    for (const a of intestate) {
      out.push({
        ...a,
        share: a.share.mul(remainder),
        explanation: `Partial intestacy (${remainder.toString()} not disposed of by the will): ${a.explanation}`,
      });
    }
  }
  return out;
}

/** Merge allocations that send shares to the same recipient on the same basis. */
function mergeAllocations(allocations: Allocation[]): Allocation[] {
  const out = new Map<string, Allocation>();
  for (const a of allocations) {
    if (a.share.isZero()) continue;
    const key = `${recipientKey(a.to)}|${a.via.join('>')}|${a.explanation}`;
    const existing = out.get(key);
    if (existing) existing.share = existing.share.add(a.share);
    else out.set(key, { ...a });
  }
  return [...out.values()];
}

function applySurvivorship(
  index: FamilyIndex,
  rules: StateRules,
  owners: Property['owners'],
  buckets: Map<string, Bucket>,
  put: (r: Recipient, p: SharePath) => void,
  reachedBy: (date: ISODate | undefined) => boolean,
  log: IssueLog,
  deedCitation: Citation,
): void {
  const alive = new Set(owners.map((o) => o.personId));
  const order = owners
    .map((o) => index.person(o.personId))
    .filter((p) => p.status === 'deceased' && reachedBy(p.deathDate))
    .sort((a, b) => a.deathDate!.localeCompare(b.deathDate!));

  for (const owner of order) {
    alive.delete(owner.id);
    const { version } = selectVersion(rules, owner.deathDate!);
    const ctx = new EstateContext(index, owner.id, rules, version, log.add);
    const survivors = [...alive].filter((id) => ctx.survival(id) === 'survived');
    if (survivors.length === 0) {
      alive.add(owner.id);
      break;
    }
    const key = recipientKey({ kind: 'person', personId: owner.id });
    const bucket = buckets.get(key);
    if (!bucket) continue;
    buckets.delete(key);
    const fraction = Fraction.of(1, survivors.length);
    for (const path of bucket.paths) {
      for (const survivorId of survivors) {
        const to: Recipient = { kind: 'person', personId: survivorId };
        const amount = path.amount.mul(fraction);
        put(to, {
          amount,
          steps: [
            ...path.steps,
            {
              basis: 'survivorship',
              fromId: owner.id,
              to,
              date: owner.deathDate!,
              fraction,
              amount,
              role: 'surviving co-owner',
              via: [],
              citations: [
                { ...deedCitation, title: 'Right of survivorship under the vesting deed' },
              ],
              explanation: `${index.name(survivorId)} takes ${owner.name}'s interest by right of survivorship, outside of probate.`,
            },
          ],
        });
      }
    }
  }
}
