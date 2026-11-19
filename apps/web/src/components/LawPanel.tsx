import { getStateRules } from '@heirmap/intestacy';
import type { Analysis } from '../model/analysis';
import type { CaseFile } from '../model/case';
import { CitationChip } from './SharesPanel';

const CONFIDENCE: Record<string, { label: string; className: string }> = {
  high: { label: 'Checked against statute text', className: 'chip-good' },
  medium: { label: 'Structure confirmed; verify wording', className: 'chip-warn' },
  low: { label: 'Modeled from case law; needs review', className: 'chip-critical' },
};

export function LawPanel({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  const rules = getStateRules(file.property.state);
  const used = new Set(analysis.result.rulesUsed.map((r) => r.id));
  const counts = new Map<string, number>();
  for (const e of analysis.result.estates) {
    if (e.ruleVersion) counts.set(e.ruleVersion.id, (counts.get(e.ruleVersion.id) ?? 0) + 1);
  }
  const versions = [...rules.versions].reverse();
  return (
    <div>
      <div className="section">
        <p className="small" style={{ margin: 0 }}>
          Land passes under the intestacy law of <strong>{rules.name}</strong>, where it sits. Each
          death uses the version of the statute in force on the date of death. Versions used in this
          case are outlined.
        </p>
      </div>
      <div className="section">
        {versions.map((v, i) => {
          const next = versions[i - 1];
          const conf = CONFIDENCE[v.confidence]!;
          return (
            <article className={`rule-card${used.has(v.id) ? ' used' : ''}`} key={v.id}>
              <div className="row wrap" style={{ marginBottom: 6 }}>
                <span className="chip">{v.id}</span>
                <span className={`chip ${conf.className}`}>{conf.label}</span>
                {used.has(v.id) ? (
                  <span className="chip chip-brand">
                    Used for {counts.get(v.id)} death{counts.get(v.id) === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <h4>{v.title}</h4>
              <div className="small muted">
                Deaths from {v.effectiveFrom}
                {next ? ` to the day before ${next.effectiveFrom}` : ' to the present'} · survival
                period{' '}
                {v.survival.hours ? `${v.survival.hours} hours` : 'none (simultaneous deaths only)'}
              </div>
              <p className="small" style={{ margin: '8px 0' }}>
                {v.summary}
              </p>
              <div>
                {v.sources.map((c, j) => (
                  <CitationChip key={j} c={c} />
                ))}
              </div>
              {v.notes.length ? (
                <ul>
                  {v.notes.map((n, j) => (
                    <li key={j}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="section small">
        <h3>Also in {rules.name}</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {rules.caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
          <li>
            Escheat: <CitationChip c={rules.escheat} />
          </li>
          {rules.commonLawCitation ? (
            <li>
              Common-law marriage: <CitationChip c={rules.commonLawCitation} />
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
