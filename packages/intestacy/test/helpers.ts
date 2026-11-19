import { computeShares, type ComputeOptions } from '../src/engine.js';
import type {
  FamilyTree,
  ParentChildLink,
  Person,
  Property,
  ShareResult,
  StateCode,
  Union,
} from '../src/types.js';

type PersonOpts = Partial<Omit<Person, 'id' | 'name'>> & { died?: string; born?: string };

/** Small fluent builder so tests read like family charts. */
export class TreeBuilder {
  readonly tree: FamilyTree = { people: [], parentChild: [], unions: [], exclusions: [] };
  private seq = 0;

  person(name: string, opts: PersonOpts = {}): string {
    const id = `p${++this.seq}`;
    const { died, born, ...rest } = opts;
    const p: Person = {
      id,
      name,
      status: died ? 'deceased' : 'living',
      ...(died ? { deathDate: died } : {}),
      ...(born ? { birthDate: born } : {}),
      ...rest,
    };
    this.tree.people.push(p);
    return id;
  }

  marry(a: string, b: string, opts: Partial<Omit<Union, 'id' | 'partnerIds'>> = {}): string {
    const id = `u${++this.seq}`;
    this.tree.unions.push({ id, partnerIds: [a, b], kind: 'marriage', ...opts });
    return id;
  }

  link(
    parent: string,
    child: string,
    opts: Partial<Omit<ParentChildLink, 'id' | 'parentId' | 'childId'>> = {},
  ) {
    this.tree.parentChild.push({
      id: `l${++this.seq}`,
      parentId: parent,
      childId: child,
      kind: 'biological',
      ...opts,
    });
  }

  /** Add a child of one or two parents. */
  child(parents: string | string[], name: string, opts: PersonOpts = {}): string {
    const id = this.person(name, opts);
    for (const p of Array.isArray(parents) ? parents : [parents]) this.link(p, id);
    return id;
  }

  exclude(
    personId: string,
    decedentId: string,
    reason: 'disclaimer' | 'slayer' | 'other' = 'disclaimer',
  ) {
    this.tree.exclusions!.push({ personId, decedentId, reason });
  }

  set(id: string, patch: Partial<Person>) {
    const p = this.tree.people.find((x) => x.id === id)!;
    Object.assign(p, patch);
  }

  compute(
    state: StateCode,
    owner: string,
    options: ComputeOptions & Partial<Property> = {},
  ): ShareResult {
    const { asOf, rules, ...prop } = options;
    const property: Property = {
      name: 'Test tract',
      state,
      owners: [{ personId: owner }],
      ...prop,
    };
    return computeShares(this.tree, property, {
      ...(asOf ? { asOf } : {}),
      ...(rules ? { rules } : {}),
    });
  }
}

/** Map of person id → share string for person holdings. */
export function shares(result: ShareResult): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of result.holdings) {
    const key =
      h.holder.kind === 'escheat'
        ? `escheat:${h.holder.state}`
        : h.holder.kind === 'unresolved'
          ? `?${h.holder.personId}`
          : h.holder.personId;
    out[key] = h.share.toString();
  }
  return out;
}

export function issueCodes(result: ShareResult): string[] {
  return result.issues.map((i) => i.code);
}
