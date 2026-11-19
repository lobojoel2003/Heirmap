import type { Exclusion, FamilyTree, ParentChildLink, Person, Union } from './types.js';

/**
 * Read-only, indexed view over a {@link FamilyTree}. All engine lookups go
 * through this class so that the raw tree can stay a plain JSON document.
 */
export class FamilyIndex {
  readonly tree: FamilyTree;
  private readonly people = new Map<string, Person>();
  private readonly linksByChild = new Map<string, ParentChildLink[]>();
  private readonly linksByParent = new Map<string, ParentChildLink[]>();
  private readonly unionsByPerson = new Map<string, Union[]>();
  private readonly exclusions: Exclusion[];

  constructor(tree: FamilyTree) {
    this.tree = tree;
    for (const p of tree.people) this.people.set(p.id, p);
    for (const link of tree.parentChild) {
      push(this.linksByChild, link.childId, link);
      push(this.linksByParent, link.parentId, link);
    }
    for (const u of tree.unions) {
      push(this.unionsByPerson, u.partnerIds[0], u);
      push(this.unionsByPerson, u.partnerIds[1], u);
    }
    this.exclusions = tree.exclusions ?? [];
  }

  has(id: string): boolean {
    return this.people.has(id);
  }

  person(id: string): Person {
    const p = this.people.get(id);
    if (!p) throw new Error(`Unknown person id "${id}"`);
    return p;
  }

  maybePerson(id: string): Person | undefined {
    return this.people.get(id);
  }

  name(id: string): string {
    return this.people.get(id)?.name || 'Unnamed person';
  }

  allPeople(): readonly Person[] {
    return this.tree.people;
  }

  /** Links where `childId` is the child. */
  parentLinks(childId: string): readonly ParentChildLink[] {
    return this.linksByChild.get(childId) ?? [];
  }

  /** Links where `parentId` is the parent. */
  childLinks(parentId: string): readonly ParentChildLink[] {
    return this.linksByParent.get(parentId) ?? [];
  }

  unionsOf(personId: string): readonly Union[] {
    return this.unionsByPerson.get(personId) ?? [];
  }

  partnerIn(union: Union, personId: string): string {
    return union.partnerIds[0] === personId ? union.partnerIds[1] : union.partnerIds[0];
  }

  /** Marriages (of any kind) between two specific people. */
  unionsBetween(a: string, b: string): Union[] {
    return this.unionsOf(a).filter((u) => this.partnerIn(u, a) === b);
  }

  /** Parents connected by a biological or adoptive link. */
  legalParentIds(childId: string): string[] {
    return this.parentLinks(childId)
      .filter((l) => l.kind === 'biological' || l.kind === 'adopted')
      .map((l) => l.parentId);
  }

  exclusionFor(personId: string, decedentId: string): Exclusion | undefined {
    return this.exclusions.find((e) => e.personId === personId && e.decedentId === decedentId);
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
