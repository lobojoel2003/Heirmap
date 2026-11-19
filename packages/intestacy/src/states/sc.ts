/**
 * South Carolina.
 *
 * - Deaths before July 1, 1987: Statute of Distributions (S.C. Code 1976
 *   § 21-3-20; Code 1962 § 19-52; Act of Feb. 19, 1791 as amended 1797).
 * - July 1, 1987 – Dec. 31, 2013: South Carolina Probate Code, Article 2
 *   (1986 Act No. 539, eff. July 1, 1987, § 62-1-100).
 * - Jan. 1, 2014 – present: Article 2 as revised by 2013 Act No. 100.
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
  stepchildLines,
  survivingParents,
  toDescendants,
  toLines,
} from './common.js';

const ARTICLE_2 = 'https://www.scstatehouse.gov/code/t62c002.php';
const sc = citer('S.C. Code Ann.', (s) =>
  s.startsWith('62-1') ? 'https://www.scstatehouse.gov/code/t62c001.php' : ARTICLE_2,
);
const old = (section: string, title: string, quote?: string): Citation => ({
  code: 'S.C. Code Ann. (1976)',
  section,
  title,
  ...(quote ? { quote } : {}),
});

const HALF = Fraction.of(1, 2);
const THIRD = Fraction.of(1, 3);
const REP = 'per-capita-with-representation' as const;

const C = {
  spouseAll: sc(
    '§ 62-2-102(1)',
    'Spouse takes everything when there is no surviving issue',
    'if there is no surviving issue of the decedent, the entire intestate estate',
  ),
  spouseHalf: sc(
    '§ 62-2-102(2)',
    'Spouse takes one-half when there is surviving issue',
    'if there are surviving issue, one-half of the intestate estate',
  ),
  issue: sc(
    '§ 62-2-103(1)',
    'Issue of the decedent',
    'to the issue of the decedent; if they are all of the same degree of kinship to the decedent they take equally, but if of unequal degree then those of more remote degree take by representation',
  ),
  parents: sc(
    '§ 62-2-103(2)',
    'Parents',
    'if there is no surviving issue, to his parent or parents equally',
  ),
  siblings: sc(
    '§ 62-2-103(3)',
    'Issue of the parents (brothers, sisters, nieces, nephews)',
    'if there is no surviving issue or parent, to the issue of the parents or either of them by representation',
  ),
  grandparents: sc('§ 62-2-103(4)', 'Grandparents or their issue, one-half to each side'),
  greatGrandparents: sc(
    '§ 62-2-103(5)',
    'Great-grandparents or their issue, one-half to each side',
  ),
  stepchildren: sc(
    '§ 62-2-103 (former stepchildren provision)',
    'Stepchildren or their issue (deleted effective Jan. 1, 2014)',
  ),
  escheat: sc(
    '§ 62-2-105',
    'No taker: escheat to the State',
    'If there is no taker under the provisions of this article, the intestate estate passes to the State of South Carolina.',
  ),
  representation: sc(
    '§ 62-2-106',
    'Representation (per capita at the nearest degree)',
    'the estate is divided into as many equal shares as there are surviving heirs in the nearest degree of kinship and deceased persons in the same degree who left issue who survive the decedent',
  ),
  halfBlood: sc(
    '§ 62-2-107',
    'Half blood',
    'Relatives of the half blood inherit the same share they would inherit if they were of the whole blood.',
  ),
  survival: sc(
    '§ 62-2-104',
    'Heirs must survive by 120 hours',
    'If it is not established that an individual who was born before the decedent’s death survived the decedent by one hundred twenty hours, it is deemed that the individual failed to survive.',
  ),
  nonmarital: sc('§ 62-2-109(2)', 'Children born to unmarried parents'),
  adoption: sc('§ 62-2-109(1)', 'Adopted children'),
  effective: sc(
    '§ 62-1-100(a)',
    'Probate Code effective date',
    'Except as otherwise provided, this Code takes effect July 1, 1987.',
  ),
};

function probateCode(withStepchildren: boolean) {
  return (ctx: EstateContext): Allocation[] => {
    const spouse = ctx.spouse();
    const issueLines = ctx.line(ctx.decedentId);
    const hasIssue = ctx.anyTaker(issueLines);
    const out: Allocation[] = [];
    let rest = Fraction.ONE;

    if (spouse) {
      if (!hasIssue) {
        return [
          ctx.give(
            spouse.personId,
            Fraction.ONE,
            [C.spouseAll],
            'With no surviving issue, the surviving spouse takes the entire estate; parents and siblings take nothing.',
            spouse.survival,
          ),
        ];
      }
      out.push(
        ctx.give(
          spouse.personId,
          HALF,
          [C.spouseHalf],
          'The surviving spouse takes one-half because the decedent left issue.',
          spouse.survival,
        ),
      );
      rest = HALF;
    }

    if (hasIssue) {
      return [
        ...out,
        ...toDescendants(
          ctx,
          rest,
          REP,
          [C.issue, C.representation],
          spouse
            ? 'The other half passes to the issue by representation: equal shares at the nearest generation with a survivor.'
            : 'The estate passes to the issue by representation: equal shares at the nearest generation with a survivor.',
          issueLines,
        ),
      ];
    }

    const parents = survivingParents(ctx);
    if (parents.length > 0) {
      return ctx.equally(
        parents.map((p) => p.personId),
        rest,
        [C.parents],
        'With no surviving issue or spouse, the estate passes to the parents equally (or all to a sole surviving parent).',
      );
    }

    const siblings = toLines(
      ctx,
      ctx.siblingLines(),
      rest,
      REP,
      [C.siblings, C.representation, C.halfBlood],
      'With no issue, spouse or parent, the estate passes to the issue of the parents (brothers and sisters, whole or half blood, and their descendants) by representation.',
    );
    if (siblings.length > 0) return siblings;

    const gp = sideHalves(ctx, rest, 1, REP, [C.grandparents], [C.grandparents, C.representation]);
    if (gp.length > 0) return gp;

    const ggp = sideHalves(
      ctx,
      rest,
      2,
      REP,
      [C.greatGrandparents],
      [C.greatGrandparents, C.representation],
    );
    if (ggp.length > 0) return ggp;

    if (withStepchildren) {
      const step = toLines(
        ctx,
        stepchildLines(ctx),
        rest,
        REP,
        [C.stepchildren, C.representation],
        'With no blood relatives through the great-grandparents, the estate passes to the stepchildren or their issue.',
      );
      if (step.length > 0) {
        needsReview(
          ctx,
          'the former stepchildren provision of § 62-2-103 (its exact text and whether it applied from 1987 or only after the 1990 amendments).',
          C.stepchildren,
        );
        return step;
      }
    }
    return [ctx.escheat(rest)];
  };
}

/** Pre-1987 Statute of Distributions. */
function statuteOfDistributions(ctx: EstateContext): Allocation[] {
  const sd = (sub: string, title: string, quote?: string) => old(`§ 21-3-20${sub}`, title, quote);
  const spouse = ctx.spouse();
  const issueLines = ctx.line(ctx.decedentId);
  const stirpes = ctx.shareCount(issueLines, 'per-stirpes');

  if (stirpes > 0) {
    const out: Allocation[] = [];
    let rest = Fraction.ONE;
    if (spouse) {
      const share = stirpes === 1 ? HALF : THIRD;
      const cite =
        stirpes === 1
          ? sd('(1)', 'Widow and one child: one-half each')
          : sd(
              '(1)',
              'Widow and two or more children: widow one-third',
              'the widow shall take one-third of the estate and the remaining two-thirds shall be divided equally among the children',
            );
      out.push(
        ctx.give(
          spouse.personId,
          share,
          [cite],
          stirpes === 1
            ? 'The surviving spouse takes one-half; the one child (or that child’s line) takes the other half.'
            : 'The surviving spouse takes one-third; the children share two-thirds equally.',
          spouse.survival,
        ),
      );
      rest = Fraction.ONE.sub(share);
    }
    return [
      ...out,
      ...toDescendants(
        ctx,
        rest,
        'per-stirpes',
        [sd('(1)', 'Children and the descendants of deceased children (per stirpes)')],
        'Children share equally; the descendants of a deceased child represent that child.',
        issueLines,
      ),
    ];
  }

  // No descendants: parents, brothers and sisters share (with the spouse, if any, taking one-half).
  const parents = survivingParents(ctx).map((p) => p.personId);
  const siblingLines = ctx.siblingLines();
  const half = siblingLines.filter((n) => ctx.isHalfBlood(ctx.decedentId, n.id));
  if (half.length > 0) {
    needsReview(
      ctx,
      'half-blood brothers and sisters, who were postponed to the whole blood under the pre-1987 statute (Bynum v. Bynum, 1960). They are shown here as sharing equally.',
    );
  }
  const takersPresent = parents.length > 0 || ctx.anyTaker(siblingLines);
  if (takersPresent) {
    const pool = spouse ? HALF : Fraction.ONE;
    const out: Allocation[] = [];
    if (spouse) {
      out.push(
        ctx.give(
          spouse.personId,
          HALF,
          [
            sd(
              '(3)',
              'Widow takes one moiety (half) when there are no descendants',
              'the widow shall be entitled to one moiety of the estate and the brothers and sisters or brother or sister to the other moiety as tenants in common',
            ),
          ],
          'With no descendants, the surviving spouse takes one-half; the other half goes to the parents and the brothers and sisters.',
          spouse.survival,
        ),
      );
      if (parents.length > 0) {
        needsReview(
          ctx,
          'the spouse sharing with parents (the 1797 amendment placing parents with brothers and sisters).',
        );
      }
    } else {
      needsReview(ctx, 'parents and brothers and sisters sharing equally when there is no spouse.');
    }
    // Each surviving parent counts as one share; each sibling line counts as one share.
    const siblingTakers = siblingLines.filter((n) => n.takes);
    const shares = parents.length + siblingTakers.length;
    const unit = pool.divideBy(shares);
    for (const id of parents) {
      out.push(
        ctx.give(
          id,
          unit,
          [sd('(3)', 'Parents and brothers and sisters share the residue equally')],
          'Parents share equally with the brothers and sisters.',
        ),
      );
    }
    out.push(
      ...toLines(
        ctx,
        siblingTakers,
        unit.times(siblingTakers.length),
        'per-stirpes',
        [
          sd(
            '(3)',
            'Brothers and sisters; children of a deceased brother or sister represent them',
          ),
        ],
        'Brothers and sisters share equally with the parents; the children of a deceased brother or sister take that share.',
      ),
    );
    return out;
  }

  // Remote kindred.
  const kin = nextOfKin(ctx, spouse ? HALF : Fraction.ONE, [
    sd('', 'Lineal ancestors, uncles and aunts, and next of kin'),
  ]);
  if (kin.length > 0 || spouse) {
    needsReview(
      ctx,
      'the remote-kindred tiers of § 21-3-20 (lineal ancestors, uncles and aunts, next of kin) and the widow’s share against them.',
    );
  }
  if (spouse) {
    if (kin.length === 0) {
      return [
        ctx.give(
          spouse.personId,
          Fraction.ONE,
          [sd('', 'Spouse takes all when there are no kindred')],
          'With no kindred, the surviving spouse takes the whole estate.',
          spouse.survival,
        ),
      ];
    }
    return [
      ctx.give(
        spouse.personId,
        HALF,
        [sd('', 'Spouse with remote kindred')],
        'The surviving spouse takes one-half against remote kindred.',
        spouse.survival,
      ),
      ...kin,
    ];
  }
  if (kin.length > 0) return kin;
  return [ctx.escheat()];
}

const SURVIVAL_1987 = { hours: 120, citation: C.survival };

const versions: RuleVersion[] = [
  {
    id: 'SC-1900',
    title: 'South Carolina Statute of Distributions (Code 1976 § 21-3-20 and predecessors)',
    effectiveFrom: '1900-01-01',
    summary:
      'Widow and one child: one-half each. Widow and two or more children: widow one-third, children two-thirds, the descendants of a deceased child representing that child. With no descendants, the widow takes one-half and the parents and brothers and sisters share the other half. The widow also had dower (a life estate in one-third), abolished in the mid-1980s.',
    sources: [
      old('§ 21-3-20', 'Statute of Distributions (repealed effective July 1, 1987)'),
      old('Code 1962 § 19-52', 'Statute of Distributions'),
    ],
    survival: { hours: 0 },
    confidence: 'low',
    notes: [
      'Modeled from Pitts v. Hamrick, 228 F.2d 486 (4th Cir. 1955), Bynum v. Bynum (S.C. 1960), Kinard v. Moore, 220 S.C. 376 (1951) and South Carolina Law Review commentary; the full text of § 21-3-20(4)–(10) has not been checked.',
      'Half-blood brothers and sisters were postponed to the whole blood; Heirmap flags this instead of modeling it.',
      'Dower (a life estate) is not a fee share and is not shown in the fractions.',
    ],
    distribute: statuteOfDistributions,
  },
  {
    id: 'SC-1987',
    title: 'South Carolina Probate Code, Article 2 (1987–2013)',
    effectiveFrom: '1987-07-01',
    summary:
      'Spouse: everything if there is no surviving issue, otherwise one-half. The rest goes to issue by representation; if none, to parents; then the issue of the parents; then grandparents or their issue (half to each side); then great-grandparents or their issue; then stepchildren; then the State. Heirs must survive by 120 hours.',
    sources: [C.effective, C.spouseHalf, C.issue, C.representation, C.halfBlood, C.survival],
    survival: SURVIVAL_1987,
    confidence: 'medium',
    notes: [
      'Quoted text is from the current code; the 1987 and 1990 wording has not been compared line by line.',
      'Whether the stepchildren step existed from 1987 or was added by the 1990 amendments is unverified.',
    ],
    distribute: probateCode(true),
  },
  {
    id: 'SC-2014',
    title: 'South Carolina Probate Code, Article 2 as revised by 2013 Act No. 100',
    effectiveFrom: '2014-01-01',
    summary:
      'Spouse: everything if there is no surviving issue, otherwise one-half. The rest goes to issue by representation; if none, to parents; then the issue of the parents; then grandparents or their issue (half to each side); then great-grandparents or their issue; then the State. Heirs must survive by 120 hours.',
    sources: [C.spouseAll, C.spouseHalf, C.issue, C.representation, C.halfBlood, C.survival],
    survival: SURVIVAL_1987,
    confidence: 'medium',
    notes: [
      'Section 62-2-114 (2014) lets a court deny or limit a parent who failed to support the decedent; Heirmap does not model that.',
    ],
    distribute: probateCode(false),
  },
];

export const southCarolina: StateRules = {
  code: 'SC',
  name: 'South Carolina',
  versions,
  escheat: C.escheat,
  commonLawMarriageCutoff: '2019-07-25',
  commonLawCitation: {
    code: 'S.C.',
    section: 'Stone v. Thompson, 428 S.C. 79 (2019)',
    title: 'Common-law marriage abolished prospectively from July 24, 2019',
  },
  paternityCitation: C.nonmarital,
  adoptionCitation: C.adoption,
  caveats: [
    'South Carolina: real property passes under the law of the state where the land sits. Heirs must also clear any partition risk under the South Carolina Uniform Partition of Heirs Property Act.',
  ],
};
