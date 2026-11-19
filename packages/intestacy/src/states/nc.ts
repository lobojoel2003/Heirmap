/**
 * North Carolina — Intestate Succession Act, N.C.G.S. Chapter 29
 * (S.L. 1959, c. 879), for deaths on or after July 1, 1960. The 120-hour
 * survival rule (G.S. 28A-24-2) applies to deaths on or after Oct. 1, 2007.
 *
 * Only the spouse's share of REAL property is modeled (§ 29-14(a)); the
 * personal-property dollar amounts do not affect land.
 */
import type { EstateContext, LineNode } from '../context.js';
import { Fraction } from '../fraction.js';
import type { RuleVersion, StateRules } from '../rules.js';
import type { Allocation } from '../types.js';
import {
  citer,
  pruneDepth,
  sideHalves,
  survivingParents,
  toDescendants,
  toLines,
} from './common.js';

const nc = citer('N.C. Gen. Stat.', (s) => {
  const chapter = s.split('-')[0];
  return `https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_${chapter}/GS_${s}.html`;
});

const HALF = Fraction.of(1, 2);
const THIRD = Fraction.of(1, 3);
const PCEG = 'per-capita-at-each-generation' as const;

const C = {
  spouseOneChild: nc(
    '§ 29-14(a)(1)',
    'Spouse takes one-half of the real property with one child or one child’s line',
    'If the intestate is survived by only one child or by any lineal descendant of only one deceased child, a one-half undivided interest in the real property',
  ),
  spouseTwoChildren: nc(
    '§ 29-14(a)(2)',
    'Spouse takes one-third of the real property with two or more children or lines',
    'If the intestate is survived by two or more children, or by one child and any lineal descendant of one or more deceased children or by lineal descendants of two or more deceased children, a one-third undivided interest in the real property',
  ),
  spouseParents: nc(
    '§ 29-14(a)(3)',
    'Spouse takes one-half of the real property with no descendants but a parent',
    'If the intestate is not survived by a child, children or any lineal descendant of a deceased child or children, but is survived by one or more parents, a one-half undivided interest in the real property',
  ),
  spouseAll: nc('§ 29-14(b)(4)', 'Spouse takes all when there are no descendants and no parent'),
  others: nc(
    '§ 29-15',
    'Shares of others than the surviving spouse',
    'take that share of the net estate not distributable to the surviving spouse, or the entire net estate if there is no surviving spouse',
  ),
  descendants: nc('§ 29-15(1)', 'Lineal descendants'),
  parents: nc('§ 29-15(2)', 'Parents equally, or all to the surviving parent'),
  siblings: nc(
    '§ 29-15(3)',
    'Brothers and sisters and the lineal descendants of deceased brothers and sisters',
    'the brothers and sisters of the intestate, and the lineal descendants of any deceased brothers or sisters',
  ),
  grandparents: nc(
    '§ 29-15(4)',
    'Grandparents: one-half to each side; uncles, aunts and their descendants if no grandparent on a side',
  ),
  repDescendants: nc(
    '§ 29-16(a)',
    'Distribution among lineal descendants (per capita at each generation)',
    'divide the property by the number of surviving children plus the number of deceased children who have left lineal descendants surviving the intestate',
  ),
  repCollateral: nc('§ 29-16(b)', 'Distribution among collaterals (per capita at each generation)'),
  repUncles: nc('§ 29-16(c)', 'Distribution among uncles, aunts and their descendants'),
  halfBlood: nc('§ 29-3', 'No distinction between the whole and half blood'),
  collateralLimit: nc(
    '§ 29-7',
    'Collateral kin beyond the fifth degree do not inherit, unless needed to avoid escheat',
    'There shall be no right of succession by collateral kin who are more than five degrees of kinship removed from an intestate',
  ),
  escheat: nc('§ 29-12', 'Escheats', 'the net estate shall escheat'),
  survival: nc(
    '§ 28A-24-2',
    'Heirs must survive by 120 hours (deaths on or after Oct. 1, 2007)',
    'not established by clear and convincing evidence to have survived the other by at least 120 hours is deemed to have predeceased',
  ),
  nonmarital: nc('§ 29-19', 'Succession by, through and from children born out of wedlock'),
  adoption: nc('§ 29-17', 'Succession by, through and from adopted children'),
};

/** Collateral lines pruned to the fifth degree. Sibling heads are degree 2, uncle/aunt heads degree 3. */
function limited(lines: LineNode[], headDegree: number, unlimited: boolean): LineNode[] {
  return unlimited ? lines : pruneDepth(lines, 5 - headDegree + 1);
}

function intestateSuccessionAct(ctx: EstateContext): Allocation[] {
  const spouse = ctx.spouse();
  const issueLines = ctx.line(ctx.decedentId);
  const childShares = ctx.shareCount(issueLines, 'per-stirpes');
  const parents = survivingParents(ctx);
  const out: Allocation[] = [];
  let rest = Fraction.ONE;

  if (spouse) {
    let share: Fraction;
    let cite;
    let why: string;
    if (childShares === 1) {
      share = HALF;
      cite = C.spouseOneChild;
      why =
        'The surviving spouse takes a one-half undivided interest in the real property (one child or one child’s line survives).';
    } else if (childShares >= 2) {
      share = THIRD;
      cite = C.spouseTwoChildren;
      why =
        'The surviving spouse takes a one-third undivided interest in the real property (two or more children or children’s lines survive).';
    } else if (parents.length > 0) {
      share = HALF;
      cite = C.spouseParents;
      why =
        'With no descendants but a surviving parent, the surviving spouse takes a one-half undivided interest in the real property.';
    } else {
      share = Fraction.ONE;
      cite = C.spouseAll;
      why =
        'With no descendants and no parent, the surviving spouse takes all of the real property; brothers and sisters take nothing.';
    }
    out.push(ctx.give(spouse.personId, share, [cite], why, spouse.survival));
    rest = Fraction.ONE.sub(share);
    if (rest.isZero()) return out;
  }

  if (childShares > 0) {
    return [
      ...out,
      ...toDescendants(
        ctx,
        rest,
        PCEG,
        [C.others, C.descendants, C.repDescendants],
        'Lineal descendants take per capita at each generation: equal shares at the nearest generation with a survivor, with the remaining shares pooled for the next generation.',
        issueLines,
      ),
    ];
  }

  if (parents.length > 0) {
    return [
      ...out,
      ...ctx.equally(
        parents.map((p) => p.personId),
        rest,
        [C.others, C.parents],
        'With no lineal descendants, the parents take equally (or all to a sole surviving parent).',
      ),
    ];
  }

  for (const unlimited of [false, true]) {
    const siblingAll = ctx.siblingLines();
    const siblings = toLines(
      ctx,
      limited(siblingAll, 2, unlimited),
      rest,
      PCEG,
      [C.others, C.siblings, C.repCollateral, C.halfBlood, C.collateralLimit],
      'Brothers and sisters (whole or half blood) and the descendants of deceased brothers and sisters take per capita at each generation.',
    );
    if (siblings.length > 0) return withLimitNote(ctx, unlimited, [...out, ...siblings]);

    const gp = sideHalves(
      ctx,
      rest,
      1,
      PCEG,
      [C.others, C.grandparents],
      [C.others, C.grandparents, C.repUncles, C.collateralLimit],
      'grandparents',
      unlimited ? undefined : 3,
    );
    if (gp.length > 0) return withLimitNote(ctx, unlimited, [...out, ...gp]);
  }

  return [...out, ctx.escheat(rest)];
}

function withLimitNote(ctx: EstateContext, unlimited: boolean, allocations: Allocation[]) {
  if (unlimited) {
    ctx.issue({
      level: 'info',
      code: 'COLLATERAL_LIMIT_LIFTED',
      message: `No relative of ${ctx.decedent.name} within five degrees survived, so the five-degree limit on collateral kin is lifted to avoid escheat.`,
      personIds: [ctx.decedentId],
      citation: C.collateralLimit,
    });
  }
  return allocations;
}

const SUMMARY =
  'Spouse’s share of the land: one-half with one child (or one child’s line), one-third with two or more, one-half with no descendants but a parent, otherwise all. The rest goes to lineal descendants per capita at each generation; if none, to parents; then brothers and sisters and their descendants; then grandparents (half to each side) or, on a side with no grandparent, uncles, aunts and their descendants. Collateral kin beyond the fifth degree are cut off unless needed to avoid escheat.';

const versions: RuleVersion[] = [
  {
    id: 'NC-1960',
    title: 'North Carolina Intestate Succession Act (1960)',
    effectiveFrom: '1960-07-01',
    summary: SUMMARY,
    sources: [C.spouseOneChild, C.spouseTwoChildren, C.others, C.repDescendants, C.halfBlood],
    survival: { hours: 0 },
    confidence: 'medium',
    notes: [
      'The real-property fractions in § 29-14 are reported unchanged since 1960; the wording quoted is the current text.',
      '§ 29-16 was amended in 1979 (c. 107); whether the 1960–1979 text used the same per-capita-at-each-generation method should be confirmed.',
      'Before Oct. 1, 2007 only the original Uniform Simultaneous Death Act applied (no 120-hour rule).',
      'Deaths before July 1, 1960 fell under the canons of descent with dower and curtesy, which Heirmap does not model.',
    ],
    distribute: intestateSuccessionAct,
  },
  {
    id: 'NC-2007',
    title: 'North Carolina Intestate Succession Act with the 120-hour survival rule',
    effectiveFrom: '2007-10-01',
    summary: `${SUMMARY} Heirs must survive by 120 hours (S.L. 2007-132).`,
    sources: [C.spouseOneChild, C.spouseTwoChildren, C.others, C.repDescendants, C.survival],
    survival: { hours: 120, citation: C.survival },
    confidence: 'medium',
    notes: [
      'S.L. 2013-198 added a DNA route for nonmarital children of a father who died within a year of the birth (§ 29-19(b)(3)); prospective only.',
    ],
    distribute: intestateSuccessionAct,
  },
];

export const northCarolina: StateRules = {
  code: 'NC',
  name: 'North Carolina',
  versions,
  escheat: C.escheat,
  commonLawMarriageCutoff: null,
  commonLawCitation: {
    code: 'N.C.',
    section: 'Common-law marriage',
    title: 'North Carolina has never recognized common-law marriages formed in the state',
  },
  paternityCitation: C.nonmarital,
  adoptionCitation: C.adoption,
  caveats: [
    'North Carolina: a surviving spouse may elect a life estate in one-third in value of the real property instead of the intestate share (§ 29-30). That election is not shown in the fractions.',
  ],
};
