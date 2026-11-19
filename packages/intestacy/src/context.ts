import { daysBetween, formatDate } from './dates.js';
import type { FamilyIndex } from './family.js';
import { Fraction } from './fraction.js';
import { describeRelationship } from './relationship.js';
import type { RuleVersion, StateRules } from './rules.js';
import type {
  Allocation,
  Citation,
  EstateResult,
  ISODate,
  Issue,
  ParentChildLink,
  Person,
  Recipient,
  RepresentationMethod,
  Union,
  UnresolvedReason,
} from './types.js';

/** Whether a relative outlived the decedent for inheritance purposes. */
export type Survival = 'survived' | 'predeceased' | 'unknown' | 'not-born';

/** Gestation window used to recognise children born after the decedent's death. */
const POSTHUMOUS_DAYS = 300;

/** A node in a line of descent below some ancestor. */
export interface LineNode {
  id: string;
  survival: Survival;
  /** Relative weight at the top level (e.g. half-blood siblings in states that halve them). */
  weight: Fraction;
  children: LineNode[];
  /** True when this person or anyone below them can take. */
  takes: boolean;
}

/** A share produced by dividing among a line of descent. */
export interface LineShare {
  to: Recipient;
  share: Fraction;
  via: string[];
  /** Generations below the ancestor (1 = child). */
  depth: number;
}

export interface SpouseInfo {
  personId: string;
  union: Union;
  survival: Survival;
}

export interface ParentInfo {
  personId: string;
  link: ParentChildLink;
  survival: Survival;
}

/**
 * Everything a {@link RuleVersion} needs to distribute one decedent's
 * interest: survival tests, the surviving spouse, lines of descent, and
 * representation arithmetic. State modules compose these helpers and attach
 * their own statute citations.
 */
export class EstateContext {
  readonly decedent: Person;
  readonly date: ISODate;
  /** Categories of relatives the distribution looked at (drives the guided builder). */
  readonly reliedOn = new Set<EstateResult['reliedOn'][number]>();

  constructor(
    readonly index: FamilyIndex,
    readonly decedentId: string,
    readonly rules: StateRules,
    readonly version: RuleVersion,
    private readonly report: (issue: Issue) => void,
  ) {
    this.decedent = index.person(decedentId);
    if (!this.decedent.deathDate) throw new Error(`${this.decedent.name} has no date of death`);
    this.date = this.decedent.deathDate;
  }

  issue(issue: Issue): void {
    this.report(issue);
  }

  name(id: string): string {
    return this.index.name(id);
  }

  // ---------------------------------------------------------------------------
  // Survival
  // ---------------------------------------------------------------------------

  /** Did `personId` outlive the decedent long enough to inherit? */
  survival(personId: string): Survival {
    if (personId === this.decedentId) return 'predeceased';
    const p = this.index.person(personId);

    if (p.birthDate && p.birthDate > this.date) {
      const gap = daysBetween(this.date, p.birthDate);
      if (gap > POSTHUMOUS_DAYS) return 'not-born';
      this.issue({
        level: 'info',
        code: 'POSTHUMOUS_HEIR',
        message: `${p.name} was born ${gap} days after ${this.decedent.name} died and is treated as living at the death (conceived before it). Confirm the dates.`,
        personIds: [p.id, this.decedentId],
      });
    }

    const exclusion = this.index.exclusionFor(personId, this.decedentId);
    if (exclusion) {
      const why =
        exclusion.reason === 'disclaimer'
          ? 'disclaimed'
          : exclusion.reason === 'slayer'
            ? 'is barred as a slayer'
            : 'is excluded';
      this.issue({
        level: 'info',
        code: 'EXCLUDED_HEIR',
        message: `${p.name} ${why} from the estate of ${this.decedent.name} and is treated as having predeceased.${exclusion.note ? ` ${exclusion.note}` : ''}`,
        personIds: [p.id, this.decedentId],
      });
      return 'predeceased';
    }

    if (p.status === 'living') return 'survived';
    if (p.status === 'unknown') return 'unknown';
    if (!p.deathDate) return 'unknown';

    const days = daysBetween(this.date, p.deathDate);
    const hours = this.version.survival.hours;
    if (hours === 0) {
      if (days > 0) return 'survived';
      if (days === 0) {
        this.issue({
          level: 'warning',
          code: 'SIMULTANEOUS_DEATH',
          message: `${p.name} and ${this.decedent.name} died on the same day. Without proof of who survived, each is treated as predeceasing the other.`,
          personIds: [p.id, this.decedentId],
          ...(this.version.survival.citation ? { citation: this.version.survival.citation } : {}),
        });
      }
      return 'predeceased';
    }

    const minDays = Math.ceil(hours / 24);
    if (days > minDays) return 'survived';
    if (days === minDays) {
      this.issue({
        level: 'warning',
        code: 'SURVIVAL_BORDERLINE',
        message: `${p.name} died ${days} days after ${this.decedent.name}. Whether ${hours} hours passed depends on the times of death; treated as surviving. Check the death certificates.`,
        personIds: [p.id, this.decedentId],
        ...(this.version.survival.citation ? { citation: this.version.survival.citation } : {}),
      });
      return 'survived';
    }
    if (days >= 0) {
      this.issue({
        level: 'info',
        code: 'SURVIVAL_PERIOD',
        message: `${p.name} died ${days === 0 ? 'the same day as' : `${days} day(s) after`} ${this.decedent.name}, short of the ${hours}-hour survival requirement, and is treated as predeceasing.`,
        personIds: [p.id, this.decedentId],
        ...(this.version.survival.citation ? { citation: this.version.survival.citation } : {}),
      });
    }
    return 'predeceased';
  }

  /** Map a person to the recipient record their share should be credited to. */
  recipientFor(personId: string, survival = this.survival(personId)): Recipient {
    if (survival === 'unknown') {
      const p = this.index.person(personId);
      const reason: UnresolvedReason =
        p.status === 'unknown'
          ? 'status-unknown'
          : p.status === 'deceased' && !p.deathDate
            ? 'death-date-missing'
            : 'survival-unknown';
      return { kind: 'unresolved', personId, reason };
    }
    return { kind: 'person', personId };
  }

  // ---------------------------------------------------------------------------
  // Spouse
  // ---------------------------------------------------------------------------

  /** The person married to the decedent at death who survived them, if any. */
  spouse(): SpouseInfo | undefined {
    this.reliedOn.add('spouse');
    const candidates: SpouseInfo[] = [];
    for (const union of this.index.unionsOf(this.decedentId)) {
      const partnerId = this.index.partnerIn(union, this.decedentId);
      if (!this.index.has(partnerId)) continue;
      const partner = this.index.person(partnerId);

      if (union.startDate && union.startDate > this.date) continue;

      if (union.endReason) {
        if (!union.endDate || union.endDate <= this.date) {
          this.issue({
            level: 'info',
            code: 'DIVORCED_SPOUSE',
            message: `${partner.name} was ${union.endReason === 'annulment' ? 'no longer married to (annulment)' : 'divorced from'} ${this.decedent.name}${union.endDate ? ` on ${formatDate(union.endDate)}` : ''} and is not a surviving spouse.`,
            personIds: [partnerId, this.decedentId],
          });
          continue;
        }
      }

      if (union.kind === 'common-law' && !this.commonLawValid(union, partner)) continue;

      const survival = this.survival(partnerId);
      if (survival === 'predeceased' || survival === 'not-born') continue;
      candidates.push({ personId: partnerId, union, survival });
    }

    if (candidates.length === 0) return undefined;
    if (candidates.length > 1) {
      this.issue({
        level: 'warning',
        code: 'MULTIPLE_SPOUSES',
        message: `${this.decedent.name} appears to have more than one spouse at death (${candidates
          .map((c) => this.name(c.personId))
          .join(
            ', ',
          )}). Record the end of earlier marriages. The most recent marriage is used for now.`,
        personIds: [this.decedentId, ...candidates.map((c) => c.personId)],
      });
      candidates.sort((a, b) => (b.union.startDate ?? '').localeCompare(a.union.startDate ?? ''));
    }
    return candidates[0];
  }

  private commonLawValid(union: Union, partner: Person): boolean {
    const cutoff = this.rules.commonLawMarriageCutoff;
    const cite = this.rules.commonLawCitation ? { citation: this.rules.commonLawCitation } : {};
    if (cutoff === null) {
      this.issue({
        level: 'warning',
        code: 'COMMON_LAW_NOT_RECOGNIZED',
        message: `${this.rules.name} does not recognize common-law marriages formed there, so ${partner.name} is not treated as ${this.decedent.name}'s spouse. A common-law marriage validly formed in another state may still count — get legal advice.`,
        personIds: [partner.id, this.decedentId],
        ...cite,
      });
      return false;
    }
    if (!union.startDate) {
      this.issue({
        level: 'warning',
        code: 'COMMON_LAW_DATE_MISSING',
        message: `Common-law marriage between ${partner.name} and ${this.decedent.name} has no start date. ${this.rules.name} recognizes only those formed before ${formatDate(cutoff)}; treated as valid.`,
        personIds: [partner.id, this.decedentId],
        ...cite,
      });
      return true;
    }
    if (union.startDate >= cutoff) {
      this.issue({
        level: 'warning',
        code: 'COMMON_LAW_AFTER_CUTOFF',
        message: `The common-law marriage between ${partner.name} and ${this.decedent.name} began after ${this.rules.name} stopped recognizing new common-law marriages (${formatDate(cutoff)}), so ${partner.name} is not treated as a spouse.`,
        personIds: [partner.id, this.decedentId],
        ...cite,
      });
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Parent / child links
  // ---------------------------------------------------------------------------

  /** Whether a parent-child link carries inheritance rights (in either direction). */
  linkInherits(link: ParentChildLink): boolean {
    const child = this.index.maybePerson(link.childId);
    const parent = this.index.maybePerson(link.parentId);
    if (!child || !parent) return false;
    switch (link.kind) {
      case 'adopted':
        return true;
      case 'step':
      case 'foster':
        return false;
      case 'biological':
        break;
    }
    if (link.adoptedAway) {
      this.issue({
        level: 'info',
        code: 'ADOPTED_AWAY',
        message: `${child.name} was adopted by another family, so inheritance between ${child.name} and birth parent ${parent.name} is cut off (stepparent adoptions can be an exception).`,
        personIds: [child.id, parent.id],
        ...(this.rules.adoptionCitation ? { citation: this.rules.adoptionCitation } : {}),
      });
      return false;
    }
    if (parent.sex === 'male' && this.bornOutsideMarriage(link)) {
      const cite = this.rules.paternityCitation ? { citation: this.rules.paternityCitation } : {};
      if (this.version.nonmaritalFromFather === 'legitimation-only') {
        this.issue({
          level: 'warning',
          code: 'NONMARITAL_BARRED',
          message: `${child.name}'s parents do not appear to have married. Under the ${this.version.title}, a child born outside marriage generally could not inherit from or through the father unless legitimated, so ${child.name} is excluded from ${parent.name}'s line. Later statutes sometimes reopened such claims — have an attorney review.`,
          personIds: [child.id, parent.id],
          ...cite,
        });
        return false;
      }
      if (link.paternityEstablished === false) {
        this.issue({
          level: 'info',
          code: 'PATERNITY_NOT_ESTABLISHED',
          message: `${child.name}'s parents were not married and paternity by ${parent.name} is marked as not established, so ${child.name} does not inherit from or through him.`,
          personIds: [child.id, parent.id],
          ...cite,
        });
        return false;
      }
      if (link.paternityEstablished === undefined) {
        this.issue({
          level: 'warning',
          code: 'PATERNITY_UNCONFIRMED',
          message: `${child.name}'s parents do not appear to have married. ${child.name} is included as ${parent.name}'s heir, but the law requires proof of paternity — record whether it was established.`,
          personIds: [child.id, parent.id],
          ...cite,
        });
      }
    }
    return true;
  }

  /** True when the child's two recorded biological parents never married each other. */
  bornOutsideMarriage(link: ParentChildLink): boolean {
    const otherParents = this.index
      .parentLinks(link.childId)
      .filter((l) => l.kind === 'biological' && l.parentId !== link.parentId);
    if (otherParents.length === 0) return false;
    return otherParents.every((other) => {
      return this.index.unionsBetween(link.parentId, other.parentId).length === 0;
    });
  }

  /** True when `descendantId` descends from `ancestorId` through inheriting links. */
  isDescendantOf(descendantId: string, ancestorId: string): boolean {
    const seen = new Set<string>();
    const stack = [descendantId];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const link of this.index.parentLinks(id)) {
        if (link.kind !== 'biological' && link.kind !== 'adopted') continue;
        if (link.parentId === ancestorId) return true;
        stack.push(link.parentId);
      }
    }
    return false;
  }

  /**
   * Whether two people are related through only one of their parents. Only
   * answers `true` when both have two recorded parents and share exactly one.
   */
  isHalfBlood(a: string, b: string): boolean {
    const pa = new Set(this.index.legalParentIds(a));
    const pb = this.index.legalParentIds(b);
    if (pa.size < 2 || pb.length < 2) return false;
    return pb.filter((p) => pa.has(p)).length === 1;
  }

  /** Every person who would actually take under these line shares. */
  takers(nodes: readonly LineNode[]): string[] {
    const out: string[] = [];
    const walk = (list: readonly LineNode[]) => {
      for (const n of list) {
        if (!n.takes) continue;
        if (n.survival === 'predeceased') walk(n.children);
        else out.push(n.id);
      }
    };
    walk(nodes);
    return out;
  }

  /** Children of `parentId` who inherit from (and through) that parent. */
  children(parentId: string): ParentChildLink[] {
    return this.index.childLinks(parentId).filter((l) => this.linkInherits(l));
  }

  /** Legal parents of `childId` through whom inheritance runs. */
  parents(childId: string = this.decedentId): ParentInfo[] {
    if (childId === this.decedentId) this.reliedOn.add('parents');
    return this.index
      .parentLinks(childId)
      .filter((l) => this.linkInherits(l))
      .map((link) => ({ personId: link.parentId, link, survival: this.survival(link.parentId) }));
  }

  // ---------------------------------------------------------------------------
  // Lines of descent
  // ---------------------------------------------------------------------------

  /** Build the line of descent below `ancestorId`, excluding the people in `exclude`. */
  line(ancestorId: string, exclude: ReadonlySet<string> = new Set([this.decedentId])): LineNode[] {
    if (ancestorId === this.decedentId) this.reliedOn.add('descendants');
    return this.childrenNodes(ancestorId, exclude, new Set([ancestorId]));
  }

  private childrenNodes(
    parentId: string,
    exclude: ReadonlySet<string>,
    path: Set<string>,
  ): LineNode[] {
    const nodes: LineNode[] = [];
    const seen = new Set<string>();
    for (const link of this.children(parentId)) {
      const id = link.childId;
      if (exclude.has(id) || path.has(id) || seen.has(id)) continue;
      seen.add(id);
      const node = this.node(id, exclude, path);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /** Build a node (and its subtree) for one person. */
  node(
    id: string,
    exclude: ReadonlySet<string> = new Set([this.decedentId]),
    path: Set<string> = new Set(),
  ): LineNode | undefined {
    const survival = this.survival(id);
    if (survival === 'not-born') return undefined;
    let children: LineNode[] = [];
    if (survival === 'predeceased') {
      path.add(id);
      children = this.childrenNodes(id, exclude, path);
      path.delete(id);
    }
    const takes = survival !== 'predeceased' || children.some((c) => c.takes);
    return { id, survival, weight: Fraction.ONE, children, takes };
  }

  /** Does anyone in these lines take? */
  anyTaker(nodes: readonly LineNode[]): boolean {
    return nodes.some((n) => n.takes);
  }

  /** Divide `share` among the lines using the given representation method. */
  divide(nodes: readonly LineNode[], share: Fraction, method: RepresentationMethod): LineShare[] {
    switch (method) {
      case 'per-stirpes':
        return this.perStirpes(nodes, share, [], 1);
      case 'per-capita-with-representation':
        return this.perCapitaWithRepresentation(nodes, share, [], 1);
      case 'per-capita-at-each-generation':
        return this.perCapitaAtEachGeneration(
          nodes.map((n) => ({ node: n, via: [] })),
          share,
          1,
        );
    }
  }

  /** Number of top-level shares the lines would be split into (e.g. "a child's share"). */
  shareCount(nodes: readonly LineNode[], method: RepresentationMethod): number {
    if (method === 'per-stirpes') return nodes.filter((n) => n.takes).length;
    return nearestGeneration(nodes.map((n) => ({ node: n, via: [] }))).length;
  }

  private terminal(node: LineNode, share: Fraction, via: string[], depth: number): LineShare {
    return { to: this.recipientFor(node.id, node.survival), share, via, depth };
  }

  private perStirpes(
    nodes: readonly LineNode[],
    share: Fraction,
    via: string[],
    depth: number,
  ): LineShare[] {
    const takers = nodes.filter((n) => n.takes);
    const totalWeight = Fraction.sum(takers.map((n) => n.weight));
    const out: LineShare[] = [];
    for (const n of takers) {
      const part = share.mul(n.weight).div(totalWeight);
      if (n.survival === 'predeceased') {
        out.push(...this.perStirpes(n.children, part, [...via, n.id], depth + 1));
      } else {
        out.push(this.terminal(n, part, via, depth));
      }
    }
    return out;
  }

  private perCapitaWithRepresentation(
    nodes: readonly LineNode[],
    share: Fraction,
    via: string[],
    depth: number,
  ): LineShare[] {
    const generation = nearestGeneration(nodes.map((n) => ({ node: n, via })));
    if (generation.length === 0) return [];
    const levelDepth = depth + (generation[0]?.levelsDown ?? 0);
    const totalWeight = Fraction.sum(generation.map((g) => g.node.weight));
    const out: LineShare[] = [];
    for (const { node, via: v } of generation) {
      const part = share.mul(node.weight).div(totalWeight);
      if (node.survival === 'predeceased') {
        out.push(
          ...this.perCapitaWithRepresentation(node.children, part, [...v, node.id], levelDepth + 1),
        );
      } else {
        out.push(this.terminal(node, part, v, levelDepth));
      }
    }
    return out;
  }

  private perCapitaAtEachGeneration(
    entries: ReadonlyArray<{ node: LineNode; via: string[] }>,
    share: Fraction,
    depth: number,
  ): LineShare[] {
    const generation = nearestGeneration(entries);
    if (generation.length === 0) return [];
    const levelDepth = depth + (generation[0]?.levelsDown ?? 0);
    const totalWeight = Fraction.sum(generation.map((g) => g.node.weight));
    const unit = share.div(totalWeight);
    const out: LineShare[] = [];
    const next: Array<{ node: LineNode; via: string[] }> = [];
    let pooled = Fraction.ZERO;
    for (const { node, via } of generation) {
      const part = unit.mul(node.weight);
      if (node.survival === 'predeceased') {
        pooled = pooled.add(part);
        for (const c of node.children) next.push({ node: c, via: [...via, node.id] });
      } else {
        out.push(this.terminal(node, part, via, levelDepth));
      }
    }
    if (pooled.isPositive()) {
      out.push(...this.perCapitaAtEachGeneration(next, pooled, levelDepth + 1));
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Collateral relatives
  // ---------------------------------------------------------------------------

  /**
   * Siblings of the decedent (children of either parent) as line nodes,
   * weighted for half blood when `halfBloodShare` is less than one.
   */
  siblingLines(halfBloodShare: Fraction = Fraction.ONE): LineNode[] {
    this.reliedOn.add('siblings');
    const parentIds = this.index.legalParentIds(this.decedentId);
    const decedentParents = new Set(
      this.index
        .parentLinks(this.decedentId)
        .filter((l) => this.linkInherits(l))
        .map((l) => l.parentId),
    );
    const siblings = new Map<string, number>();
    for (const parentId of parentIds) {
      if (!decedentParents.has(parentId)) continue;
      for (const link of this.children(parentId)) {
        if (link.childId === this.decedentId) continue;
        siblings.set(link.childId, (siblings.get(link.childId) ?? 0) + 1);
      }
    }
    const nodes: LineNode[] = [];
    for (const id of siblings.keys()) {
      const node = this.node(id, new Set([this.decedentId]), new Set([this.decedentId]));
      if (!node) continue;
      if (halfBloodShare.lt(Fraction.ONE) && this.isHalfBlood(this.decedentId, id)) {
        node.weight = halfBloodShare;
      }
      nodes.push(node);
    }
    return nodes;
  }

  /**
   * Grandparents of the decedent on the side of `parentId`, with survival.
   */
  grandparentsVia(parentId: string): ParentInfo[] {
    this.reliedOn.add('grandparents');
    return this.parents(parentId);
  }

  /**
   * Blood relatives grouped by civil-law degree of kinship (generations up to
   * the common ancestor plus generations down). Only relatives who survived
   * (or whose survival is unknown) are returned.
   */
  kindredByDegree(maxDegree = 12): Map<number, string[]> {
    this.reliedOn.add('kindred');
    const ancestors = new Map<string, number>();
    const frontier: Array<[string, number]> = [[this.decedentId, 0]];
    while (frontier.length) {
      const [id, up] = frontier.shift()!;
      if (ancestors.has(id) || up > maxDegree) continue;
      ancestors.set(id, up);
      for (const p of this.parents(id)) frontier.push([p.personId, up + 1]);
    }

    const degreeOf = new Map<string, number>();
    for (const [ancestorId, up] of ancestors) {
      const stack: Array<[string, number]> = [[ancestorId, up]];
      const seen = new Set<string>();
      while (stack.length) {
        const [id, degree] = stack.pop()!;
        if (seen.has(id) || degree > maxDegree) continue;
        seen.add(id);
        if (id !== this.decedentId) {
          const prev = degreeOf.get(id);
          if (prev === undefined || degree < prev) degreeOf.set(id, degree);
        }
        for (const link of this.children(id)) {
          if (!ancestors.has(link.childId)) stack.push([link.childId, degree + 1]);
        }
      }
    }

    const byDegree = new Map<number, string[]>();
    for (const [id, degree] of degreeOf) {
      const s = this.survival(id);
      if (s !== 'survived' && s !== 'unknown') continue;
      const list = byDegree.get(degree) ?? [];
      list.push(id);
      byDegree.set(degree, list);
    }
    return byDegree;
  }

  // ---------------------------------------------------------------------------
  // Allocation builders
  // ---------------------------------------------------------------------------

  /** Allocation for a single named recipient. */
  give(
    personId: string,
    share: Fraction,
    citations: Citation[],
    explanation: string,
    survival?: Survival,
  ): Allocation {
    return {
      to: this.recipientFor(personId, survival),
      share,
      role: describeRelationship(this.index, this.decedentId, personId),
      via: [],
      citations,
      explanation,
    };
  }

  /** Convert line shares into allocations with citations. */
  fromLines(parts: readonly LineShare[], citations: Citation[], explanation: string): Allocation[] {
    return parts.map((p) => ({
      to: p.to,
      share: p.share,
      role:
        p.to.kind === 'escheat'
          ? 'escheat'
          : describeRelationship(this.index, this.decedentId, p.to.personId),
      via: p.via,
      citations,
      explanation:
        p.via.length > 0
          ? `${explanation} Takes by representation through ${p.via.map((id) => this.name(id)).join(' → ')}, who did not survive.`
          : explanation,
    }));
  }

  /** Equal shares among a list of people (per capita). */
  equally(ids: readonly string[], share: Fraction, citations: Citation[], explanation: string) {
    return ids.map((id) => this.give(id, share.divideBy(ids.length), citations, explanation));
  }

  /** Everything to the state. */
  escheat(share: Fraction = Fraction.ONE): Allocation {
    this.issue({
      level: 'warning',
      code: 'ESCHEAT',
      message: `No heir of ${this.decedent.name} was found in the tree, so the share escheats to the State. Before relying on this, make sure every relative (including parents, siblings, aunts, uncles and cousins) has been entered.`,
      personIds: [this.decedentId],
      citation: this.rules.escheat,
    });
    return {
      to: { kind: 'escheat', state: this.rules.code },
      share,
      role: 'escheat',
      via: [],
      citations: [this.rules.escheat],
      explanation: `No heirs: the interest escheats to the State of ${this.rules.name}.`,
    };
  }
}

interface GenerationEntry {
  node: LineNode;
  via: string[];
  levelsDown: number;
}

/**
 * Walk down from `entries` to the first generation that contains a person who
 * survived (or might have). Returns only members of that generation who take.
 */
export function nearestGeneration(
  entries: ReadonlyArray<{ node: LineNode; via: string[] }>,
): GenerationEntry[] {
  let level: GenerationEntry[] = entries
    .filter((e) => e.node.takes)
    .map((e) => ({ ...e, levelsDown: 0 }));
  let levelsDown = 0;
  while (level.length > 0) {
    if (level.some((e) => e.node.survival !== 'predeceased')) return level;
    levelsDown += 1;
    const next: GenerationEntry[] = [];
    for (const e of level) {
      for (const c of e.node.children) {
        if (c.takes) next.push({ node: c, via: [...e.via, e.node.id], levelsDown });
      }
    }
    level = next;
  }
  return [];
}
