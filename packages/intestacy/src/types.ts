import type { Fraction } from './fraction.js';

/** Calendar date in ISO 8601 form, `YYYY-MM-DD`. */
export type ISODate = string;

/** Two-letter USPS code of a state with a rules module. */
export type StateCode = 'AL' | 'GA' | 'MS' | 'NC' | 'SC';

export type Sex = 'female' | 'male' | 'unknown';

/** What is known about whether a person is alive. */
export type LifeStatus = 'living' | 'deceased' | 'unknown';

export interface Devise {
  /** Person (in the tree) who receives under the will. */
  personId: string;
  /** Share of the testator's interest in the property, e.g. `"1/2"`. */
  share: string;
}

/** A will that disposed of the person's interest in the property. */
export interface Will {
  /** Whether the will was admitted to probate. Unprobated wills generally pass no title. */
  probated: boolean;
  devises: Devise[];
  /** Court, case number, recording reference, etc. */
  reference?: string;
}

export interface Person {
  id: string;
  name: string;
  sex?: Sex;
  birthDate?: ISODate;
  status: LifeStatus;
  deathDate?: ISODate;
  /** If present, this person's interest passes under the will instead of by intestacy. */
  will?: Will;
  /**
   * Net value (USD) of the person's whole intestate estate at death. Needed
   * only where a spouse's share includes a dollar amount (e.g. Alabama).
   */
  estateValue?: number;
  notes?: string;
  /**
   * Research checkpoints used by the guided builder: has the family confirmed
   * that all of this person's spouses / children / parents / siblings are entered?
   */
  confirmed?: {
    spouses?: boolean;
    children?: boolean;
    parents?: boolean;
    siblings?: boolean;
  };
}

export type ParentChildKind = 'biological' | 'adopted' | 'step' | 'foster';

export interface ParentChildLink {
  id: string;
  parentId: string;
  childId: string;
  kind: ParentChildKind;
  /**
   * For a child born to unmarried parents: whether paternity was legally
   * established (legitimation, court order, acknowledgment…). `undefined`
   * means unknown — the engine includes the child and raises a warning.
   */
  paternityEstablished?: boolean;
  /** A biological child who was later adopted by someone else. */
  adoptedAway?: boolean;
}

export type UnionKind = 'marriage' | 'common-law';

export interface Union {
  id: string;
  partnerIds: [string, string];
  kind: UnionKind;
  startDate?: ISODate;
  endDate?: ISODate;
  endReason?: 'divorce' | 'annulment';
}

/** Reasons an otherwise-eligible heir is treated as having predeceased the decedent. */
export interface Exclusion {
  personId: string;
  decedentId: string;
  reason: 'disclaimer' | 'slayer' | 'other';
  note?: string;
}

export interface FamilyTree {
  people: Person[];
  parentChild: ParentChildLink[];
  unions: Union[];
  exclusions?: Exclusion[];
}

export interface PropertyOwner {
  personId: string;
  /** Fraction of the property held by this owner under the vesting deed. Defaults to equal shares. */
  share?: string;
}

export interface Property {
  name: string;
  state: StateCode;
  county?: string;
  parcelId?: string;
  legalDescription?: string;
  acreage?: number;
  /** Vesting deed details (book/page, date). */
  deedReference?: string;
  deedDate?: ISODate;
  owners: PropertyOwner[];
  /** How co-owners on the vesting deed held title. */
  tenancy?: 'common' | 'survivorship';
}

/** A pointer to the statute (or other authority) behind a computed share. */
export interface Citation {
  /** Code name, e.g. `"O.C.G.A."` or `"S.C. Code Ann."`. */
  code: string;
  /** Section with subsection, e.g. `"§ 53-2-1(c)(1)"`. */
  section: string;
  /** Short description of the rule. */
  title: string;
  /** Link to the statute text. */
  url?: string;
  /** A short quotation of the operative text. */
  quote?: string;
}

export type RepresentationMethod =
  /** Classic per stirpes: shares are always fixed at the children's generation. */
  | 'per-stirpes'
  /** Shares fixed at the nearest generation with a survivor; each deceased member's share passes the same way to their line (1969 UPC "by representation"). */
  | 'per-capita-with-representation'
  /** Shares fixed at the nearest generation with a survivor; deceased members' shares are pooled and divided equally at the next generation (1990 UPC). */
  | 'per-capita-at-each-generation';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  personIds?: string[];
  citation?: Citation;
}

export type Recipient =
  | { kind: 'person'; personId: string }
  | { kind: 'unresolved'; personId: string; reason: UnresolvedReason }
  | { kind: 'escheat'; state: StateCode };

export type UnresolvedReason =
  /** We do not know whether the person survived the decedent. */
  | 'survival-unknown'
  /** The person is deceased but no date of death is recorded. */
  | 'death-date-missing'
  /** Whether the person is living has not been researched. */
  | 'status-unknown';

/** One heir's portion of a single decedent's estate. */
export interface Allocation {
  to: Recipient;
  /** Fraction of the decedent's interest. */
  share: Fraction;
  /** Role relative to the decedent ("surviving spouse", "grandchild"…). */
  role: string;
  /** Predeceased relatives through whom the share passed by representation (nearest to the recipient last). */
  via: string[];
  citations: Citation[];
  explanation: string;
}

export type TransferBasis = 'deed' | 'intestacy' | 'will' | 'survivorship';

/** One hop in a share's chain of title. */
export interface TransferStep {
  basis: TransferBasis;
  /** Decedent whose interest passed (absent for the vesting deed). */
  fromId?: string;
  to: Recipient;
  date?: ISODate;
  /** Fraction of `fromId`'s interest that passed in this step. */
  fraction: Fraction;
  /** Resulting share of the whole property. */
  amount: Fraction;
  role: string;
  via: string[];
  ruleVersionId?: string;
  citations: Citation[];
  explanation: string;
}

export interface SharePath {
  amount: Fraction;
  steps: TransferStep[];
}

export interface Holding {
  holder: Recipient;
  share: Fraction;
  /** Every chain of title that ends with this holder. */
  paths: SharePath[];
}

export interface RuleVersionRef {
  id: string;
  state: StateCode;
  title: string;
  effectiveFrom: ISODate;
  effectiveTo?: ISODate;
}

export interface EstateResult {
  decedentId: string;
  date: ISODate;
  basis: 'intestacy' | 'will';
  ruleVersion?: RuleVersionRef;
  /** Interest in the property the decedent held at death. */
  interest: Fraction;
  allocations: Allocation[];
  /** What the distribution depended on — used by the guided builder to ask the right questions. */
  reliedOn: Array<'spouse' | 'descendants' | 'parents' | 'siblings' | 'grandparents' | 'kindred'>;
}

export interface ShareResult {
  property: Property;
  asOf?: ISODate;
  holdings: Holding[];
  estates: EstateResult[];
  issues: Issue[];
  total: Fraction;
  rulesUsed: RuleVersionRef[];
}
