/**
 * Georgia.
 *
 * - Before July 1, 1985: Civil Code 1910 § 3931 / Code 1933 § 113-903 /
 *   O.C.G.A. § 53-4-2 (widow: a child's part, but at least one-fifth).
 * - July 1, 1985 – Dec. 31, 1997: O.C.G.A. § 53-4-2 as amended by Ga. L. 1985,
 *   p. 1257 (gender-neutral; spouse at least one-fourth).
 * - Jan. 1, 1998 – present: Revised Probate Code of 1998, O.C.G.A. § 53-2-1
 *   (spouse shares equally with the children, at least one-third).
 */
import type { EstateContext } from '../context.js';
import { Fraction } from '../fraction.js';
import type { RuleVersion, StateRules } from '../rules.js';
import type { Allocation, Citation } from '../types.js';
import {
  citer,
  linesBelow,
  needsReview,
  nextOfKin,
  pruneDepth,
  survivingParents,
  toDescendants,
  toLines,
  ancestorsAbove,
} from './common.js';

const ga = citer('O.C.G.A.', (s) => {
  const [title, chapter] = s.split('-');
  const article = s.startsWith('53-2-5') ? 'article-5' : 'article-1';
  if (title === '53' && chapter === '2') {
    return `https://law.justia.com/codes/georgia/title-53/chapter-2/${article}/section-${s}/`;
  }
  if (title === '53' && chapter === '10') {
    return `https://law.justia.com/codes/georgia/title-53/chapter-10/section-${s}/`;
  }
  if (title === '19' && chapter === '8') {
    return `https://law.justia.com/codes/georgia/title-19/chapter-8/article-1/section-${s}/`;
  }
  if (title === '53' && chapter === '1') {
    return `https://law.justia.com/codes/georgia/title-53/chapter-1/article-1/section-${s}/`;
  }
  return undefined;
});

const PCR = 'per-capita-with-representation' as const;

const C = {
  // Current law.
  effective: ga(
    '§ 53-1-1(b)',
    'Revised Probate Code effective January 1, 1998',
    'effective on January 1, 1998',
  ),
  spouse: ga(
    '§ 53-2-1(c)(1)',
    'Spouse is sole heir without descendants; otherwise shares equally with the children, but takes at least one-third',
    'the spouse shall share equally with the children, with the descendants of any deceased child taking that child’s share, per stirpes; provided, however, that the spouse’s portion shall not be less than a one-third share',
  ),
  nearestDegree: ga(
    '§ 53-2-1(c)(2)',
    'Heirs are the relatives in the nearest degree with a survivor',
  ),
  children: ga(
    '§ 53-2-1(c)(3)',
    'Children (first degree) share equally; descendants of a deceased child take per stirpes',
    'Children of the decedent are in the first degree and those who survive the decedent shall share the estate equally',
  ),
  parents: ga('§ 53-2-1(c)(4)', 'Parents (second degree) share equally'),
  siblings: ga(
    '§ 53-2-1(c)(5)',
    'Siblings (third degree) share equally; descendants of a deceased sibling take per stirpes; if no sibling survives, nieces and nephews share equally',
  ),
  grandparents: ga('§ 53-2-1(c)(6)', 'Grandparents (fourth degree) share equally'),
  unclesAunts: ga(
    '§ 53-2-1(c)(7)',
    'Uncles and aunts (fifth degree) share equally, children of a deceased uncle or aunt taking that share; if none survives, first cousins share equally',
  ),
  remote: ga(
    '§ 53-2-1(c)(8)',
    'More remote kin: count steps to the closest common ancestor; the lowest count shares equally',
  ),
  halfBlood: ga(
    '§ 53-2-1',
    'Half blood treated the same as whole blood',
    'The half-blood, whether on the maternal or paternal side, are considered equally with the whole-blood',
  ),
  escheat: ga('§ 53-2-51', 'Escheat to the county board of education'),
  survival: ga('§ 53-10-2', 'Uniform Simultaneous Death Act: no 120-hour rule for heirs'),
  nonmarital: ga('§ 53-2-3', 'Inheritance by children born out of wedlock'),
  adoption: ga('§ 19-8-19', 'Effect of adoption on inheritance'),
  // Pre-1998 law (reprinted in the Georgia DHS Medicaid manual, PAMMS § 2320).
  old: {
    code: 'O.C.G.A.',
    section: '§ 53-4-2 (former)',
    title: 'Rules of inheritance (pre-1998)',
    url: 'https://pamms.dhs.ga.gov/dfcs/medicaid/2320/',
  } as Citation,
};

const oldRule = (para: string, title: string, quote?: string): Citation => ({
  ...C.old,
  section: `§ 53-4-2${para} (former; Code 1933 § 113-903)`,
  title,
  ...(quote ? { quote } : {}),
});

// ---------------------------------------------------------------------------
// Revised Probate Code (1998 – present)
// ---------------------------------------------------------------------------

function revisedProbateCode(ctx: EstateContext): Allocation[] {
  const spouse = ctx.spouse();
  const issueLines = ctx.line(ctx.decedentId);
  const childShares = ctx.shareCount(issueLines, 'per-stirpes');

  if (childShares > 0) {
    const out: Allocation[] = [];
    let rest = Fraction.ONE;
    if (spouse) {
      const equal = Fraction.of(1, childShares + 1);
      const third = Fraction.of(1, 3);
      const share = Fraction.max(equal, third);
      out.push(
        ctx.give(
          spouse.personId,
          share,
          [C.spouse],
          share.equals(third) && !equal.equals(third)
            ? `The surviving spouse would share equally with ${childShares} children’s shares (1/${childShares + 1} each), but is guaranteed at least one-third.`
            : `The surviving spouse shares equally with the ${childShares} child${childShares === 1 ? '' : 'ren’s'} share${childShares === 1 ? '' : 's'}.`,
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
        spouse ? [C.spouse, C.children] : [C.children],
        'Children share equally; the descendants of a deceased child take that child’s share per stirpes.',
        issueLines,
      ),
    ];
  }

  if (spouse) {
    return [
      ctx.give(
        spouse.personId,
        Fraction.ONE,
        [C.spouse],
        'Survived by a spouse but no descendant, the spouse is the sole heir.',
        spouse.survival,
      ),
    ];
  }

  const parents = survivingParents(ctx);
  if (parents.length > 0) {
    return ctx.equally(
      parents.map((p) => p.personId),
      Fraction.ONE,
      [C.nearestDegree, C.parents],
      'With no spouse or descendant, the parents (second degree) share equally.',
    );
  }

  const siblingLines = ctx.siblingLines();
  if (ctx.anyTaker(siblingLines)) {
    const anySiblingSurvives = siblingLines.some((n) => n.survival !== 'predeceased');
    return toLines(
      ctx,
      siblingLines,
      Fraction.ONE,
      anySiblingSurvives ? 'per-stirpes' : PCR,
      [C.nearestDegree, C.siblings, C.halfBlood],
      anySiblingSurvives
        ? 'Siblings (whole or half blood) share equally; the descendants of a deceased sibling take that sibling’s share per stirpes.'
        : 'No sibling survived, so the nieces and nephews share equally; descendants of a deceased niece or nephew take that share.',
    );
  }

  const grandparentIds = ctx.parents().flatMap((p) => ancestorsAbove(ctx, p.personId, 1));
  const gps = [...new Set(grandparentIds)].filter((id) => {
    const s = ctx.survival(id);
    return s === 'survived' || s === 'unknown';
  });
  ctx.reliedOn.add('grandparents');
  if (gps.length > 0) {
    return ctx.equally(
      gps,
      Fraction.ONE,
      [C.nearestDegree, C.grandparents],
      'With no closer relative, the surviving grandparents share equally.',
    );
  }

  const auntLines = pruneDepth(linesBelow(ctx, [...new Set(grandparentIds)]), 2);
  const aunts = toLines(
    ctx,
    auntLines,
    Fraction.ONE,
    PCR,
    [C.nearestDegree, C.unclesAunts],
    'Uncles and aunts share equally, the children of a deceased uncle or aunt taking that share; if none survives, the first cousins share equally.',
  );
  if (aunts.length > 0) return aunts;

  const kin = nextOfKin(ctx, Fraction.ONE, [C.remote]);
  if (kin.length > 0) return kin;
  return [ctx.escheat()];
}

// ---------------------------------------------------------------------------
// Pre-1998 rules of inheritance
// ---------------------------------------------------------------------------

function oldRules(floor: Fraction, genderNeutral: boolean) {
  return (ctx: EstateContext): Allocation[] => {
    const spouse = ctx.spouse();
    const issueLines = ctx.line(ctx.decedentId);
    const childShares = ctx.shareCount(issueLines, 'per-stirpes');
    const floorText = floor.equals(Fraction.of(1, 5)) ? 'one-fifth' : 'one-fourth';

    if (spouse && ctx.date < '1970-01-01') {
      ctx.issue({
        level: 'info',
        code: 'DOWER_ELECTION',
        message: `${ctx.decedent.name} died before Georgia abolished dower (1969). A widow could elect dower (a life estate) instead of her child’s part; check whether she did.`,
        personIds: [ctx.decedentId, spouse.personId],
      });
    }

    if (childShares > 0) {
      const out: Allocation[] = [];
      let rest = Fraction.ONE;
      if (spouse) {
        const childPart = Fraction.of(1, childShares + 1);
        const husbandOfWife = !genderNeutral && ctx.decedent.sex === 'female';
        let share = childPart;
        let explanation: string;
        if (husbandOfWife) {
          needsReview(
            ctx,
            'a husband inheriting from his wife before July 1, 1985 (former § 53-4-3); modeled as a child’s part with no minimum.',
          );
          explanation = `The surviving husband takes a child’s part (1/${childShares + 1}).`;
        } else {
          if (!genderNeutral && ctx.decedent.sex !== 'male') {
            needsReview(
              ctx,
              'the spouse’s share when the decedent’s sex is not recorded (the one-fifth minimum applied to widows).',
            );
          }
          share = Fraction.max(childPart, floor);
          explanation = share.equals(childPart)
            ? `The surviving ${genderNeutral ? 'spouse' : 'widow'} takes a child’s part (1/${childShares + 1}).`
            : `The surviving ${genderNeutral ? 'spouse' : 'widow'} takes a child’s part, but because the shares exceed ${floorText === 'one-fifth' ? 'five' : 'four'} she takes ${floorText}.`;
        }
        out.push(
          ctx.give(
            spouse.personId,
            share,
            [
              oldRule(
                genderNeutral ? '(2) (as amended 1985)' : '(1)',
                `${genderNeutral ? 'Spouse' : 'Widow'} takes a child’s part, at least ${floorText}`,
                genderNeutral
                  ? 'the surviving spouse shall have a child’s part, unless the shares exceed four in number, in which case, the surviving spouse shall have one-fourth part of the estate'
                  : 'the wife shall have a child’s part, unless the shares exceed five in number, in which case she shall have one-fifth',
              ),
            ],
            explanation,
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
          [
            oldRule(
              '(4)',
              'Children inherit equally; descendants take per stirpes',
              'in all cases of inheritance from a lineal ancestor the distribution is per stirpes and not per capita',
            ),
          ],
          'Children inherit equally; the descendants of a deceased child take per stirpes.',
          issueLines,
        ),
      ];
    }

    if (spouse) {
      return [
        ctx.give(
          spouse.personId,
          Fraction.ONE,
          [
            oldRule(
              '(1)',
              'Spouse is sole heir without lineal descendants',
              'Upon the death of the husband without lineal descendants, the wife is his sole heir',
            ),
          ],
          'With no lineal descendants, the surviving spouse is the sole heir.',
          spouse.survival,
        ),
      ];
    }

    // Parents share equally with brothers and sisters.
    const parents = survivingParents(ctx).map((p) => p.personId);
    const siblingLines = pruneDepth(ctx.siblingLines(), 3);
    if (
      ctx.date < '1932-01-01' &&
      siblingLines.some((n) => ctx.isHalfBlood(ctx.decedentId, n.id))
    ) {
      needsReview(
        ctx,
        'half-blood brothers and sisters before the 1931 amendment, which first put the maternal and paternal half blood on an equal footing.',
      );
    }
    const siblingTakers = siblingLines.filter((n) => n.takes);
    if (parents.length > 0 || siblingTakers.length > 0) {
      const cite = oldRule(
        '(5)–(6)',
        'Brothers and sisters, with the father and mother, inherit equally',
        'The father and mother inherit equally with brothers and sisters and stand in the same degree',
      );
      const shares = parents.length + siblingTakers.length;
      const unit = Fraction.of(1, shares);
      const out = parents.map((id) =>
        ctx.give(id, unit, [cite], 'The parents inherit equally with the brothers and sisters.'),
      );
      const anySiblingSurvives = siblingTakers.some((n) => n.survival !== 'predeceased');
      if (!anySiblingSurvives && parents.length > 0 && siblingTakers.length > 0) {
        needsReview(
          ctx,
          'surviving parents sharing with nieces and nephews when no brother or sister survived.',
        );
      }
      out.push(
        ...toLines(
          ctx,
          siblingTakers,
          unit.times(siblingTakers.length),
          anySiblingSurvives ? 'per-stirpes' : PCR,
          [cite],
          anySiblingSurvives
            ? 'Brothers and sisters share equally with the parents; children or grandchildren of a deceased brother or sister represent them.'
            : 'All brothers and sisters are dead, so the nephews and nieces share per capita.',
        ),
      );
      return out;
    }

    if (ctx.date < '1983-01-01') {
      needsReview(
        ctx,
        'remote kin (grandparents, uncles and aunts, cousins); grandparents were added to the statute some time between 1970 and 1982.',
      );
    }
    const grandparentIds = [
      ...new Set(ctx.parents().flatMap((p) => ancestorsAbove(ctx, p.personId, 1))),
    ];
    ctx.reliedOn.add('grandparents');
    const gps = grandparentIds.filter((id) => {
      const s = ctx.survival(id);
      return s === 'survived' || s === 'unknown';
    });
    if (gps.length > 0) {
      return ctx.equally(
        gps,
        Fraction.ONE,
        [oldRule('(8)', 'Grandparents stand next in degree')],
        'The grandparents stand next in degree and share equally.',
      );
    }
    const aunts = toLines(
      ctx,
      pruneDepth(linesBelow(ctx, grandparentIds), 2),
      Fraction.ONE,
      PCR,
      [
        oldRule(
          '(9)',
          'Uncles and aunts, children of a deceased uncle or aunt inheriting in their place',
        ),
      ],
      'Uncles and aunts share equally, the children of a deceased uncle or aunt inheriting in the place of their parent.',
    );
    if (aunts.length > 0) return aunts;
    const kin = nextOfKin(ctx, Fraction.ONE, [oldRule('(9)', 'Next of kin by degree')]);
    if (kin.length > 0) return kin;
    return [ctx.escheat()];
  };
}

const versions: RuleVersion[] = [
  {
    id: 'GA-1900',
    title:
      'Georgia rules of inheritance (Code 1933 § 113-903; O.C.G.A. § 53-4-2 before July 1, 1985)',
    effectiveFrom: '1900-01-01',
    summary:
      'Widow with children: a child’s part, but at least one-fifth when the shares exceed five; widow with no lineal descendants: sole heir. Children inherit equally, descendants per stirpes. With no spouse or descendants, the father and mother share equally with the brothers and sisters (children of a deceased sibling represent them; if all siblings are dead, nephews and nieces take per capita); then grandparents, uncles and aunts, and more remote kin.',
    sources: [oldRule('', 'Rules of inheritance'), C.old],
    survival: { hours: 0 },
    confidence: 'medium',
    notes: [
      'The one-fifth minimum applied to widows. A husband inheriting from his wife was governed by former § 53-4-3 (repealed 1985); Heirmap models a child’s part with no minimum and flags it.',
      'Dower (abolished 1969) could be elected instead of the child’s part; flagged for deaths before 1970.',
      'Before the 1931 amendment the maternal half blood was subordinated; flagged for deaths before 1932.',
      'Grandparents were added to the statute between 1970 and 1982; remote-kin results before 1983 are flagged.',
    ],
    distribute: oldRules(Fraction.of(1, 5), false),
  },
  {
    id: 'GA-1985',
    title: 'Georgia rules of inheritance as amended by Ga. L. 1985, p. 1257',
    effectiveFrom: '1985-07-01',
    summary:
      'Spouse (husband or wife) with children: a child’s part, but at least one-fourth when the shares exceed four; spouse with no lineal descendants: sole heir. Children take per capita and their descendants per stirpes. With no spouse or descendants, the parents share equally with the brothers and sisters; then grandparents, uncles and aunts, and more remote kin.',
    sources: [
      oldRule('(2) (as amended 1985)', 'Spouse takes a child’s part, at least one-fourth'),
      C.old,
    ],
    survival: { hours: 0 },
    confidence: 'medium',
    notes: [
      'Quoted text is from reprints of the 1985 statute (Georgia DHS PAMMS § 2320); verify against the 1997 O.C.G.A. volume.',
    ],
    distribute: oldRules(Fraction.of(1, 4), true),
  },
  {
    id: 'GA-1998',
    title: 'Georgia Revised Probate Code of 1998 (O.C.G.A. § 53-2-1)',
    effectiveFrom: '1998-01-01',
    summary:
      'Spouse with descendants: shares equally with the children (a deceased child’s descendants taking that child’s share per stirpes), but never less than one-third; spouse with no descendant: sole heir. Otherwise the nearest degree takes: parents, then siblings (nieces and nephews per capita if no sibling survives), then grandparents, then uncles and aunts (first cousins if none survives), then more remote kin by degree. No 120-hour survival rule.',
    sources: [C.effective, C.spouse, C.children, C.parents, C.siblings, C.survival],
    survival: { hours: 0, citation: C.survival },
    confidence: 'medium',
    notes: [
      'Georgia’s statute does not define whether "per stirpes" begins at the children’s generation when all children have died; Heirmap uses classic per stirpes, which follows the text.',
      'A parent who willfully abandoned a minor child loses the right to inherit from that child (§ 53-2-1, as amended 2007); not modeled.',
      'Year’s support (§§ 53-3-1 to 53-3-9) can set land apart to a spouse and minor children ahead of the heirs.',
    ],
    distribute: revisedProbateCode,
  },
];

export const georgia: StateRules = {
  code: 'GA',
  name: 'Georgia',
  versions,
  escheat: C.escheat,
  commonLawMarriageCutoff: '1997-01-01',
  commonLawCitation: {
    code: 'O.C.G.A.',
    section: '§ 19-3-1.1',
    title: 'No common-law marriage may be entered into on or after January 1, 1997',
  },
  paternityCitation: C.nonmarital,
  adoptionCitation: C.adoption,
  caveats: [
    'Georgia: a year’s support award can set the land apart to a surviving spouse and minor children ahead of the heirs; check the probate court records.',
  ],
};
