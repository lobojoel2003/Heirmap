import { STATES, STATE_CODES } from '@heirmap/intestacy';
import { useState } from 'react';
import { FULL_VERSION } from '../build';
import { useStore } from '../store/store';
import { IconFile, IconLock, IconPie, IconScale, IconTree, IconUpload, Logo } from './Icons';
import { NewCaseDialog } from './NewCaseDialog';
import { useImportCase } from './useImportCase';

function HeroArt() {
  // Illustrative only: the owner, four children, and the resulting split.
  const kids = [
    { y: 18, label: 'Ruth · d. 1990' },
    { y: 66, label: 'Mae · d. 2008' },
    { y: 114, label: 'Lucius · d. 2011' },
    { y: 162, label: 'Lena · d. 2020' },
  ];
  const r = 58;
  const cx = 360;
  const cy = 98;
  const parts = [0.25, 0.125, 0.25, 0.1, 0.275];
  let a = 0;
  const slices = parts.map((p, i) => {
    const a0 = a;
    a += p * Math.PI * 2;
    const large = a - a0 > Math.PI ? 1 : 0;
    const d = `M${cx} ${cy} L${cx + r * Math.sin(a0)} ${cy - r * Math.cos(a0)} A${r} ${r} 0 ${large} 1 ${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)} Z`;
    return (
      <path key={i} d={d} fill={`var(--series-${i + 1})`} stroke="var(--surface)" strokeWidth="2" />
    );
  });
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 440 210" width="100%">
        <g stroke="var(--ink-3)" strokeWidth="1.5" fill="none">
          <path d="M122 105 H138 M138 33 V177" />
          {kids.map((k) => (
            <path key={k.y} d={`M138 ${k.y + 15} H152`} />
          ))}
        </g>
        <rect
          x="8"
          y="90"
          width="114"
          height="30"
          rx="7"
          fill="var(--brand-soft)"
          stroke="var(--brand)"
        />
        <text x="18" y="109" fontSize="11" fontWeight="700" fill="var(--ink)">
          Owner · d. 1958
        </text>
        {kids.map((k) => (
          <g key={k.y}>
            <rect
              x="152"
              y={k.y}
              width="122"
              height="30"
              rx="7"
              fill="var(--surface)"
              stroke="var(--border)"
            />
            <text x="162" y={k.y + 19} fontSize="11" fontWeight="600" fill="var(--ink)">
              {k.label}
            </text>
          </g>
        ))}
        <path d="M282 105 H292" stroke="var(--ink-3)" strokeWidth="1.5" markerEnd="" />
        <path d="M288 100 L294 105 L288 110" stroke="var(--ink-3)" strokeWidth="1.5" fill="none" />
        {slices}
        <text x={cx} y="182" fontSize="11" fill="var(--ink-2)" textAnchor="middle">
          1/4 · 1/8 · 7/72 · 11/180 …
        </text>
        <text x={cx} y="198" fontSize="10.5" fill="var(--muted)" textAnchor="middle">
          each share linked to its statute
        </text>
      </svg>
    </div>
  );
}

export function Welcome() {
  const cases = useStore((s) => s.cases);
  const openCase = useStore((s) => s.openCase);
  const loadSample = useStore((s) => s.loadSample);
  const [showNew, setShowNew] = useState(false);
  const importFile = useImportCase();
  const list = Object.values(cases).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <main className="welcome">
      <div className="welcome-inner">
        <div className="row" style={{ marginBottom: 36 }}>
          <Logo size={34} />
          <strong style={{ fontSize: 20 }}>Heirmap</strong>
          <span className="chip" style={{ marginLeft: 'auto' }}>
            <IconLock size={12} /> Private: runs on your device
          </span>
        </div>
        <section className="hero">
          <div>
            <h1>Untangle heirs’ property titles.</h1>
            <p className="lead">
              When land passes without a will, every heir becomes a co-owner. Heirmap walks your
              family forward from the owner on the deed, applies the intestacy statute in force on
              each date of death, and shows each heir’s exact share, with the statute behind every
              fraction.
            </p>
            <div className="row wrap">
              <button className="btn btn-primary btn-lg" onClick={() => setShowNew(true)}>
                Start a new case
              </button>
              <button className="btn btn-lg" onClick={loadSample}>
                Explore a sample family
              </button>
              <button className="btn btn-lg btn-ghost" onClick={importFile}>
                <IconUpload /> Open a case file
              </button>
            </div>
          </div>
          <HeroArt />
        </section>

        {list.length ? (
          <section className="case-list" aria-label="Your cases">
            <h2>Your cases on this device</h2>
            {list.map((c) => (
              <div className="case-card" key={c.id}>
                <IconMap />
                <div>
                  <strong>{c.title}</strong>
                  <div className="small muted">
                    {STATES[c.property.state].name}
                    {c.property.county ? ` · ${c.property.county} County` : ''} ·{' '}
                    {c.tree.people.length} people · edited {c.updatedAt.slice(0, 10)}
                  </div>
                </div>
                <button
                  className="btn"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => openCase(c.id)}
                >
                  Open
                </button>
              </div>
            ))}
          </section>
        ) : null}

        <section className="features">
          <div className="feature">
            <span className="icon">
              <IconTree />
            </span>
            <h3>Guided family tree</h3>
            <p>
              Start with the owner of record and answer one question at a time: marriages, children,
              dates of death. Heirmap asks only what the law needs.
            </p>
          </div>
          <div className="feature">
            <span className="icon">
              <IconScale />
            </span>
            <h3>The right statute for each death</h3>
            <p>
              An open rules engine with dated versions for{' '}
              {STATE_CODES.map((c) => STATES[c].name).join(', ')}. Every fraction links to its
              statute so an attorney can check it.
            </p>
          </div>
          <div className="feature">
            <span className="icon">
              <IconPie />
            </span>
            <h3>Shares, charts and checklists</h3>
            <p>
              See who owns what today or at any point in the past, then print a family chart for an
              affidavit of heirship and a list of the records still needed.
            </p>
          </div>
        </section>

        <div className="disclaimer">
          <strong>Heirmap is a research aid, not legal advice.</strong> Families should have a
          licensed attorney or legal aid office review the results before acting on them. Cases are
          saved in this browser’s storage and never leave your device unless you export them.{' '}
          <span className="muted">
            <IconFile size={12} /> v{FULL_VERSION}
          </span>
        </div>
      </div>
      {showNew ? <NewCaseDialog onClose={() => setShowNew(false)} /> : null}
    </main>
  );
}

function IconMap() {
  return (
    <span
      className="feature"
      style={{
        padding: 8,
        border: 0,
        background: 'var(--brand-soft)',
        color: 'var(--brand)',
        borderRadius: 8,
        display: 'inline-flex',
      }}
    >
      <IconTree />
    </span>
  );
}
