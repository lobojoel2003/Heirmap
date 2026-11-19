import {
  isISODate,
  isSupportedState,
  type FamilyTree,
  type Person,
  type Property,
  type StateCode,
} from '@heirmap/intestacy';

export const SCHEMA_VERSION = 1 as const;

export type DocStatus = 'needed' | 'requested' | 'obtained' | 'not-applicable';

export interface DocState {
  status: DocStatus;
  note?: string;
}

/** Everything Heirmap stores about one parcel and family. Saved only on this device. */
export interface CaseFile {
  schema: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  property: Property;
  tree: FamilyTree;
  documents: Record<string, DocState>;
  createdAt: string;
  updatedAt: string;
}

export function uid(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

export interface NewCaseInput {
  title: string;
  state: StateCode;
  county?: string;
  parcelId?: string;
  ownerName: string;
  ownerSex?: Person['sex'];
  ownerDeathDate?: string;
}

export function newCase(input: NewCaseInput): CaseFile {
  const now = new Date().toISOString();
  const owner: Person = {
    id: uid('p'),
    name: input.ownerName.trim() || 'Owner of record',
    status: input.ownerDeathDate ? 'deceased' : 'unknown',
    ...(input.ownerSex ? { sex: input.ownerSex } : {}),
    ...(input.ownerDeathDate ? { deathDate: input.ownerDeathDate } : {}),
  };
  return {
    schema: SCHEMA_VERSION,
    id: uid('case'),
    title: input.title.trim() || `${owner.name} property`,
    property: {
      name: input.title.trim() || `${owner.name} property`,
      state: input.state,
      ...(input.county ? { county: input.county } : {}),
      ...(input.parcelId ? { parcelId: input.parcelId } : {}),
      owners: [{ personId: owner.id }],
      tenancy: 'common',
    },
    tree: { people: [owner], parentChild: [], unions: [], exclusions: [] },
    documents: {},
    createdAt: now,
    updatedAt: now,
  };
}

export class CaseFormatError extends Error {
  override name = 'CaseFormatError';
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CaseFormatError(message);
}

/**
 * Validate an imported case file (from JSON) and return a clean copy.
 * Throws {@link CaseFormatError} with a readable message on bad input.
 */
export function parseCaseFile(input: unknown): CaseFile {
  assert(input && typeof input === 'object', 'The file is not a Heirmap case.');
  const raw = input as Partial<CaseFile> & { format?: string };
  assert(
    raw.schema === SCHEMA_VERSION,
    'This case file was made by an unsupported version of Heirmap.',
  );
  assert(typeof raw.title === 'string', 'The case has no title.');
  assert(raw.property && typeof raw.property === 'object', 'The case has no property record.');
  assert(
    isSupportedState(String(raw.property.state)),
    `Unsupported state "${String(raw.property.state)}".`,
  );
  assert(Array.isArray(raw.property.owners), 'The property has no owners list.');
  const tree = raw.tree;
  assert(tree && Array.isArray(tree.people), 'The case has no family tree.');
  assert(
    Array.isArray(tree.parentChild) && Array.isArray(tree.unions),
    'The family tree is incomplete.',
  );
  for (const p of tree.people) {
    assert(
      typeof p.id === 'string' && typeof p.name === 'string',
      'A person is missing an id or name.',
    );
    assert(
      ['living', 'deceased', 'unknown'].includes(p.status),
      `${p.name} has an invalid status.`,
    );
    for (const d of [p.birthDate, p.deathDate]) {
      assert(d === undefined || isISODate(d), `${p.name} has an invalid date "${String(d)}".`);
    }
  }
  const now = new Date().toISOString();
  return {
    schema: SCHEMA_VERSION,
    id: typeof raw.id === 'string' ? raw.id : uid('case'),
    title: raw.title,
    property: raw.property,
    tree: { exclusions: [], ...tree },
    documents: raw.documents && typeof raw.documents === 'object' ? raw.documents : {},
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

/** Years "1890–1958", "b. 1950", "d. 1944" for compact labels. */
export function lifespan(p: Person): string {
  const born = p.birthDate?.slice(0, 4);
  const died = p.deathDate?.slice(0, 4);
  if (born && died) return `${born}–${died}`;
  if (died) return `d. ${died}`;
  if (born) return p.status === 'deceased' ? `${born}–?` : `b. ${born}`;
  return p.status === 'deceased' ? 'deceased' : '';
}
