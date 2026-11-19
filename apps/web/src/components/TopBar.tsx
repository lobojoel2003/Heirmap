import { useEffect, useState } from 'react';
import { analyze } from '../model/analysis';
import type { CaseFile } from '../model/case';
import { caseJSON, download, familyChartSVG, sharesCSV, slug } from '../model/exporters';
import { layoutFamily } from '../model/layout';
import { useStore } from '../store/store';
import { AboutDialog } from './AboutDialog';
import { IconChevron, IconDownload, IconInfo, IconLock, IconRedo, IconUndo, Logo } from './Icons';
import { Menu } from './Menu';
import { NewCaseDialog } from './NewCaseDialog';
import { useImportCase } from './useImportCase';

function CaseTitle({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [draft, setDraft] = useState(title);
  return (
    <input
      className="case-title"
      value={draft}
      aria-label="Case name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() && draft !== title && onRename(draft.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function TopBar({ file }: { file: CaseFile }) {
  const s = useStore();
  const [showNew, setShowNew] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const importFile = useImportCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  const cases = Object.values(s.cases).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const base = slug(file.title);

  return (
    <header className="topbar">
      <button className="brand" onClick={() => s.openCase(null)} aria-label="Heirmap home">
        <Logo />
        Heirmap
      </button>
      <CaseTitle key={`${file.id}:${file.title}`} title={file.title} onRename={s.renameCase} />
      <Menu
        align="left"
        buttonClass="btn btn-ghost btn-sm"
        label={
          <>
            Cases <IconChevron size={13} />
          </>
        }
      >
        {(close) => (
          <>
            <div className="menu-label">On this device</div>
            {cases.map((c) => (
              <button
                key={c.id}
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  s.openCase(c.id);
                  close();
                }}
              >
                <span>
                  {c.id === file.id ? '• ' : ''}
                  {c.title}
                  <small>
                    {c.property.state} · {c.tree.people.length} people · edited{' '}
                    {c.updatedAt.slice(0, 10)}
                  </small>
                </span>
              </button>
            ))}
            <div className="menu-sep" />
            <button
              className="menu-item"
              role="menuitem"
              onClick={() => (setShowNew(true), close())}
            >
              New case…
            </button>
            <button className="menu-item" role="menuitem" onClick={() => (importFile(), close())}>
              Open a case file…
            </button>
            <button className="menu-item" role="menuitem" onClick={() => (s.loadSample(), close())}>
              Open the sample family
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item btn-danger"
              role="menuitem"
              onClick={() => {
                close();
                if (
                  window.confirm(
                    `Delete “${file.title}” from this device? Export it first if you want to keep a copy.`,
                  )
                ) {
                  s.deleteCase(file.id);
                }
              }}
            >
              Delete this case…
            </button>
          </>
        )}
      </Menu>
      <div className="row" style={{ gap: 2 }}>
        <button
          className="btn btn-ghost icon-btn"
          onClick={s.undo}
          disabled={s.history.past.length === 0}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          <IconUndo />
        </button>
        <button
          className="btn btn-ghost icon-btn"
          onClick={s.redo}
          disabled={s.history.future.length === 0}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
        >
          <IconRedo />
        </button>
      </div>
      <div className="spacer" />
      <span
        className="saved-note"
        title="Cases are stored in this browser only. Nothing is uploaded."
      >
        <IconLock size={13} /> Saved on this device only
      </span>
      <Menu
        label={
          <>
            <IconDownload size={14} /> Export <IconChevron size={13} />
          </>
        }
      >
        {(close) => {
          const a = analyze(file);
          return (
            <>
              <button
                className="menu-item"
                role="menuitem"
                onClick={() => (s.setReport('chart'), close())}
              >
                <span>
                  Family chart for an affidavit of heirship
                  <small>Printable chart, heirs table and chain of title (save as PDF)</small>
                </span>
              </button>
              <button
                className="menu-item"
                role="menuitem"
                onClick={() => (s.setReport('checklist'), close())}
              >
                <span>
                  Document checklist
                  <small>Deeds, death certificates and records still needed</small>
                </span>
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  download(
                    `${base}-family-chart.svg`,
                    familyChartSVG(file, a, layoutFamily(file.tree)),
                    'image/svg+xml',
                  );
                  close();
                }}
              >
                <span>
                  Family chart (SVG)
                  <small>Vector image for documents</small>
                </span>
              </button>
              <button
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  download(`${base}-shares.csv`, sharesCSV(file, a), 'text/csv');
                  close();
                }}
              >
                <span>
                  Shares (CSV)
                  <small>Every heir, fraction, percent and statute</small>
                </span>
              </button>
              <button
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  download(`${base}.heirmap.json`, caseJSON(file), 'application/json');
                  close();
                }}
              >
                <span>
                  Case file (JSON)
                  <small>Back up or move this case to another device</small>
                </span>
              </button>
            </>
          );
        }}
      </Menu>
      <button
        className="btn btn-ghost icon-btn"
        aria-label="About Heirmap"
        onClick={() => setShowAbout(true)}
      >
        <IconInfo />
      </button>
      {showNew ? <NewCaseDialog onClose={() => setShowNew(false)} /> : null}
      {showAbout ? <AboutDialog onClose={() => setShowAbout(false)} /> : null}
    </header>
  );
}
