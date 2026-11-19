import type { Analysis } from '../model/analysis';
import type { CaseFile } from '../model/case';
import { useStore, type Tab } from '../store/store';
import { DocumentsPanel } from './DocumentsPanel';
import { IssuesPanel } from './IssuesPanel';
import { LawPanel } from './LawPanel';
import { PersonPanel } from './PersonPanel';
import { SharesPanel } from './SharesPanel';

export function RightPanel({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const selectedId = useStore((s) => s.selectedId);
  const warnings = analysis.result.issues.filter((i) => i.level !== 'info').length;
  const docsOpen = analysis.checklist.filter((i) => {
    const st = file.documents[i.key]?.status;
    return st !== 'obtained' && st !== 'not-applicable';
  }).length;
  const selected = selectedId ? analysis.index.maybePerson(selectedId) : undefined;

  const tabs: Array<{ id: Tab; label: string; count?: number; warn?: boolean }> = [
    { id: 'shares', label: 'Shares' },
    { id: 'person', label: 'Person' },
    { id: 'documents', label: 'Documents', count: docsOpen },
    { id: 'law', label: 'Law' },
    { id: 'issues', label: 'Review', count: warnings, warn: warnings > 0 },
  ];

  return (
    <aside className="panel panel-right" aria-label="Details">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count ? <span className={`count${t.warn ? ' warn' : ''}`}>{t.count}</span> : null}
          </button>
        ))}
      </div>
      <div
        className="panel-scroll"
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        key={tab === 'person' ? `person:${selectedId}` : tab}
      >
        {tab === 'shares' ? <SharesPanel analysis={analysis} /> : null}
        {tab === 'person' ? (
          selectedId ? (
            <>
              <div className="panel-head">
                <h2>{selected?.name || 'Unnamed person'}</h2>
              </div>
              <PersonPanel file={file} analysis={analysis} personId={selectedId} />
            </>
          ) : (
            <div className="empty">Select someone in the family tree to edit them.</div>
          )
        ) : null}
        {tab === 'documents' ? <DocumentsPanel file={file} analysis={analysis} /> : null}
        {tab === 'law' ? <LawPanel file={file} analysis={analysis} /> : null}
        {tab === 'issues' ? <IssuesPanel analysis={analysis} /> : null}
      </div>
    </aside>
  );
}
