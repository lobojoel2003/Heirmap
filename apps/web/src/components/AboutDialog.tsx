import { STATES, STATE_CODES, VERSION } from '@heirmap/intestacy';
import { BUILD, FULL_VERSION } from '../build';
import { Dialog } from './Dialog';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="About Heirmap"
      onClose={onClose}
      wide
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <p style={{ margin: 0 }}>
        Heirmap helps families and legal aid attorneys work out who the heirs are and what share of
        the land each one holds under state intestacy law. It runs entirely in your browser. Nothing
        you type is sent anywhere; cases are saved in this browser's local storage, and you can
        export them as files.
      </p>
      <div className="section" style={{ padding: 0, border: 0 }}>
        <h3>States modeled</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {STATE_CODES.map((c) => (
            <li key={c}>
              <strong>{STATES[c].name}</strong>:{' '}
              {STATES[c].versions.map((v) => `${v.id} (from ${v.effectiveFrom})`).join(', ')}
            </li>
          ))}
        </ul>
      </div>
      <div className="disclaimer" style={{ marginTop: 0 }}>
        <strong>Not legal advice.</strong> Heirmap is a research aid. The rules are modeled from the
        statutes cited on each share, with a confidence level shown for every rule version. Have a
        licensed attorney in the state where the land is located review any result before relying on
        it.
      </div>
      <dl
        className="small"
        style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: 0 }}
      >
        <dt className="muted">App version</dt>
        <dd style={{ margin: 0 }}>
          <code>{FULL_VERSION}</code>
        </dd>
        <dt className="muted">Build</dt>
        <dd style={{ margin: 0 }}>
          #{BUILD.buildNumber} · {BUILD.commit} {BUILD.date ? `· ${BUILD.date}` : ''}
        </dd>
        <dt className="muted">Rules engine</dt>
        <dd style={{ margin: 0 }}>@heirmap/intestacy {VERSION} (Apache-2.0)</dd>
        <dt className="muted">App license</dt>
        <dd style={{ margin: 0 }}>GNU AGPL-3.0</dd>
        <dt className="muted">Source</dt>
        <dd style={{ margin: 0 }}>
          <a href="https://github.com/lobojoel2003/Heirmap" target="_blank" rel="noreferrer">
            github.com/lobojoel2003/Heirmap
          </a>
        </dd>
      </dl>
    </Dialog>
  );
}
