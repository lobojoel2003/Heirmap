import type { DocumentCategory } from '@heirmap/intestacy';
import type { Analysis } from '../model/analysis';
import type { CaseFile, DocStatus } from '../model/case';
import {
  DOC_STATUS_LABEL,
  checklistCSV,
  checklistMarkdown,
  download,
  slug,
} from '../model/exporters';
import { useStore } from '../store/store';
import { IconDownload, IconPrint } from './Icons';

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  deed: 'Deeds and land records',
  death: 'Death certificates',
  probate: 'Probate records',
  marriage: 'Marriages',
  divorce: 'Divorces',
  adoption: 'Adoptions',
  paternity: 'Paternity',
  research: 'Research',
  identity: 'Current heirs',
  affidavit: 'Affidavit of heirship',
};

export function DocumentsPanel({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  const setDocument = useStore((s) => s.setDocument);
  const setReport = useStore((s) => s.setReport);
  const items = analysis.checklist;
  const done = items.filter((i) => {
    const st = file.documents[i.key]?.status;
    return st === 'obtained' || st === 'not-applicable';
  }).length;

  return (
    <div>
      <div className="section stack">
        <div className="row">
          <strong>
            {done} of {items.length} documents in hand
          </strong>
        </div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
        <div className="row wrap">
          <button className="btn btn-sm" onClick={() => setReport('checklist')}>
            <IconPrint size={13} /> Print checklist
          </button>
          <button
            className="btn btn-sm"
            onClick={() =>
              download(
                `${slug(file.title)}-checklist.csv`,
                checklistCSV(file, analysis),
                'text/csv',
              )
            }
          >
            <IconDownload size={13} /> CSV
          </button>
          <button
            className="btn btn-sm"
            onClick={() =>
              download(
                `${slug(file.title)}-checklist.md`,
                checklistMarkdown(file, analysis),
                'text/markdown',
              )
            }
          >
            <IconDownload size={13} /> Markdown
          </button>
        </div>
      </div>
      <div className="section" style={{ paddingTop: 4 }}>
        {items.map((item, i) => {
          const state = file.documents[item.key];
          const status = state?.status ?? 'needed';
          const header =
            i === 0 || items[i - 1]!.category !== item.category
              ? CATEGORY_LABEL[item.category]
              : null;
          return (
            <div key={item.key}>
              {header ? <h3 style={{ marginTop: 14, marginBottom: 2 }}>{header}</h3> : null}
              <div
                className={`doc-item${status === 'obtained' || status === 'not-applicable' ? ' done' : ''}`}
              >
                <span className="title">{item.title}</span>
                <select
                  value={status}
                  aria-label={`Status of ${item.title}`}
                  onChange={(e) =>
                    setDocument(item.key, { ...state, status: e.target.value as DocStatus })
                  }
                >
                  {(Object.keys(DOC_STATUS_LABEL) as DocStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {DOC_STATUS_LABEL[k]}
                    </option>
                  ))}
                </select>
                <span className="reason">{item.reason}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
