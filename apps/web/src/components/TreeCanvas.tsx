import {
  Background,
  Controls,
  Handle,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { recipientKey, type Person } from '@heirmap/intestacy';
import { memo, useEffect, useMemo } from 'react';
import { slotColor, type Analysis } from '../model/analysis';
import { lifespan, type CaseFile } from '../model/case';
import { layoutFamily, type Direction } from '../model/layout';
import { useStore } from '../store/store';
import { IconAlert, IconPlus } from './Icons';

interface PersonData extends Record<string, unknown> {
  person: Person;
  vertical: boolean;
  owner: boolean;
  share?: string;
  unresolved?: boolean;
  color?: string;
  warnings: number;
  canAddSibling: boolean;
}

interface UnionData extends Record<string, unknown> {
  ended: boolean;
  unmarried: boolean;
  solo: boolean;
  vertical: boolean;
}

type PersonNodeType = Node<PersonData, 'person'>;
type UnionNodeType = Node<UnionData, 'union'>;

const STATUS_LABEL: Record<Person['status'], string> = {
  living: 'Living',
  deceased: 'Deceased',
  unknown: 'Status unknown',
};

const PersonNode = memo(function PersonNode({ data, selected }: NodeProps<PersonNodeType>) {
  const { person, owner, share, color, warnings, unresolved } = data;
  const addChild = useStore((s) => s.addChild);
  const addSpouse = useStore((s) => s.addSpouse);
  const addParent = useStore((s) => s.addParent);
  const addSibling = useStore((s) => s.addSibling);
  const span = lifespan(person);
  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Bottom} offset={8}>
        <div className="node-toolbar" role="toolbar" aria-label={`Add relatives of ${person.name}`}>
          <button className="btn btn-sm" onClick={() => addSpouse(person.id)}>
            <IconPlus size={13} /> Spouse
          </button>
          <button className="btn btn-sm" onClick={() => addChild([person.id])}>
            <IconPlus size={13} /> Child
          </button>
          <button className="btn btn-sm" onClick={() => addParent(person.id)}>
            <IconPlus size={13} /> Parent
          </button>
          {data.canAddSibling ? (
            <button className="btn btn-sm" onClick={() => addSibling(person.id)}>
              <IconPlus size={13} /> Sibling
            </button>
          ) : null}
        </div>
      </NodeToolbar>
      <Handle type="target" position={data.vertical ? Position.Top : Position.Left} />
      <div
        className={`person-node${selected ? ' selected' : ''}${owner ? ' owner' : ''}${person.status === 'deceased' ? ' deceased' : ''}`}
        data-testid={`person-${person.id}`}
        aria-label={`${person.name || 'Unnamed'}${span ? `, ${span}` : ''}${share ? `, holds ${share}` : ''}`}
      >
        {color ? (
          <span className={`accent${unresolved ? ' hatch' : ''}`} style={{ background: color }} />
        ) : null}
        {warnings > 0 ? (
          <span className="flag" title={`${warnings} item(s) to review`}>
            <IconAlert size={14} />
          </span>
        ) : null}
        <div className="name">{person.name || 'Unnamed'}</div>
        <div className="dates">{span || ' '}</div>
        <div className="foot">
          {owner ? <span className="chip chip-brand">Owner of record</span> : null}
          {!owner ? (
            <span
              className={`chip ${person.status === 'living' ? 'chip-good' : person.status === 'unknown' ? 'chip-warn' : ''}`}
            >
              {STATUS_LABEL[person.status]}
            </span>
          ) : null}
          {share ? <span className="share">{share}</span> : null}
        </div>
      </div>
      <Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} />
    </>
  );
});

const UnionNode = memo(function UnionNode({ data }: NodeProps<UnionNodeType>) {
  return (
    <>
      <Handle type="target" position={data.vertical ? Position.Top : Position.Left} />
      <div
        className={`union-node${data.unmarried ? ' unmarried' : ''}${data.ended ? ' ended' : ''}${data.solo ? ' solo' : ''}`}
        title={
          data.solo
            ? 'Children'
            : data.unmarried
              ? 'Parents (not married)'
              : data.ended
                ? 'Marriage ended'
                : 'Marriage'
        }
      />
      <Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} />
    </>
  );
});

const nodeTypes = { person: PersonNode, union: UnionNode };

export type { Direction };

function buildGraph(
  file: CaseFile,
  analysis: Analysis,
  selectedId: string | null,
  direction: Direction,
) {
  const layout = layoutFamily(file.tree, direction);
  const vertical = direction === 'TB';
  const owners = new Set(file.property.owners.map((o) => o.personId));
  const colorByBranch = new Map(analysis.branches.map((b) => [b.id, slotColor(b.slot)]));
  const nodes: Node[] = [];
  for (const lp of layout.people) {
    const person = analysis.index.person(lp.id);
    const holding = analysis.holdingOf.get(lp.id);
    const branch = holding ? analysis.branchOf.get(recipientKey(holding.holder)) : undefined;
    const warnings = (analysis.issuesOf.get(lp.id) ?? []).filter((i) => i.level !== 'info').length;
    const data: PersonData = {
      person,
      vertical,
      owner: owners.has(lp.id),
      warnings,
      canAddSibling: analysis.index.legalParentIds(lp.id).length > 0,
      ...(holding
        ? {
            share: holding.share.toString(),
            unresolved: holding.holder.kind === 'unresolved',
            ...(branch ? { color: colorByBranch.get(branch) } : {}),
          }
        : {}),
    };
    nodes.push({
      id: lp.id,
      type: 'person',
      position: { x: lp.x, y: lp.y },
      data,
      selected: lp.id === selectedId,
    });
  }
  for (const u of layout.unions) {
    nodes.push({
      id: u.id,
      type: 'union',
      position: { x: u.x, y: u.y },
      data: {
        ended: Boolean(u.union?.endReason),
        unmarried: !u.union && !u.solo,
        solo: Boolean(u.solo),
        vertical,
      },
      selectable: false,
      focusable: false,
    });
  }
  const edges: Edge[] = layout.edges.map((e) => {
    const dashed =
      e.ended || e.unmarried || (e.linkKind !== undefined && e.linkKind !== 'biological');
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      selectable: false,
      focusable: false,
      style: {
        stroke: 'var(--ink-3)',
        strokeWidth: 1.6,
        ...(dashed ? { strokeDasharray: '5 4' } : {}),
      },
      ...(e.linkKind && e.linkKind !== 'biological'
        ? {
            label: e.linkKind,
            labelStyle: { fontSize: 10, fill: 'var(--ink-3)' },
            labelBgStyle: { fill: 'var(--page)' },
          }
        : {}),
    };
  });
  return { nodes, edges };
}

function Canvas({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const addPerson = useStore((s) => s.addPerson);
  const direction = useStore((s) => s.direction);
  const setDirection = useStore((s) => s.setDirection);
  const { nodes, edges } = useMemo(
    () => buildGraph(file, analysis, selectedId, direction),
    [file, analysis, selectedId, direction],
  );
  const flow = useReactFlow();
  const peopleCount = file.tree.people.length;

  useEffect(() => {
    const t = setTimeout(
      () => void flow.fitView({ padding: 0.15, duration: 250, maxZoom: 1.1 }),
      30,
    );
    return () => clearTimeout(t);
  }, [flow, peopleCount, file.id, direction]);

  return (
    <div className="canvas" aria-label="Family tree">
      <div className="canvas-toolbar">
        <button
          className="btn btn-sm"
          onClick={() => {
            const id = addPerson({ name: 'New person', status: 'living' });
            select(id, 'name');
          }}
        >
          <IconPlus size={13} /> Person
        </button>
        <button
          className="btn btn-sm"
          onClick={() => void flow.fitView({ padding: 0.15, duration: 250 })}
        >
          Fit to screen
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setDirection(direction === 'LR' ? 'TB' : 'LR')}
          aria-label={`Switch to ${direction === 'LR' ? 'top-down' : 'left-to-right'} layout`}
        >
          {direction === 'LR' ? 'Top-down' : 'Left-to-right'} layout
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.15}
        maxZoom={2}
        onlyRenderVisibleElements={peopleCount > 150}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.type === 'person') select(node.id);
        }}
        onPaneClick={() => select(null)}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        colorMode="system"
      >
        <Background gap={24} size={1} color="var(--hairline)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      <div className="canvas-legend" aria-hidden="true">
        <span>
          <span className="legend-line" /> Marriage / birth
        </span>
        <span>
          <span className="legend-line dashed" /> Adopted, unmarried or divorced
        </span>
      </div>
    </div>
  );
}

export function TreeCanvas({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  return (
    <ReactFlowProvider>
      <Canvas file={file} analysis={analysis} />
    </ReactFlowProvider>
  );
}
