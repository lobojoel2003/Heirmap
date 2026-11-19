import type { Analysis } from '../model/analysis';
import { useStore } from '../store/store';
import { CitationChip } from './SharesPanel';

export function IssuesPanel({ analysis }: { analysis: Analysis }) {
  const select = useStore((s) => s.select);
  const issues = analysis.result.issues;
  if (issues.length === 0) return <div className="empty">Nothing to review.</div>;
  return (
    <div className="section">
      {issues.map((issue, i) => (
        <div key={i} className={`issue ${issue.level}`}>
          <span className="icon" aria-label={issue.level}>
            {issue.level === 'info' ? 'i' : '!'}
          </span>
          <div>
            <div>{issue.message}</div>
            <div className="row wrap" style={{ marginTop: 4 }}>
              {issue.citation ? <CitationChip c={issue.citation} /> : null}
              {(issue.personIds ?? []).slice(0, 3).map((id) => (
                <button key={id} className="btn btn-sm btn-ghost" onClick={() => select(id)}>
                  {analysis.index.name(id)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
