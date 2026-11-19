import dagre from '@dagrejs/dagre';
import type { FamilyTree, ParentChildKind, Union } from '@heirmap/intestacy';

export const PERSON_W = 200;
export const PERSON_H = 76;
export const UNION_SIZE = 12;

export type Direction = 'LR' | 'TB';

export interface LayoutPerson {
  id: string;
  x: number;
  y: number;
}

export interface LayoutUnion {
  id: string;
  /** Connector for a single recorded parent (not a couple). */
  solo?: boolean;
  /** The union record, or undefined for unmarried co-parents. */
  union?: Union;
  partnerIds: [string, string];
  x: number;
  y: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  kind: 'partner' | 'child';
  linkKind?: ParentChildKind;
  ended?: boolean;
  unmarried?: boolean;
}

export interface FamilyLayout {
  direction: Direction;
  people: LayoutPerson[];
  unions: LayoutUnion[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Lay out a family tree top-to-bottom: partners side by side, a small
 * "union" node below each couple, and children hanging from the union.
 */
export function layoutFamily(tree: FamilyTree, direction: Direction = 'LR'): FamilyLayout {
  const g = new dagre.graphlib.Graph({ multigraph: false });
  g.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? 14 : 28,
    ranksep: direction === 'LR' ? 30 : 30,
    edgesep: 10,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(tree.people.map((p) => p.id));
  for (const p of tree.people) g.setNode(p.id, { width: PERSON_W, height: PERSON_H });

  const unionNodes = new Map<
    string,
    { id: string; union?: Union; partnerIds: [string, string]; solo?: boolean }
  >();
  for (const u of tree.unions) {
    const [a, b] = u.partnerIds;
    if (!ids.has(a) || !ids.has(b) || a === b) continue;
    const key = pairKey(a, b);
    if (unionNodes.has(key)) continue;
    unionNodes.set(key, { id: `union:${u.id}`, union: u, partnerIds: [a, b] });
  }

  // Group each child's parent links.
  const parentsOf = new Map<string, { parentId: string; kind: ParentChildKind }[]>();
  for (const l of tree.parentChild) {
    if (!ids.has(l.parentId) || !ids.has(l.childId)) continue;
    const list = parentsOf.get(l.childId) ?? [];
    list.push({ parentId: l.parentId, kind: l.kind });
    parentsOf.set(l.childId, list);
  }

  const edges: LayoutEdge[] = [];
  const childEdges: Array<{ source: string; target: string; kind: ParentChildKind }> = [];
  for (const [childId, parents] of parentsOf) {
    const handled = new Set<string>();
    // Pair up parents who share a union (or co-parent without one).
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        const a = parents[i]!;
        const b = parents[j]!;
        if (handled.has(a.parentId) || handled.has(b.parentId)) continue;
        const key = pairKey(a.parentId, b.parentId);
        let node = unionNodes.get(key);
        if (!node) {
          node = { id: `coparent:${key}`, partnerIds: [a.parentId, b.parentId] };
          unionNodes.set(key, node);
        }
        handled.add(a.parentId);
        handled.add(b.parentId);
        childEdges.push({
          source: node.id,
          target: childId,
          kind: a.kind === 'biological' ? b.kind : a.kind,
        });
      }
    }
    for (const p of parents) {
      if (handled.has(p.parentId)) continue;
      // A connector for a single recorded parent keeps every generation on its own row.
      const key = `solo:${p.parentId}`;
      if (!unionNodes.has(key))
        unionNodes.set(key, { id: key, partnerIds: [p.parentId, p.parentId], solo: true });
      childEdges.push({ source: key, target: childId, kind: p.kind });
    }
  }

  for (const node of unionNodes.values()) {
    g.setNode(node.id, { width: UNION_SIZE, height: UNION_SIZE });
    for (const partner of node.solo ? [node.partnerIds[0]] : node.partnerIds) {
      g.setEdge(partner, node.id, { minlen: 1, weight: 4 });
      edges.push({
        id: `e:${partner}:${node.id}`,
        source: partner,
        target: node.id,
        kind: 'partner',
        ended: Boolean(node.union?.endReason),
        unmarried: !node.union && !node.solo,
      });
    }
  }
  for (const e of childEdges) {
    g.setEdge(e.source, e.target, { minlen: 1, weight: 2 });
    edges.push({
      id: `e:${e.source}:${e.target}`,
      source: e.source,
      target: e.target,
      kind: 'child',
      linkKind: e.kind,
    });
  }

  dagre.layout(g);

  const people: LayoutPerson[] = tree.people.map((p) => {
    const n = g.node(p.id);
    return { id: p.id, x: (n?.x ?? 0) - PERSON_W / 2, y: (n?.y ?? 0) - PERSON_H / 2 };
  });
  const unions: LayoutUnion[] = [...unionNodes.values()].map((u) => {
    const n = g.node(u.id);
    return {
      id: u.id,
      ...(u.solo ? { solo: true } : {}),
      ...(u.union ? { union: u.union } : {}),
      partnerIds: u.partnerIds,
      x: (n?.x ?? 0) - UNION_SIZE / 2,
      y: (n?.y ?? 0) - UNION_SIZE / 2,
    };
  });
  const graph = g.graph();
  return {
    direction,
    people,
    unions,
    edges,
    width: graph.width ?? 0,
    height: graph.height ?? 0,
  };
}
