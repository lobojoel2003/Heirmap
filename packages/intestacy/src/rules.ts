import type { EstateContext } from './context.js';
import type { Allocation, Citation, ISODate, RuleVersionRef, StateCode } from './types.js';

/** How long an heir must outlive the decedent to inherit. */
export interface SurvivalRule {
  /** 0 = only simultaneous deaths are disqualifying (original Uniform Simultaneous Death Act). */
  hours: number;
  citation?: Citation;
}

/**
 * The intestacy scheme in force for deaths on or after `effectiveFrom` (and
 * before the next version's `effectiveFrom`).
 */
export interface RuleVersion {
  id: string;
  title: string;
  effectiveFrom: ISODate;
  /** One-paragraph, plain-language summary shown to families and reviewers. */
  summary: string;
  /** Primary statutes for this version. */
  sources: Citation[];
  survival: SurvivalRule;
  /**
   * How well this version has been verified against primary sources.
   * `high` = checked against the statute text; `medium` = statute structure
   * confirmed, some wording from secondary sources; `low` = modeled from
   * case law and commentary, needs attorney review before use.
   */
  confidence: 'high' | 'medium' | 'low';
  /** Known gaps and points still to verify. */
  notes: string[];
  /**
   * How a child born to unmarried parents inherits from the father:
   * `paternity` — if paternity was legally established (modern rule);
   * `legitimation-only` — only if the parents later married (older law).
   */
  nonmaritalFromFather?: 'paternity' | 'legitimation-only';
  /** Distribute the decedent's interest. Allocations must sum to exactly 1. */
  distribute(ctx: EstateContext): Allocation[];
}

export interface StateRules {
  code: StateCode;
  name: string;
  /** Sorted ascending by `effectiveFrom`. */
  versions: RuleVersion[];
  /** Where a share goes when there is no heir. */
  escheat: Citation;
  /** Last date (exclusive) on which a common-law marriage could be formed, or `null` if never recognized. */
  commonLawMarriageCutoff: ISODate | null;
  commonLawCitation?: Citation;
  /** Statute on nonmarital children inheriting from or through a father. */
  paternityCitation?: Citation;
  /** Statute on adopted children. */
  adoptionCitation?: Citation;
  /** Caveats that apply to every version (dower, homestead, year's support…). */
  caveats: string[];
}

/** Choose the version that governs a death on `date`. */
export function selectVersion(
  rules: StateRules,
  date: ISODate,
): { version: RuleVersion; fallback: boolean } {
  let chosen: RuleVersion | undefined;
  for (const v of rules.versions) {
    if (v.effectiveFrom <= date) chosen = v;
  }
  if (chosen) return { version: chosen, fallback: false };
  const earliest = rules.versions[0];
  if (!earliest) throw new Error(`No rule versions registered for ${rules.code}`);
  return { version: earliest, fallback: true };
}

export function versionRef(rules: StateRules, version: RuleVersion): RuleVersionRef {
  const idx = rules.versions.indexOf(version);
  const next = rules.versions[idx + 1];
  return {
    id: version.id,
    state: rules.code,
    title: version.title,
    effectiveFrom: version.effectiveFrom,
    ...(next ? { effectiveTo: next.effectiveFrom } : {}),
  };
}
