/**
 * Alabama.
 *
 * - Before May 28, 1980: statute of descents (Code 1940 Tit. 16 § 1; Code 1975
 *   § 43-3-1). The widow took dower (a life estate), not a fee share, when
 *   descendants survived, and ranked sixth among heirs otherwise.
 * - May 28, 1980 – Dec. 31, 1982: § 43-3-1 as amended, moving the spouse to
 *   second place (Ransom v. Ransom, 401 So. 2d 746 (Ala. 1981)).
 * - Jan. 1, 1983 – present: Alabama Probate Code (Acts 1982, No. 82-399),
 *   §§ 43-8-40 to 43-8-48.
 */
import type { EstateContext } from '../context.js';
import { Fraction } from '../fraction.js';
import type { RuleVersion, StateRules } from '../rules.js';
import type { Allocation, Citation } from '../types.js';
import {
  citer,
  needsReview,
  nextOfKin,
  sideHalves,
  survivingParents,
  toDescendants,
  toLines,
} from './common.js';

const al = citer(
  'Ala. Code',
  (s) => `https://alison.legislature.state.al.us/code-of-alabama?section=${s}`,
);
const oldCode = (section: string, title: string): Citation => ({
  code: 'Ala. Code 1975',
  section,
  title,
});

const HALF = Fraction.of(1, 2);
const REP = 'per-capita-with-representation' as const;

const C = {
  spouseAll: al(
    '§ 43-8-41(1)',
    'Spouse takes all when there is no surviving issue or parent',
    'If there is no surviving issue or parent of the decedent, the entire intestate estate',
  ),
  spouseParents: al(
    '§ 43-8-41(2)',
    'Spouse with a parent: first $100,000 plus one-half of the balance',
    'If there is no surviving issue but the decedent is survived by a parent or parents, the first $100,000.00 in value, plus one-half of the balance of the intestate estate',
  ),
  spouseCommonIssue: al(
    '§ 43-8-41(3)',
    'Spouse when all issue are also the spouse’s: first $50,000 plus one-half of the balance',
    'If there are surviving issue all of whom are issue of the surviving spouse also, the first $50,000.00 in value, plus one-half of the balance of the intestate estate',
  ),
  spouseOtherIssue: al(
    '§ 43-8-41(4)',
    'Spouse when some issue are not the spouse’s: one-half',
    'If there are surviving issue one or more of whom are not issue of the surviving spouse, one-half of the intestate estate',
  ),
  issue: al(
    '§ 43-8-42(1)',
    'Issue of the decedent',
    'To the issue of the decedent; if they are all of the same degree of kinship to the decedent they take equally, but if of unequal degree, then those of more remote degree take by representation',
  ),
  parents: al(
    '§ 43-8-42(2)',
    'Parents equally',
    'If there is no surviving issue, to his parent or parents equally',
  ),
  siblings: al(
    '§ 43-8-42(3)',
    'Brothers and sisters and the issue of each deceased brother or sister by representation',
  ),
  grandparents: al('§ 43-8-42(4)', 'Grandparents or their issue: one-half to each side'),
  survival: al('§ 43-8-43', 'Heirs must survive by five days'),
  escheat: al('§ 43-8-44', 'No taker: the estate passes to the State'),
  representation: al(
    '§ 43-8-45',
    'Representation (per capita at the nearest degree)',
    'the estate is divided into as many shares as there are surviving heirs in the nearest degree of kinship and deceased persons in the same degree who left issue who survive the decedent',
  ),
  halfBlood: al(
    '§ 43-8-46',
    'Half blood',
    'Relatives of the half blood inherit the same share they would inherit if they were of the whole blood.',
  ),
  parentChild: al('§ 43-8-48', 'Adopted children and children born out of wedlock'),
  descents: oldCode('§ 43-3-1', 'Statute of descents (repealed Jan. 1, 1983)'),
};

/** Spouse's fraction where the share is "the first $X plus one-half of the balance". */
function dollarShare(
  ctx: EstateContext,
  amount: number,
  citation: Citation,
  spouseName: string,
): { share: Fraction; explanation: string } {
  const value = ctx.decedent.estateValue;
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    ctx.issue({
      level: 'warning',
      code: 'ESTATE_VALUE_NEEDED',
      message: `${spouseName}'s share of ${ctx.decedent.name}'s estate is the first $${amount.toLocaleString('en-US')} plus one-half of the balance, so it depends on the net value of the whole intestate estate. Enter ${ctx.decedent.name}'s estate value; until then the minimum share (one-half) is shown.`,
      personIds: [ctx.decedentId],
      citation,
    });
    return {
      share: HALF,
      explanation: `The surviving spouse takes the first $${amount.toLocaleString('en-US')} plus one-half of the balance. Estate value not entered, so the minimum (one-half) is shown.`,
    };
  }
  const dollars = Math.round(value);
  const share = dollars <= amount ? Fraction.ONE : Fraction.of(dollars + amount, 2 * dollars);
  return {
    share,
    explanation: `The surviving spouse takes the first $${amount.toLocaleString('en-US')} plus one-half of the balance of a $${dollars.toLocaleString('en-US')} estate = ${share.toString()}, assuming the land is shared pro rata with the rest of the estate.`,
  };
}

function probateCode(ctx: EstateContext): Allocation[] {
  const spouse = ctx.spouse();
  const issueLines = ctx.line(ctx.decedentId);
  const hasIssue = ctx.anyTaker(issueLines);
  const parents = survivingParents(ctx);
  const out: Allocation[] = [];
  let rest = Fraction.ONE;

  if (spouse) {
    const name = ctx.name(spouse.personId);
    let share: Fraction;
    let cite: Citation;
    let explanation: string;
    if (hasIssue) {
      const allCommon = ctx
        .takers(issueLines)
        .every((id) => ctx.isDescendantOf(id, spouse.personId));
      if (allCommon) {
        cite = C.spouseCommonIssue;
        ({ share, explanation } = dollarShare(ctx, 50_000, cite, name));
      } else {
        cite = C.spouseOtherIssue;
        share = HALF;
        explanation =
          'The surviving spouse takes one-half because at least one of the decedent’s issue is not also the spouse’s.';
      }
    } else if (parents.length > 0) {
      cite = C.spouseParents;
      ({ share, explanation } = dollarShare(ctx, 100_000, cite, name));
    } else {
      cite = C.spouseAll;
      share = Fraction.ONE;
      explanation =
        'With no surviving issue or parent, the surviving spouse takes the entire estate.';
    }
    out.push(ctx.give(spouse.personId, share, [cite], explanation, spouse.survival));
    rest = Fraction.ONE.sub(share);
    if (rest.isZero()) return out;
  }

  if (hasIssue) {
    return [
      ...out,
      ...toDescendants(
        ctx,
        rest,
        REP,
        [C.issue, C.representation],
        'Issue take equally if of the same degree; otherwise by representation at the nearest generation with a survivor.',
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
        [C.parents],
        'With no surviving issue, the parents take equally (or all to a sole surviving parent).',
      ),
    ];
  }
  const siblings = toLines(
    ctx,
    ctx.siblingLines(),
    rest,
    REP,
    [C.siblings, C.representation, C.halfBlood],
    'Brothers and sisters (whole or half blood) and the issue of deceased brothers and sisters take by representation.',
  );
  if (siblings.length > 0) return [...out, ...siblings];
  const gp = sideHalves(ctx, rest, 1, REP, [C.grandparents], [C.grandparents, C.representation]);
  if (gp.length > 0) return [...out, ...gp];
  return [...out, ctx.escheat(rest)];
}

/** Pre-1983 statute of descents; `spouseSecond` reflects the May 28, 1980 amendment. */
function descents(spouseSecond: boolean) {
  return (ctx: EstateContext): Allocation[] => {
    const spouse = ctx.spouse();
    const issueLines = ctx.line(ctx.decedentId);
    if (ctx.anyTaker(issueLines)) {
      if (spouse) {
        ctx.issue({
          level: 'info',
          code: 'DOWER_LIFE_ESTATE',
          message: `${ctx.name(spouse.personId)} took no fee share of ${ctx.decedent.name}'s land because descendants survived; a widow had dower (a life estate in one-third), which ended at her death and is not shown as ownership.`,
          personIds: [spouse.personId, ctx.decedentId],
        });
      }
      return toDescendants(
        ctx,
        Fraction.ONE,
        'per-stirpes',
        [oldCode('§ 43-3-1(1)', 'Children and their descendants in equal parts')],
        'Land descends to the children in equal parts, the descendants of a deceased child taking that child’s share.',
        issueLines,
      );
    }

    if (spouse && spouseSecond) {
      return [
        ctx.give(
          spouse.personId,
          Fraction.ONE,
          [
            oldCode(
              '§ 43-3-1(2) (as amended 1980)',
              'Spouse takes the land when there are no descendants',
            ),
          ],
          'With no descendants, the surviving spouse takes the land in fee (spouse moved to second place by the 1980 amendment).',
          spouse.survival,
        ),
      ];
    }

    needsReview(
      ctx,
      'the collateral order of the pre-1983 statute of descents (parents, brothers and sisters, next of kin, then the spouse), modeled from case law.',
      C.descents,
    );
    const parents = survivingParents(ctx);
    if (parents.length > 0) {
      return ctx.equally(
        parents.map((p) => p.personId),
        Fraction.ONE,
        [C.descents],
        'With no descendants, the land descends to the father and mother in equal parts.',
      );
    }
    const siblings = toLines(
      ctx,
      ctx.siblingLines(),
      Fraction.ONE,
      'per-stirpes',
      [C.descents],
      'Brothers and sisters and the descendants of deceased brothers and sisters take in equal parts.',
    );
    if (siblings.length > 0) return siblings;
    const kin = nextOfKin(ctx, Fraction.ONE, [C.descents]);
    if (kin.length > 0) return kin;
    if (spouse) {
      return [
        ctx.give(
          spouse.personId,
          Fraction.ONE,
          [C.descents],
          'With no blood heirs, the surviving spouse takes the land.',
          spouse.survival,
        ),
      ];
    }
    return [ctx.escheat()];
  };
}

const versions: RuleVersion[] = [
  {
    id: 'AL-1900',
    title: 'Alabama statute of descents (Code 1940 Tit. 16 § 1; Code 1975 § 43-3-1)',
    effectiveFrom: '1900-01-01',
    summary:
      'Land descended to the children in equal parts, the descendants of a deceased child taking that child’s share. The widow had dower (a life estate) rather than a fee share. With no descendants, the land went to parents, then brothers and sisters, then other kin; the spouse ranked sixth.',
    sources: [C.descents],
    survival: { hours: 0 },
    confidence: 'low',
    notes: [
      'The descendant branch is well established. The order of collateral heirs (places two through five) is modeled from Ransom v. Ransom, 401 So. 2d 746 (Ala. 1981) and has not been checked against the 1975 Code text.',
      'Ancestral-property rules for the half blood (Caffee v. Thompson, 81 So. 2d 358 (Ala. 1955)) are not modeled.',
    ],
    distribute: descents(false),
  },
  {
    id: 'AL-1980',
    title: 'Alabama statute of descents as amended May 28, 1980',
    effectiveFrom: '1980-05-28',
    summary:
      'As before, land descended to the children and their descendants, with the widow holding dower only. The 1980 amendment moved the surviving spouse to second place: with no descendants, the spouse took the land in fee ahead of parents and siblings.',
    sources: [C.descents],
    survival: { hours: 0 },
    confidence: 'low',
    notes: [
      'Effective date per Ransom v. Ransom, 401 So. 2d 746 (Ala. 1981); applied in Morgan v. Tate, 445 So. 2d 273 (Ala. 1984).',
      'Act 81-967 created a spouse life-estate issue addressed in Kinard v. Jordan, 646 So. 2d 1380 (Ala. 1994); not modeled.',
    ],
    distribute: descents(true),
  },
  {
    id: 'AL-1983',
    title: 'Alabama Probate Code (Acts 1982, No. 82-399)',
    effectiveFrom: '1983-01-01',
    summary:
      'Spouse: everything if there is no issue or parent; the first $100,000 plus half the balance with a parent; the first $50,000 plus half the balance if all issue are also the spouse’s; one-half if some issue are not. The rest passes to issue by representation, then parents, then brothers and sisters and their issue, then grandparents or their issue (half to each side), then the State. Heirs must survive by five days.',
    sources: [C.spouseCommonIssue, C.issue, C.representation, C.halfBlood, C.survival],
    survival: { hours: 120, citation: C.survival },
    confidence: 'medium',
    notes: [
      'Statute wording is reconstructed from secondary sources and the 1969 Uniform Probate Code; compare with ALISON before relying on quotes.',
      'Dollar-amount shares need the net value of the whole intestate estate (enter it on the decedent). The land is assumed to be shared pro rata.',
      'The five-day survival rule does not apply where it would cause escheat; Heirmap does not model that exception.',
    ],
    distribute: probateCode,
  },
];

export const alabama: StateRules = {
  code: 'AL',
  name: 'Alabama',
  versions,
  escheat: C.escheat,
  commonLawMarriageCutoff: '2017-01-01',
  commonLawCitation: al(
    '§ 30-1-20',
    'No common-law marriage may be entered into on or after January 1, 2017',
  ),
  paternityCitation: C.parentChild,
  adoptionCitation: C.parentChild,
  caveats: [
    'Alabama: homestead and dower (before 1983) were life-estate rights layered on top of the fee shares shown here.',
  ],
};
