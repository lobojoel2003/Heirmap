import { STATES, formatDate } from '@heirmap/intestacy';
import { useMemo } from 'react';
import type { Analysis } from '../model/analysis';
import type { CaseFile } from '../model/case';
import { guideProgress, guideSteps } from '../model/guide';
import { useStore } from '../store/store';
import { IconCheck, IconMap } from './Icons';
import { useGuideActions } from './useGuideActions';

export function GuidePanel({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  const steps = useMemo(() => guideSteps(file, analysis), [file, analysis]);
  const progress = guideProgress(file, steps);
  const run = useGuideActions();
  const select = useStore((s) => s.select);
  const setPropertyOpen = useStore((s) => s.setPropertyOpen);
  const owner = file.property.owners[0]
    ? analysis.index.maybePerson(file.property.owners[0].personId)
    : undefined;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;

  return (
    <aside className="panel panel-left" aria-label="Guided builder">
      <div className="panel-head">
        <h2>Guided builder</h2>
        <p>Work forward from the owner of record, one generation at a time.</p>
      </div>
      <div className="panel-scroll">
        <div className="section">
          <button
            className="property-card btn-ghost"
            style={{ width: '100%', textAlign: 'left', border: 0, cursor: 'pointer' }}
            onClick={() => setPropertyOpen(true)}
          >
            <span className="row small muted">
              <IconMap size={14} /> The land · {STATES[file.property.state].name}
            </span>
            <strong>{file.property.name}</strong>
            <span className="small">
              {[
                file.property.county && `${file.property.county} County`,
                file.property.parcelId && `Parcel ${file.property.parcelId}`,
                file.property.acreage && `${file.property.acreage} acres`,
              ]
                .filter(Boolean)
                .join(' · ') || 'Add county and parcel'}
            </span>
            {owner ? (
              <span className="small">
                Owner of record: <strong>{owner.name}</strong>
                {owner.deathDate ? ` (d. ${formatDate(owner.deathDate)})` : ''}
              </span>
            ) : null}
          </button>
        </div>
        <div className="section stack">
          <div className="row small">
            <strong>
              {steps.length === 0
                ? 'Family research complete'
                : `${steps.length} question${steps.length === 1 ? '' : 's'} left`}
            </strong>
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {pct}%
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Research progress"
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          {steps.length === 0 ? (
            <div className="guide-step">
              <h4 className="row">
                <IconCheck size={16} /> Every estate in the chain has been researched
              </h4>
              <p>
                Review the shares and the statutes behind them, then export the family chart and the
                document checklist.
              </p>
            </div>
          ) : null}
          {steps.map((step, i) => {
            const genLabel =
              i === 0 || steps[i - 1]!.generation !== step.generation
                ? step.generation < 0
                  ? 'The land'
                  : step.generation === 0
                    ? 'Owner of record'
                    : `Generation ${step.generation}`
                : null;
            return (
              <div key={step.id}>
                {genLabel ? <div className="guide-gen">{genLabel}</div> : null}
                <div className={`guide-step${i === 0 ? ' current' : ''}`}>
                  <h4>{step.title}</h4>
                  <p>{step.detail}</p>
                  <div className="row wrap">
                    {step.actions.map((a) => (
                      <button
                        key={a.label}
                        className={`btn btn-sm${a.primary ? ' btn-primary' : ''}`}
                        onClick={() => run(a.action)}
                      >
                        {a.label}
                      </button>
                    ))}
                    {step.personId ? (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => select(step.personId!)}
                      >
                        Show
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
