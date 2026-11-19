import type { EstateContext, LineNode } from '../context.js';
import { Fraction } from '../fraction.js';
import type { Allocation, Citation, RepresentationMethod } from '../types.js';

/** Build a citation factory for one code. */
export function citer(code: string, url: (section: string) => string | undefined) {
  return (section: string, title: string, quote?: string): Citation => {
    const base = section.replace(/^§\s*/, '').replace(/\(.*$/, '');
    const link = url(base);
    return {
      code,
      section: section.startsWith('§') ? section : `§ ${section}`,
      title,
      ...(link ? { url: link } : {}),
      ...(quote ? { quote } : {}),
    };
  };
}

/** Divide `share` among the decedent's descendants. Returns `[]` if none can take. */
export function toDescendants(
  ctx: EstateContext,
  share: Fraction,
  method: RepresentationMethod,
  citations: Citation[],
  explanation: string,
  lines: LineNode[] = ctx.line(ctx.decedentId),
): Allocation[] {
  if (!ctx.anyTaker(lines)) return [];
  return ctx.fromLines(ctx.divide(lines, share, method), citations, explanation);
}

/** Divide among an arbitrary set of lines (siblings, aunts and uncles …). */
export function toLines(
  ctx: EstateContext,
  lines: LineNode[],
  share: Fraction,
  method: RepresentationMethod,
  citations: Citation[],
  explanation: string,
): Allocation[] {
  if (!ctx.anyTaker(lines)) return [];
  return ctx.fromLines(ctx.divide(lines, share, method), citations, explanation);
}

/** Parents who survived (or whose survival is unknown). */
export function survivingParents(ctx: EstateContext) {
  return ctx.parents().filter((p) => p.survival === 'survived' || p.survival === 'unknown');
}

/**
 * Next of kin in the nearest degree (civil-law count), sharing equally. Used
 * as the last step before escheat in several states.
 */
export function nextOfKin(
  ctx: EstateContext,
  share: Fraction,
  citations: Citation[],
  minDegree = 1,
  maxDegree = 12,
): Allocation[] {
  const byDegree = ctx.kindredByDegree(maxDegree);
  const degrees = [...byDegree.keys()].filter((d) => d >= minDegree).sort((a, b) => a - b);
  const nearest = degrees[0];
  if (nearest === undefined) return [];
  const ids = byDegree.get(nearest)!;
  return ctx.equally(
    ids,
    share,
    citations,
    `Nearest kindred: relatives in the ${ordinalDegree(nearest)} degree share equally.`,
  );
}

function ordinalDegree(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

/** Remove descendants deeper than `maxDepth` below the top of each line (1 = the line's head). */
export function pruneDepth(lines: readonly LineNode[], maxDepth: number, depth = 1): LineNode[] {
  if (depth > maxDepth) return [];
  return lines.map((n) => {
    const children = pruneDepth(n.children, maxDepth, depth + 1);
    const takes = n.survival !== 'predeceased' || children.some((c) => c.takes);
    return { ...n, children, takes };
  });
}

/** Ancestors exactly `levels` generations above `personId` (1 = parents). */
export function ancestorsAbove(ctx: EstateContext, personId: string, levels: number): string[] {
  let frontier = [personId];
  for (let i = 0; i < levels; i++) {
    const next = new Set<string>();
    for (const id of frontier) for (const p of ctx.parents(id)) next.add(p.personId);
    frontier = [...next];
  }
  return frontier;
}

/**
 * Lines descending from the given ancestors (who must themselves have
 * predeceased), de-duplicated, excluding the decedent.
 */
export function linesBelow(ctx: EstateContext, ancestorIds: readonly string[]): LineNode[] {
  const exclude = new Set([ctx.decedentId]);
  const out = new Map<string, LineNode>();
  for (const a of ancestorIds) {
    for (const link of ctx.children(a)) {
      if (exclude.has(link.childId) || out.has(link.childId)) continue;
      const node = ctx.node(link.childId, exclude, new Set([a]));
      if (node) out.set(link.childId, node);
    }
  }
  return [...out.values()];
}

/**
 * One half to each side of the family (the decedent's two parents), at the
 * ancestor generation `levels` above the parents (1 = grandparents,
 * 2 = great-grandparents). On each side the surviving ancestors take equally;
 * if none survive, the ancestors' descendants take by `method`. A side with no
 * taker gives way to the other side.
 */
export function sideHalves(
  ctx: EstateContext,
  share: Fraction,
  levels: number,
  method: RepresentationMethod,
  citeAncestors: Citation[],
  citeIssue: Citation[],
  label = levels === 1 ? 'grandparents' : levels === 2 ? 'great-grandparents' : 'ancestors',
  prune?: number,
): Allocation[] {
  const sides = ctx.parents().map((p) => p.personId);
  if (sides.length === 1) {
    ctx.issue({
      level: 'warning',
      code: 'ONE_PARENT_RECORDED',
      message: `Only one parent of ${ctx.decedent.name} is recorded. Relatives on the other side of the family may be entitled to half — add the other parent if known.`,
      personIds: [ctx.decedentId],
    });
  }
  const perSide: Allocation[][] = [];
  for (const parentId of sides) {
    const ancestors = ancestorsAbove(ctx, parentId, levels);
    const alive = ancestors.filter((id) => {
      const s = ctx.survival(id);
      return s === 'survived' || s === 'unknown';
    });
    if (alive.length > 0) {
      perSide.push(
        ctx.equally(
          alive,
          Fraction.ONE,
          citeAncestors,
          `The ${label} on ${ctx.name(parentId)}'s side share that side's half equally.`,
        ),
      );
      continue;
    }
    let lines = linesBelow(ctx, ancestors);
    if (prune !== undefined) lines = pruneDepth(lines, prune);
    const allocations = toLines(
      ctx,
      lines,
      Fraction.ONE,
      method,
      citeIssue,
      `No ${label.replace(/s$/, '')} on ${ctx.name(parentId)}'s side survived, so that side's half passes to their descendants.`,
    );
    if (allocations.length > 0) perSide.push(allocations);
  }
  if (perSide.length === 0) return [];
  const portion = share.divideBy(perSide.length);
  return perSide.flatMap((side) => side.map((a) => ({ ...a, share: a.share.mul(portion) })));
}

/** Children of the decedent's spouses (living or dead) who are not the decedent's own children. */
export function stepchildLines(ctx: EstateContext): LineNode[] {
  const own = new Set(ctx.index.childLinks(ctx.decedentId).map((l) => l.childId));
  const exclude = new Set([ctx.decedentId]);
  const out = new Map<string, LineNode>();
  for (const union of ctx.index.unionsOf(ctx.decedentId)) {
    const spouseId = ctx.index.partnerIn(union, ctx.decedentId);
    for (const link of ctx.children(spouseId)) {
      if (own.has(link.childId) || out.has(link.childId)) continue;
      const node = ctx.node(link.childId, exclude, new Set([spouseId]));
      if (node) out.set(link.childId, node);
    }
  }
  return [...out.values()];
}

/** Flag a branch of a rule version that still needs verification. */
export function needsReview(ctx: EstateContext, what: string, citation?: Citation): void {
  ctx.issue({
    level: 'warning',
    code: 'RULE_NEEDS_REVIEW',
    message: `${ctx.decedent.name}'s estate used a branch of the ${ctx.version.title} that is modeled from secondary sources: ${what} Have an attorney confirm it against the statute in force on the date of death.`,
    personIds: [ctx.decedentId],
    ...(citation ? { citation } : {}),
  });
}
