import {
  commonDenominator,
  formatDate,
  recipientKey,
  type Citation,
  type Holding,
  type TransferStep,
} from '@heirmap/intestacy';
import { useMemo, useState, type PointerEvent } from 'react';
import { holderLabel, slotColor, type Analysis } from '../model/analysis';
import { holderStatus } from '../model/exporters';
import { useStore } from '../store/store';
import { useCurrentAnalysis } from '../useAnalysis';
import { IconChevron, IconExternal } from './Icons';

export function CitationChip({ c }: { c: Citation }) {
  const text = `${c.code} ${c.section}`.trim();
  return c.url ? (
    <a className="cite" href={c.url} target="_blank" rel="noreferrer" title={c.title}>
      {text} <IconExternal size={11} />
    </a>
  ) : (
    <span className="cite" title={c.title}>
      {text}
    </span>
  );
}

interface Slice {
  key: string;
  holding: Holding;
  label: string;
  color: string;
  unresolved: boolean;
  start: number;
  end: number;
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.sin(a0);
  const y0 = cy - r * Math.cos(a0);
  const x1 = cx + r * Math.sin(a1);
  const y1 = cy - r * Math.cos(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

function SharePie({
  slices,
  active,
  onPick,
}: {
  slices: Slice[];
  active: string | null;
  onPick: (key: string) => void;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; slice: Slice } | null>(null);
  const size = 180;
  const r = 86;
  const c = size / 2;
  const move = (e: PointerEvent, slice: Slice) =>
    setTip({ x: e.clientX + 14, y: e.clientY + 14, slice });
  return (
    <>
      <svg
        className="pie"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Pie chart of current fractional shares"
      >
        <defs>
          <pattern
            id="hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="var(--surface-3)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--series-unresolved)" strokeWidth="3" />
          </pattern>
        </defs>
        {slices.length === 1 ? (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill={slices[0]!.unresolved ? 'url(#hatch)' : slices[0]!.color}
            tabIndex={0}
            aria-label={`${slices[0]!.label}: ${slices[0]!.holding.share.toString()}`}
            onClick={() => onPick(slices[0]!.key)}
            onPointerMove={(e) => move(e, slices[0]!)}
            onPointerLeave={() => setTip(null)}
          />
        ) : (
          slices.map((s) => (
            <path
              key={s.key}
              d={arcPath(c, c, r, s.start, s.end)}
              fill={s.unresolved ? 'url(#hatch)' : s.color}
              className={active && active !== s.key ? 'dim' : ''}
              tabIndex={0}
              role="button"
              aria-label={`${s.label}: ${s.holding.share.toString()} (${s.holding.share.toPercent(1)})`}
              onClick={() => onPick(s.key)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(s.key)}
              onPointerMove={(e) => move(e, s)}
              onPointerLeave={() => setTip(null)}
              onFocus={(e) => {
                const box = (e.target as SVGPathElement).getBoundingClientRect();
                setTip({ x: box.right + 6, y: box.top, slice: s });
              }}
              onBlur={() => setTip(null)}
            />
          ))
        )}
      </svg>
      {tip ? (
        <div className="viz-tooltip" style={{ left: tip.x, top: tip.y }} role="status">
          <strong>{tip.slice.label}</strong>
          {tip.slice.holding.share.toString()} · {tip.slice.holding.share.toPercent(2)}
        </div>
      ) : null}
    </>
  );
}

function StepView({ step, analysis }: { step: TransferStep; analysis: Analysis }) {
  const name = (id?: string) => (id ? analysis.index.name(id) : '');
  const to = step.to.kind === 'escheat' ? `State of ${step.to.state}` : name(step.to.personId);
  const quote = step.citations.find((c) => c.quote)?.quote;
  let what: string;
  if (step.basis === 'deed')
    what = `${to} takes title to ${step.amount.n === step.amount.d ? 'the whole property' : `${step.amount.toString()} of the property`}`;
  else if (step.basis === 'survivorship')
    what = `${name(step.fromId)} died; ${to} takes by survivorship`;
  else
    what = `${name(step.fromId)} died; ${to} (${step.role}) receives ${step.fraction.toString()} of that interest = ${step.amount.toString()} of the property`;
  return (
    <div className="chain-step">
      <div className="when">
        {step.date ? formatDate(step.date) : 'Deed'}
        {step.ruleVersionId ? ` · ${step.ruleVersionId}` : ''}
        {step.basis === 'will' ? ' · by will' : ''}
      </div>
      <div className="what">{what}</div>
      <div className="why">{step.explanation}</div>
      {quote ? <div className="quote">“{quote}”</div> : null}
      <div>
        {step.citations.map((c, i) => (
          <CitationChip key={i} c={c} />
        ))}
      </div>
    </div>
  );
}

export function Provenance({ holding, analysis }: { holding: Holding; analysis: Analysis }) {
  const paths = useMemo(
    () => [...holding.paths].sort((a, b) => b.amount.compare(a.amount)),
    [holding.paths],
  );
  const [openLine, setOpenLine] = useState(0);
  const route = (p: (typeof paths)[number]) =>
    p.steps
      .map((s) =>
        s.to.kind === 'escheat' ? `State of ${s.to.state}` : analysis.index.name(s.to.personId),
      )
      .join(' → ');
  if (paths.length === 1) {
    return (
      <div className="chain">
        {paths[0]!.steps.map((s, j) => (
          <StepView key={j} step={s} analysis={analysis} />
        ))}
      </div>
    );
  }
  return (
    <div className="chain">
      <p className="small muted" style={{ marginTop: 0 }}>
        This share arrived by {paths.length} lines of inheritance. Select one to see each step and
        its statute.
      </p>
      {paths.map((p, i) => (
        <div className="chain-path" key={i}>
          <button
            className="btn btn-ghost btn-sm"
            style={{
              width: '100%',
              justifyContent: 'space-between',
              whiteSpace: 'normal',
              textAlign: 'left',
            }}
            aria-expanded={openLine === i}
            onClick={() => setOpenLine(openLine === i ? -1 : i)}
          >
            <span>{route(p)}</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{p.amount.toString()}</strong>
          </button>
          {openLine === i ? (
            <div style={{ marginTop: 8 }}>
              {p.steps.map((s, j) => (
                <StepView key={j} step={s} analysis={analysis} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Timeline() {
  const current = useCurrentAnalysis();
  const asOf = useStore((s) => s.asOf);
  const setAsOf = useStore((s) => s.setAsOf);
  const events = useMemo(() => {
    if (!current) return [];
    const seen = new Map<string, string[]>();
    for (const e of current.result.estates) {
      const list = seen.get(e.date) ?? [];
      list.push(current.index.name(e.decedentId));
      seen.set(e.date, list);
    }
    return [...seen.entries()].map(([date, names]) => ({ date, names }));
  }, [current]);
  if (events.length < 2) return null;
  const idx = asOf
    ? Math.max(
        0,
        events.findIndex((e) => e.date === asOf),
      )
    : events.length;
  const label =
    idx >= events.length
      ? 'Today'
      : `${formatDate(events[idx]!.date)} — after the death of ${events[idx]!.names.join(' and ')}`;
  return (
    <div className="section timeline">
      <div className="row">
        <h3 style={{ margin: 0 }}>Timeline</h3>
        <span className="small muted" style={{ marginLeft: 'auto' }}>
          {idx + 1 > events.length ? events.length : idx + 1} of {events.length} deaths
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={events.length}
        value={idx}
        aria-label="Show ownership as of a date in the chain of title"
        aria-valuetext={label}
        onChange={(e) => {
          const i = Number(e.target.value);
          setAsOf(i >= events.length ? null : events[i]!.date);
        }}
      />
      <div className="small">
        <strong>Ownership on:</strong> {label}
      </div>
    </div>
  );
}

export function SharesPanel({ analysis }: { analysis: Analysis }) {
  const [open, setOpen] = useState<string | null>(null);
  const [lcdView, setLcdView] = useState(false);
  const select = useStore((s) => s.select);
  const { result, branches, branchOf } = analysis;

  const branchColor = useMemo(
    () => new Map(branches.map((b) => [b.id, slotColor(b.slot)])),
    [branches],
  );
  const branchRank = useMemo(() => new Map(branches.map((b, i) => [b.id, i])), [branches]);

  const ordered = useMemo(() => {
    return [...result.holdings].sort((a, b) => {
      const ra = branchRank.get(branchOf.get(recipientKey(a.holder)) ?? '') ?? 99;
      const rb = branchRank.get(branchOf.get(recipientKey(b.holder)) ?? '') ?? 99;
      return ra - rb || b.share.compare(a.share);
    });
  }, [result.holdings, branchOf, branchRank]);

  const slices = useMemo(() => {
    const total = result.total.toNumber() || 1;
    const out: Slice[] = [];
    for (const h of ordered) {
      const key = recipientKey(h.holder);
      const start = out.at(-1)?.end ?? 0;
      out.push({
        key,
        holding: h,
        label: holderLabel(analysis, h),
        color: branchColor.get(branchOf.get(key) ?? '') ?? 'var(--series-other)',
        unresolved: h.holder.kind === 'unresolved',
        start,
        end: start + (h.share.toNumber() / total) * Math.PI * 2,
      });
    }
    return out;
  }, [ordered, result.total, analysis, branchColor, branchOf]);

  const ranked = useMemo(
    () => [...result.holdings].sort((a, b) => b.share.compare(a.share)),
    [result.holdings],
  );
  const lcd = useMemo(
    () => commonDenominator(result.holdings.map((h) => h.share)),
    [result.holdings],
  );
  const largest = ranked[0]?.share.toNumber() ?? 1;
  const people = result.holdings.filter((h) => h.holder.kind === 'person').length;
  const unresolved = result.holdings.filter((h) => h.holder.kind === 'unresolved');

  if (result.holdings.length === 0) {
    return <div className="empty">Choose the owner of record to see the shares.</div>;
  }

  const fmt = (h: Holding) =>
    lcdView ? `${(h.share.n * lcd) / h.share.d}/${lcd}` : h.share.toString();

  return (
    <div>
      <div className="section">
        <div className="kpis">
          <div className="kpi">
            <div className="label">Heirs holding title</div>
            <div className="value">{people}</div>
          </div>
          <div className="kpi">
            <div className="label">Smallest share</div>
            <div className="value">{ranked.at(-1)?.share.toString()}</div>
          </div>
          <div className="kpi">
            <div className="label">Unresolved</div>
            <div className="value">{unresolved.length ? unresolved.length : '—'}</div>
          </div>
        </div>
      </div>
      <Timeline />
      <div className="section">
        <h3>Who owns the land{result.asOf ? ` on ${formatDate(result.asOf)}` : ' today'}</h3>
        <div className="pie-wrap">
          <SharePie slices={slices} active={open} onPick={(k) => setOpen(k)} />
          <div className="legend" aria-label="Family branches">
            {branches.map((b) => (
              <div className="legend-item" key={b.id}>
                <span
                  className={`swatch${b.slot === -2 ? ' hatch' : ''}`}
                  style={{ background: slotColor(b.slot) }}
                />
                <span>{b.label}</span>
                <span className="value">{b.share.toString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="section">
        <div className="row" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Shares, largest first</h3>
          <label className="check small" style={{ marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={lcdView}
              onChange={(e) => setLcdView(e.target.checked)}
            />
            Common denominator
          </label>
        </div>
        <ul className="share-list">
          {ranked.map((h) => {
            const key = recipientKey(h.holder);
            const color = branchColor.get(branchOf.get(key) ?? '') ?? 'var(--series-other)';
            const isOpen = open === key;
            const unresolvedRow = h.holder.kind === 'unresolved';
            return (
              <li className="share-row" key={key}>
                <button
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : key)}
                  onDoubleClick={() => h.holder.kind !== 'escheat' && select(h.holder.personId)}
                >
                  <span
                    className={`swatch${unresolvedRow ? ' hatch' : ''}`}
                    style={{ background: color }}
                  />
                  <span className="who">{holderLabel(analysis, h)}</span>
                  <span className="amount">
                    <strong>{fmt(h)}</strong>
                    <span>{h.share.toPercent(2)}</span>
                  </span>
                  <span className="rel">
                    {h.holder.kind === 'escheat'
                      ? 'No heirs found'
                      : `${analysis.relationOf(h.holder.personId)}${unresolvedRow ? ` · ${holderStatus(analysis, h)}` : ''}`}
                    <IconChevron
                      size={12}
                      style={{
                        verticalAlign: -2,
                        marginLeft: 4,
                        transform: isOpen ? 'rotate(180deg)' : undefined,
                      }}
                    />
                  </span>
                  <span className="bar" aria-hidden="true">
                    <span
                      className={unresolvedRow ? 'hatch' : ''}
                      style={{
                        width: `${(h.share.toNumber() / largest) * 100}%`,
                        background: color,
                      }}
                    />
                  </span>
                </button>
                {isOpen ? (
                  <div>
                    <Provenance holding={h} analysis={analysis} />
                    {h.holder.kind !== 'escheat' ? (
                      <div style={{ margin: '0 0 12px 22px' }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => h.holder.kind !== 'escheat' && select(h.holder.personId)}
                        >
                          Open {holderLabel(analysis, h)}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="small muted">
          Total: {result.total.toString()} · Common denominator {lcd.toString()}. Click a share to
          see the chain of title and the statute behind every step.
        </p>
      </div>
    </div>
  );
}
