/**
 * Mississippi — descent of land, Miss. Code Ann. § 91-1-3 (text traced to
 * Hutchinson's Code of 1848; Code 1930 § 1402; Code 1942 § 468), with the
 * spouse's "child's part" under § 91-1-7 and the half-blood rule of § 91-1-5.
 *
 * Dated versions capture the Uniform Simultaneous Death Law (July 1, 1956)
 * and the 1981 reform letting nonmarital children inherit from the father on
 * proof of paternity (§ 91-1-15, July 1, 1981).
 */
import type { EstateContext, LineNode } from '../context.js';
import { Fraction } from '../fraction.js';
import type { RuleVersion, StateRules } from '../rules.js';
import type { Allocation } from '../types.js';
import {
  citer,
  needsReview,
  nextOfKin,
  survivingParents,
  toDescendants,
  toLines,
} from './common.js';

const ms = citer('Miss. Code Ann.', (s) => {
  const [title, chapter] = s.split('-');
  return `https://law.justia.com/codes/mississippi/title-${title}/chapter-${chapter}/section-${s}/`;
});

const C = {
  descendants: ms(
    '§ 91-1-3',
    'Land descends to children and their descendants in equal parts',
    'the same shall descend to his or her children, and their descendants, in equal parts, the descendants of the deceased child or grandchild to take the share of the deceased parent in equal parts among them',
  ),
  parentsSiblings: ms(
    '§ 91-1-3',
    'Brothers, sisters, father and mother share in equal parts',
    'then to the brothers and sisters and father and mother of the intestate and the descendants of such brothers and sisters in equal parts, the descendants of a sister or brother of the intestate to have in equal parts among them their deceased parent’s share',
  ),
  grandparentsUncles: ms(
    '§ 91-1-3',
    'Grandparents, uncles and aunts share in equal parts',
    'then such estate shall descend, in equal parts, to the grandparents and uncles and aunts, if any there be',
  ),
  nextOfKin: ms(
    '§ 91-1-3',
    'Next of kin in equal degree (civil-law count)',
    'otherwise, such estate shall descend in equal parts to the next of kin of the intestate in equal degree, computing by the rules of the civil law',
  ),
  noRepresentation: ms(
    '§ 91-1-3',
    'No representation among collaterals except descendants of brothers and sisters',
    'There shall not be any representation among collaterals, except among the descendants of the brothers and sisters of the intestate.',
  ),
  spouseAll: ms(
    '§ 91-1-7',
    'Spouse takes the entire estate when there are no children or descendants',
    'If a husband die intestate and do not leave children or descendants of children, his widow shall be entitled to his entire estate, real and personal, in fee simple',
  ),
  spouseChildPart: ms(
    '§ 91-1-7',
    'Spouse takes a child’s part',
    'his widow shall have a child’s part of his estate, in either case in fee simple',
  ),
  halfBlood: ms(
    '§ 91-1-5',
    'Whole blood preferred to half blood in the same degree',
    'There shall not be, in any case, a distinction between the kindred of the whole and half-blood, except that the kindred of the whole-blood, in equal degree, shall be preferred to the kindred of the half-blood in the same degree.',
  ),
  survival: ms(
    '§ 91-3-5',
    'Uniform Simultaneous Death Law (from July 1, 1956)',
    'there is no sufficient evidence that the persons have died otherwise than simultaneously, the property of each person shall be disposed of as if he had survived',
  ),
  nonmarital: ms('§ 91-1-15', 'Descent among children born to unmarried parents'),
  adoption: ms('§ 93-17-13', 'Adopted children inherit from and through the adopting parents'),
  escheat: ms(
    '§ 89-11-1',
    'When property shall escheat',
    'all such property shall escheat to the state',
  ),
  homestead: ms('§ 91-1-19', 'Descent of exempt property (homestead)'),
};

/** Whole-blood lines are preferred; half-blood lines take only if no whole-blood line takes. */
function preferWholeBlood(
  ctx: EstateContext,
  relativeOf: string,
  lines: LineNode[],
): { lines: LineNode[]; excluded: string[] } {
  const takers = lines.filter((n) => n.takes);
  const whole = takers.filter((n) => !ctx.isHalfBlood(relativeOf, n.id));
  const half = takers.filter((n) => ctx.isHalfBlood(relativeOf, n.id));
  if (whole.length > 0 && half.length > 0) return { lines: whole, excluded: half.map((n) => n.id) };
  return { lines: takers, excluded: [] };
}

function descentOfLand(ctx: EstateContext): Allocation[] {
  const spouse = ctx.spouse();
  const issueLines = ctx.line(ctx.decedentId);
  const childShares = ctx.shareCount(issueLines, 'per-stirpes');

  if (childShares > 0) {
    const out: Allocation[] = [];
    let rest = Fraction.ONE;
    if (spouse) {
      const part = Fraction.of(1, childShares + 1);
      out.push(
        ctx.give(
          spouse.personId,
          part,
          [C.spouseChildPart],
          `The surviving spouse takes a child’s part: one share alongside ${childShares} child${childShares === 1 ? '' : 'ren’s'} share${childShares === 1 ? '' : 's'}.`,
          spouse.survival,
        ),
      );
      rest = Fraction.ONE.sub(part);
    }
    return [
      ...out,
      ...toDescendants(
        ctx,
        rest,
        'per-stirpes',
        [C.descendants],
        'Children take in equal parts; the descendants of a deceased child take that child’s share in equal parts.',
        issueLines,
      ),
    ];
  }

  if (spouse) {
    return [
      ctx.give(
        spouse.personId,
        Fraction.ONE,
        [C.spouseAll],
        'With no children or descendants of children, the surviving spouse takes the entire estate in fee simple; parents, brothers and sisters take nothing.',
        spouse.survival,
      ),
    ];
  }

  // Parents, brothers and sisters (and descendants of brothers and sisters) in equal parts.
  const parents = survivingParents(ctx).map((p) => p.personId);
  const { lines: siblingLines, excluded } = preferWholeBlood(
    ctx,
    ctx.decedentId,
    ctx.siblingLines(),
  );
  if (excluded.length > 0) {
    ctx.issue({
      level: 'info',
      code: 'WHOLE_BLOOD_PREFERRED',
      message: `Half-blood ${excluded.map((id) => ctx.name(id)).join(', ')} ${excluded.length === 1 ? 'is' : 'are'} excluded because brothers or sisters of the whole blood (or their descendants) take (Jones v. Stubbs, 434 So. 2d 1362 (Miss. 1983)).`,
      personIds: excluded,
      citation: C.halfBlood,
    });
  }
  if (parents.length > 0 || siblingLines.length > 0) {
    if (parents.length > 0 && siblingLines.some((n) => ctx.isHalfBlood(ctx.decedentId, n.id))) {
      needsReview(
        ctx,
        'a surviving parent sharing with brothers or sisters of the half blood (compare Aycock v. Aycock, 119 Miss. 641 (1919), where the parent took to the exclusion of half-blood kindred).',
        C.halfBlood,
      );
    }
    const shares = parents.length + siblingLines.length;
    const unit = Fraction.of(1, shares);
    const out: Allocation[] = parents.map((id) =>
      ctx.give(
        id,
        unit,
        [C.parentsSiblings],
        'With no descendants and no spouse, each parent takes an equal part with the brothers and sisters.',
      ),
    );
    out.push(
      ...toLines(
        ctx,
        siblingLines,
        unit.times(siblingLines.length),
        'per-stirpes',
        [C.parentsSiblings, C.halfBlood],
        'Brothers and sisters take equal parts with the parents; the descendants of a deceased brother or sister share that part.',
      ),
    );
    return out;
  }

  // Grandparents, uncles and aunts in equal parts — no representation.
  if (ctx.date < '1953-01-01') {
    needsReview(
      ctx,
      'the grandparents/uncles/aunts step of § 91-1-3, which was amended by Laws 1952, ch. 252 (pre-amendment wording not verified).',
      C.grandparentsUncles,
    );
  }
  const grandparentIds = new Set<string>();
  const auntUncle = new Map<string, string>(); // aunt/uncle id -> parent of decedent on that side
  for (const parent of ctx.parents()) {
    for (const gp of ctx.grandparentsVia(parent.personId)) {
      grandparentIds.add(gp.personId);
      for (const link of ctx.children(gp.personId)) {
        if (link.childId === parent.personId || link.childId === ctx.decedentId) continue;
        if (!auntUncle.has(link.childId)) auntUncle.set(link.childId, parent.personId);
      }
    }
  }
  const alive = (id: string) => {
    const s = ctx.survival(id);
    return s === 'survived' || s === 'unknown';
  };
  const gps = [...grandparentIds].filter(alive);
  let aunts = [...auntUncle.keys()].filter(alive);
  const wholeAunts = aunts.filter((id) => !ctx.isHalfBlood(auntUncle.get(id)!, id));
  if (wholeAunts.length > 0 && wholeAunts.length < aunts.length) {
    const excludedAunts = aunts.filter((id) => !wholeAunts.includes(id));
    ctx.issue({
      level: 'info',
      code: 'WHOLE_BLOOD_PREFERRED',
      message: `Half-blood uncle/aunt ${excludedAunts.map((id) => ctx.name(id)).join(', ')} excluded in favor of uncles and aunts of the whole blood in the same degree.`,
      personIds: excludedAunts,
      citation: C.halfBlood,
    });
    aunts = wholeAunts;
  }
  const tier3 = [...gps, ...aunts];
  if (tier3.length > 0) {
    return ctx.equally(
      tier3,
      Fraction.ONE,
      [C.grandparentsUncles, C.noRepresentation],
      'With no descendants, spouse, parents, or brothers and sisters, the grandparents and the uncles and aunts take in equal parts. Cousins take nothing while any uncle, aunt or grandparent survives (no representation among collaterals).',
    );
  }

  const kin = nextOfKin(ctx, Fraction.ONE, [C.nextOfKin, C.noRepresentation, C.halfBlood]);
  if (kin.length > 0) return kin;
  return [ctx.escheat()];
}

const SUMMARY =
  'Spouse: a child’s part (one share alongside each child or deceased child’s line), or everything if there are no descendants. Children take equally, a deceased child’s descendants taking that child’s share. With no descendants or spouse, the parents and the brothers and sisters share in equal parts (whole blood preferred to half blood); then grandparents, uncles and aunts in equal parts; then the next of kin in equal degree. No representation among collaterals except descendants of brothers and sisters.';

const NOTES_COMMON = [
  'Statute text read verbatim from the annotated Mississippi Code (2022 release).',
  'Exempt property (the homestead) descends under § 91-1-19 to the surviving spouse and the children and grandchildren as tenants in common; the result is usually the same, but a former-marriage exception exists.',
];

const versions: RuleVersion[] = [
  {
    id: 'MS-1900',
    title:
      'Mississippi descent statute (Code 1906 § 1650 through Code 1942 § 468), before the Simultaneous Death Law',
    effectiveFrom: '1900-01-01',
    summary: `${SUMMARY} Survivorship had to be proved under common-law rules. A child born to unmarried parents inherited from the father only if legitimated by the parents’ later marriage.`,
    sources: [C.descendants, C.spouseChildPart, C.halfBlood],
    survival: { hours: 0 },
    confidence: 'medium',
    notes: [
      ...NOTES_COMMON,
      'Laws 1952, ch. 252 amended § 91-1-3; the pre-amendment wording of the grandparents/uncles/aunts step is unverified and is flagged for deaths before 1953.',
    ],
    nonmaritalFromFather: 'legitimation-only',
    distribute: descentOfLand,
  },
  {
    id: 'MS-1956',
    title: 'Mississippi descent statute with the Uniform Simultaneous Death Law',
    effectiveFrom: '1956-07-01',
    summary: `${SUMMARY} When there is no sufficient evidence that deaths were not simultaneous, each person’s property passes as if they survived. A child born to unmarried parents inherited from the father only if legitimated.`,
    sources: [C.descendants, C.spouseChildPart, C.halfBlood, C.survival],
    survival: { hours: 0, citation: C.survival },
    confidence: 'high',
    notes: [
      ...NOTES_COMMON,
      'The 1981 Act opened a remedy for nonmarital children on pre-1981 deaths, which had to be filed by July 1, 1984.',
    ],
    nonmaritalFromFather: 'legitimation-only',
    distribute: descentOfLand,
  },
  {
    id: 'MS-1981',
    title: 'Mississippi descent statute after the 1981 nonmarital-children reform',
    effectiveFrom: '1981-07-01',
    summary: `${SUMMARY} A child born to unmarried parents inherits from the father if the parents had a marriage ceremony or paternity is adjudicated within the statutory deadline (§ 91-1-15(3)).`,
    sources: [C.descendants, C.spouseChildPart, C.halfBlood, C.survival, C.nonmarital],
    survival: { hours: 0, citation: C.survival },
    confidence: 'high',
    notes: [
      ...NOTES_COMMON,
      'Post-death paternity claims must be filed within one year of death or 90 days after first publication of notice to creditors, whichever is less.',
      'HB 1542 (2024) amended §§ 91-1-7 and 91-1-11 for posthumously conceived children; reported to affect personal property only.',
    ],
    nonmaritalFromFather: 'paternity',
    distribute: descentOfLand,
  },
];

export const mississippi: StateRules = {
  code: 'MS',
  name: 'Mississippi',
  versions,
  escheat: C.escheat,
  commonLawMarriageCutoff: '1956-04-06',
  commonLawCitation: ms(
    '§ 93-1-15',
    'No marriage contracted after April 5, 1956 is valid without license and solemnization',
  ),
  paternityCitation: C.nonmarital,
  adoptionCitation: C.adoption,
  caveats: [
    'Mississippi: if the land was the decedent’s homestead, it descends under § 91-1-19, and it cannot be partitioned during the surviving spouse’s occupancy without consent (§ 91-1-23).',
  ],
};
