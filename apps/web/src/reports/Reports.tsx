import { STATES, formatDate } from '@heirmap/intestacy';
import { useMemo } from 'react';
import { FULL_VERSION } from '../build';
import { holderLabel, type Analysis } from '../model/analysis';
import type { CaseFile } from '../model/case';
import { DOC_STATUS_LABEL, download, familyChartSVG, holderStatus, slug } from '../model/exporters';
import { layoutFamily } from '../model/layout';
import { useStore } from '../store/store';
import { IconDownload, IconPrint, IconX } from '../components/Icons';

function ReportShell({
  title,
  children,
  onSvg,
}: {
  title: string;
  children: React.ReactNode;
  onSvg?: () => void;
}) {
  const setReport = useStore((s) => s.setReport);
  return (
    <div className="report" role="dialog" aria-label={title}>
      <div className="report-bar">
        <strong>{title}</strong>
        <span className="spacer" style={{ flex: 1 }} />
        {onSvg ? (
          <button className="btn btn-sm" onClick={onSvg}>
            <IconDownload size={13} /> Chart as SVG
          </button>
        ) : null}
        <button className="btn btn-sm btn-primary" onClick={() => window.print()}>
          <IconPrint size={13} /> Print or save as PDF
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setReport(null)}
          aria-label="Close report"
        >
          <IconX size={14} /> Close
        </button>
      </div>
      <div className="paper">{children}</div>
    </div>
  );
}

function PropertyMeta({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  const p = file.property;
  const owners = p.owners.map((o) => analysis.index.name(o.personId)).join(' and ');
  return (
    <div className="meta">
      <div>
        <strong>Property:</strong> {p.name}
      </div>
      <div>
        <strong>State / county:</strong> {STATES[p.state].name}
        {p.county ? `, ${p.county} County` : ''}
      </div>
      <div>
        <strong>Parcel:</strong> {p.parcelId || '—'}
        {p.acreage ? ` · ${p.acreage} acres` : ''}
      </div>
      <div>
        <strong>Vesting deed:</strong> {p.deedReference || '—'}
        {p.deedDate ? ` (${formatDate(p.deedDate)})` : ''}
      </div>
      <div>
        <strong>Owner of record:</strong> {owners || '—'}
      </div>
      <div>
        <strong>Prepared:</strong> {formatDate(new Date().toISOString().slice(0, 10))}
      </div>
      {p.legalDescription ? (
        <div style={{ gridColumn: '1 / -1' }}>
          <strong>Legal description:</strong> {p.legalDescription}
        </div>
      ) : null}
    </div>
  );
}

export function FamilyChartReport({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  const layout = useMemo(() => layoutFamily(file.tree), [file.tree]);
  const svg = useMemo(() => familyChartSVG(file, analysis, layout), [file, analysis, layout]);
  const { result } = analysis;
  return (
    <ReportShell
      title="Family chart for an affidavit of heirship"
      onSvg={() => download(`${slug(file.title)}-family-chart.svg`, svg, 'image/svg+xml')}
    >
      <h1>Family Chart and Heirship Determination</h1>
      <div style={{ color: '#52514e' }}>Exhibit to Affidavit of Heirship</div>
      <PropertyMeta file={file} analysis={analysis} />

      <h2>Family chart</h2>
      <div className="chart-box" dangerouslySetInnerHTML={{ __html: svg }} />

      <h2>Heirs and their fractional interests</h2>
      <table>
        <thead>
          <tr>
            <th>Heir</th>
            <th>Relationship to owner of record</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Undivided interest</th>
            <th style={{ textAlign: 'right' }}>Percent</th>
          </tr>
        </thead>
        <tbody>
          {result.holdings.map((h, i) => (
            <tr key={i}>
              <td>{holderLabel(analysis, h)}</td>
              <td>{h.holder.kind === 'escheat' ? '—' : analysis.relationOf(h.holder.personId)}</td>
              <td>{holderStatus(analysis, h)}</td>
              <td className="num">{h.share.toString()}</td>
              <td className="num">{h.share.toPercent(3)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3}>
              <strong>Total</strong>
            </td>
            <td className="num">
              <strong>{result.total.toString()}</strong>
            </td>
            <td className="num">{result.total.toPercent(1)}</td>
          </tr>
        </tbody>
      </table>

      <h2>Chain of title by death</h2>
      <table>
        <thead>
          <tr>
            <th>Decedent</th>
            <th>Date of death</th>
            <th>Interest held</th>
            <th>Law applied</th>
            <th>Passed to</th>
          </tr>
        </thead>
        <tbody>
          {result.estates.map((e) => (
            <tr key={e.decedentId}>
              <td>{analysis.index.name(e.decedentId)}</td>
              <td>{formatDate(e.date)}</td>
              <td className="num">{e.interest.toString()}</td>
              <td>
                {e.basis === 'will' ? 'Probated will' : e.ruleVersion?.title}
                <div style={{ color: '#52514e' }}>
                  {[
                    ...new Set(
                      e.allocations.flatMap((a) =>
                        a.citations.map((c) => `${c.code} ${c.section}`.trim()),
                      ),
                    ),
                  ].join('; ')}
                </div>
              </td>
              <td>
                {e.allocations
                  .map(
                    (a) =>
                      `${a.to.kind === 'escheat' ? `State of ${a.to.state}` : analysis.index.name(a.to.personId)} (${a.share.toString()})`,
                  )
                  .join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {result.issues.some((i) => i.level !== 'info') ? (
        <>
          <h2>Open questions</h2>
          <ul>
            {result.issues
              .filter((i) => i.level !== 'info')
              .map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
          </ul>
        </>
      ) : null}

      <div className="sign">
        <div>Affiant signature and date</div>
        <div>Printed name and relationship to the family</div>
        <div>Sworn to and subscribed before me this ____ day of ____________, 20__.</div>
        <div>Notary Public · My commission expires</div>
      </div>
      <p className="fine">
        Prepared with Heirmap {FULL_VERSION}. Shares are computed under the intestacy statutes cited
        for each death, applied to the facts entered. This is not legal advice and is not a title
        opinion; an attorney licensed in {STATES[file.property.state].name} should review it, along
        with the deed records, probate records and the documents listed in the accompanying
        checklist.
      </p>
    </ReportShell>
  );
}

export function ChecklistReport({ file, analysis }: { file: CaseFile; analysis: Analysis }) {
  return (
    <ReportShell title="Document checklist">
      <h1>Document Checklist</h1>
      <div style={{ color: '#52514e' }}>Records needed to clear title</div>
      <PropertyMeta file={file} analysis={analysis} />
      <h2>Documents</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: 26 }} />
            <th>Document</th>
            <th>Why it is needed</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {analysis.checklist.map((item) => {
            const st = file.documents[item.key]?.status ?? 'needed';
            return (
              <tr key={item.key}>
                <td>
                  <span className={`box${st === 'obtained' ? ' checked' : ''}`} />
                </td>
                <td>
                  <strong>{item.title}</strong>
                </td>
                <td>{item.reason}</td>
                <td>{DOC_STATUS_LABEL[st]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="fine">Prepared with Heirmap {FULL_VERSION}. Not legal advice.</p>
    </ReportShell>
  );
}
