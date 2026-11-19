import { commonDenominator, formatDate, type Holding } from '@heirmap/intestacy';
import { holderLabel, type Analysis } from './analysis';
import { lifespan, type CaseFile, type DocStatus } from './case';
import { PERSON_H, PERSON_W, UNION_SIZE, type FamilyLayout } from './layout';

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  needed: 'Needed',
  requested: 'Requested',
  obtained: 'Obtained',
  'not-applicable': 'Not needed',
};

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCSV(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'heirmap'
  );
}

/** Status text for a holder. */
export function holderStatus(analysis: Analysis, h: Holding): string {
  if (h.holder.kind === 'escheat') return 'Escheat';
  if (h.holder.kind === 'unresolved') {
    return h.holder.reason === 'status-unknown'
      ? 'Unresolved — living status unknown'
      : h.holder.reason === 'death-date-missing'
        ? 'Unresolved — date of death missing'
        : 'Unresolved — survival unknown';
  }
  const p = analysis.index.person(h.holder.personId);
  return p.status === 'deceased' ? `Living on the as-of date (d. ${p.deathDate})` : 'Living';
}

export function sharesCSV(file: CaseFile, analysis: Analysis): string {
  const lcd = commonDenominator(analysis.result.holdings.map((h) => h.share));
  const rows: unknown[][] = [
    [
      'Heir',
      'Relationship to owner of record',
      'Status',
      'Share',
      `Share (x/${lcd})`,
      'Percent',
      'Statutes',
    ],
  ];
  for (const h of analysis.result.holdings) {
    const statutes = new Set<string>();
    for (const p of h.paths) {
      for (const s of p.steps)
        for (const c of s.citations) statutes.add(`${c.code} ${c.section}`.trim());
    }
    rows.push([
      holderLabel(analysis, h),
      h.holder.kind === 'escheat' ? '' : analysis.relationOf(h.holder.personId),
      holderStatus(analysis, h),
      h.share.toString(),
      `${(h.share.n * lcd) / h.share.d}/${lcd}`,
      h.share.toPercent(4),
      [...statutes].join('; '),
    ]);
  }
  void file;
  return toCSV(rows);
}

export function checklistCSV(file: CaseFile, analysis: Analysis): string {
  const rows: unknown[][] = [['Category', 'Document', 'Why it is needed', 'Status', 'Note']];
  for (const item of analysis.checklist) {
    const state = file.documents[item.key];
    rows.push([
      item.category,
      item.title,
      item.reason,
      DOC_STATUS_LABEL[state?.status ?? 'needed'],
      state?.note ?? '',
    ]);
  }
  return toCSV(rows);
}

export function checklistMarkdown(file: CaseFile, analysis: Analysis): string {
  const lines = [
    `# Document checklist — ${file.property.name}`,
    '',
    `${file.property.county ? `${file.property.county} County, ` : ''}${file.property.state}${file.property.parcelId ? ` · Parcel ${file.property.parcelId}` : ''}`,
    '',
  ];
  let category = '';
  for (const item of analysis.checklist) {
    if (item.category !== category) {
      category = item.category;
      lines.push(`## ${category[0]!.toUpperCase()}${category.slice(1)}`, '');
    }
    const state = file.documents[item.key];
    const done = state?.status === 'obtained' || state?.status === 'not-applicable';
    lines.push(
      `- [${done ? 'x' : ' '}] **${item.title}** — ${DOC_STATUS_LABEL[state?.status ?? 'needed']}`,
      `  ${item.reason}${state?.note ? ` _Note: ${state.note}_` : ''}`,
    );
  }
  lines.push('', '_Prepared with Heirmap. Not legal advice._', '');
  return lines.join('\n');
}

export function caseJSON(file: CaseFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * A standalone SVG family chart (black on white) for an affidavit-of-heirship
 * exhibit: everyone in the tree with life dates and current shares.
 */
export function familyChartSVG(file: CaseFile, analysis: Analysis, layout: FamilyLayout): string {
  const pad = 24;
  const width = Math.max(320, Math.ceil(layout.width + pad * 2));
  const height = Math.ceil(layout.height + pad * 2);
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const p of layout.people)
    pos.set(p.id, { x: p.x + pad, y: p.y + pad, w: PERSON_W, h: PERSON_H });
  for (const u of layout.unions)
    pos.set(u.id, { x: u.x + pad, y: u.y + pad, w: UNION_SIZE, h: UNION_SIZE });
  const owners = new Set(file.property.owners.map((o) => o.personId));

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" role="img" aria-label="Family chart for ${esc(file.property.name)}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  );
  const vertical = layout.direction === 'TB';
  for (const e of layout.edges) {
    const a = pos.get(e.source);
    const b = pos.get(e.target);
    if (!a || !b) continue;
    const dash =
      e.ended || e.unmarried || (e.linkKind && e.linkKind !== 'biological')
        ? ' stroke-dasharray="5 4"'
        : '';
    let d: string;
    if (vertical) {
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h;
      const x2 = b.x + b.w / 2;
      const y2 = b.y;
      const midY = (y1 + y2) / 2;
      d = `M${x1} ${y1} V${midY} H${x2} V${y2}`;
    } else {
      const x1 = a.x + a.w;
      const y1 = a.y + a.h / 2;
      const x2 = b.x;
      const y2 = b.y + b.h / 2;
      const midX = (x1 + x2) / 2;
      d = `M${x1} ${y1} H${midX} V${y2} H${x2}`;
    }
    parts.push(`<path d="${d}" fill="none" stroke="#52514e" stroke-width="1.5"${dash}/>`);
  }
  for (const u of layout.unions) {
    const p = pos.get(u.id)!;
    parts.push(
      u.solo
        ? `<circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="3" fill="#52514e"/>`
        : `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="#ffffff" stroke="#52514e" stroke-width="1.5"/>`,
    );
  }
  for (const lp of layout.people) {
    const person = analysis.index.person(lp.id);
    const p = pos.get(lp.id)!;
    const holding = analysis.holdingOf.get(lp.id);
    const strokeWidth = owners.has(lp.id) ? 2.5 : 1.2;
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="#ffffff" stroke="#0b0b0b" stroke-width="${strokeWidth}"/>`,
      `<text x="${p.x + 10}" y="${p.y + 22}" font-size="12.5" font-weight="600" fill="#0b0b0b">${esc(truncate(person.name || 'Unnamed', 27))}</text>`,
      `<text x="${p.x + 10}" y="${p.y + 40}" font-size="10" fill="#52514e">${esc(truncate(lifeLine(person), 38))}</text>`,
    );
    const label = owners.has(lp.id)
      ? 'Owner of record'
      : holding
        ? `Holds ${holding.share.toString()}${holding.holder.kind === 'unresolved' ? ' (unresolved)' : ''}`
        : '';
    if (label) {
      parts.push(
        `<text x="${p.x + 10}" y="${p.y + 60}" font-size="11" font-weight="600" fill="#0b0b0b">${esc(label)}</text>`,
      );
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function lifeLine(p: CaseFile['tree']['people'][number]): string {
  const span = lifespan(p);
  if (p.status === 'deceased' && p.deathDate) return `${span} · died ${formatDate(p.deathDate)}`;
  if (p.status === 'living') return span ? `${span} · living` : 'Living';
  if (p.status === 'unknown') return span ? `${span} · status unknown` : 'Status unknown';
  return span;
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
