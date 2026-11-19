import { formatDate, type ParentChildKind, type Person, type Union } from '@heirmap/intestacy';
import { useEffect, useRef, useState } from 'react';
import type { Analysis } from '../model/analysis';
import type { CaseFile } from '../model/case';
import { useStore } from '../store/store';
import { IconPlus, IconTrash } from './Icons';
import { CitationChip } from './SharesPanel';

const LINK_KINDS: { value: ParentChildKind; label: string }[] = [
  { value: 'biological', label: 'Birth child' },
  { value: 'adopted', label: 'Adopted' },
  { value: 'step', label: 'Stepchild (no inheritance)' },
  { value: 'foster', label: 'Foster child (no inheritance)' },
];

function DateInput({
  value,
  onChange,
  inputRef,
  label,
  hint,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  label: string;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        ref={inputRef}
        type="date"
        value={value ?? ''}
        min="1700-01-01"
        max="2100-12-31"
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

/** Text input that commits on blur so typing does not flood the undo history. */
function TextField({
  label,
  value,
  onCommit,
  inputRef,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

export function PersonPanel({
  file,
  analysis,
  personId,
}: {
  file: CaseFile;
  analysis: Analysis;
  personId: string;
}) {
  const s = useStore();
  const person = file.tree.people.find((p) => p.id === personId);
  const nameRef = useRef<HTMLInputElement>(null);
  const deathRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const focusField = useStore((st) => st.focusField);

  useEffect(() => {
    const map: Record<string, React.RefObject<HTMLInputElement | null>> = {
      name: nameRef,
      deathDate: deathRef,
      estateValue: valueRef,
    };
    const ref = focusField ? map[focusField] : undefined;
    if (ref?.current) {
      ref.current.focus();
      if (focusField === 'name') ref.current.select();
    }
  }, [focusField, personId]);

  if (!person) return <div className="empty">Select someone in the tree.</div>;

  const update = (patch: Partial<Person>) => s.updatePerson(person.id, patch);
  const isOwner = file.property.owners.some((o) => o.personId === person.id);
  const parents = file.tree.parentChild.filter((l) => l.childId === person.id);
  const children = file.tree.parentChild.filter((l) => l.parentId === person.id);
  const unions = file.tree.unions.filter((u) => u.partnerIds.includes(person.id));
  const holding = analysis.holdingOf.get(person.id);
  const estate = analysis.result.estates.find((e) => e.decedentId === person.id);
  const issues = analysis.issuesOf.get(person.id) ?? [];
  const name = (id: string) => analysis.index.name(id);
  const partnerOf = (u: Union) =>
    u.partnerIds[0] === person.id ? u.partnerIds[1] : u.partnerIds[0];
  const others = file.tree.people.filter((p) => p.id !== person.id);
  const deceasedOthers = others.filter((p) => p.status === 'deceased');
  const exclusions = (file.tree.exclusions ?? []).filter((e) => e.personId === person.id);
  const c = person.confirmed ?? {};

  return (
    <div>
      <div className="section stack">
        <div className="row">
          {isOwner ? <span className="chip chip-brand">Owner of record</span> : null}
          <span className="chip">{analysis.relationOf(person.id) || 'relative'}</span>
          {holding ? (
            <span className="chip chip-good" style={{ marginLeft: 'auto' }}>
              Holds {holding.share.toString()}
            </span>
          ) : null}
        </div>
        <TextField
          key={`${person.id}:${person.name}`}
          label="Full name"
          value={person.name}
          onCommit={(v) => update({ name: v })}
          inputRef={nameRef}
          placeholder="Name as on records"
        />
        <div className="field-row">
          <label className="field">
            <span>Sex</span>
            <select
              value={person.sex ?? ''}
              onChange={(e) => update({ sex: (e.target.value || undefined) as Person['sex'] })}
            >
              <option value="">Not recorded</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>
          <DateInput
            label="Date of birth"
            value={person.birthDate}
            onChange={(v) => update({ birthDate: v })}
          />
        </div>
        <div className="field-row">
          <label className="field">
            <span>Status</span>
            <select
              value={person.status}
              onChange={(e) => {
                const status = e.target.value as Person['status'];
                update({ status, ...(status !== 'deceased' ? { deathDate: undefined } : {}) });
                if (status === 'deceased') setTimeout(() => deathRef.current?.focus(), 0);
              }}
            >
              <option value="living">Living</option>
              <option value="deceased">Deceased</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          {person.status === 'deceased' ? (
            <DateInput
              label="Date of death"
              value={person.deathDate}
              onChange={(v) => update({ deathDate: v })}
              inputRef={deathRef}
              hint="From the death certificate"
            />
          ) : (
            <div />
          )}
        </div>
        {person.status === 'deceased' ? (
          <label className="field">
            <span>Net value of the whole estate (USD, optional)</span>
            <input
              ref={valueRef}
              type="number"
              min="0"
              step="1000"
              value={person.estateValue ?? ''}
              onChange={(e) =>
                update({ estateValue: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
            <small>
              Only needed where the spouse’s share includes a dollar amount (Alabama since 1983).
            </small>
          </label>
        ) : null}
        <label className="field">
          <span>Notes</span>
          <textarea
            defaultValue={person.notes ?? ''}
            key={person.id}
            onBlur={(e) =>
              e.target.value !== (person.notes ?? '') &&
              update({ notes: e.target.value || undefined })
            }
          />
        </label>
      </div>

      {estate ? (
        <div className="section">
          <h3>Estate — {formatDate(estate.date)}</h3>
          <p className="small" style={{ marginTop: 0 }}>
            {person.name}’s {estate.interest.toString()} interest passed{' '}
            {estate.basis === 'will'
              ? 'under a probated will'
              : `by intestacy under ${estate.ruleVersion?.title}`}
            :
          </p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {estate.allocations.map((a, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <strong>
                  {a.to.kind === 'escheat' ? `State of ${a.to.state}` : name(a.to.personId)}
                </strong>{' '}
                ({a.role}) — {a.share.toString()} of the estate
                <div className="muted">{a.explanation}</div>
                <div>
                  {a.citations.map((cit, j) => (
                    <CitationChip key={j} c={cit} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="section">
        <h3>Spouses</h3>
        <div className="rel-list">
          {unions.map((u) => (
            <div className="rel-item" key={u.id}>
              <div className="head">
                <button className="link" onClick={() => s.select(partnerOf(u))}>
                  {name(partnerOf(u))}
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-danger"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => s.removeUnion(u.id)}
                  aria-label={`Remove marriage to ${name(partnerOf(u))}`}
                >
                  Remove
                </button>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Type</span>
                  <select
                    value={u.kind}
                    onChange={(e) => s.updateUnion(u.id, { kind: e.target.value as Union['kind'] })}
                  >
                    <option value="marriage">Ceremonial marriage</option>
                    <option value="common-law">Common-law marriage</option>
                  </select>
                </label>
                <DateInput
                  label="Married"
                  value={u.startDate}
                  onChange={(v) => s.updateUnion(u.id, { startDate: v })}
                />
              </div>
              <div className="field-row" style={{ marginTop: 8 }}>
                <label className="field">
                  <span>Ended by</span>
                  <select
                    value={u.endReason ?? ''}
                    onChange={(e) =>
                      s.updateUnion(u.id, {
                        endReason: (e.target.value || undefined) as Union['endReason'],
                        ...(e.target.value ? {} : { endDate: undefined }),
                      })
                    }
                  >
                    <option value="">Still married (or ended by death)</option>
                    <option value="divorce">Divorce</option>
                    <option value="annulment">Annulment</option>
                  </select>
                </label>
                {u.endReason ? (
                  <DateInput
                    label="Decree date"
                    value={u.endDate}
                    onChange={(v) => s.updateUnion(u.id, { endDate: v })}
                  />
                ) : (
                  <div />
                )}
              </div>
            </div>
          ))}
          <div className="row wrap">
            <button className="btn btn-sm" onClick={() => s.addSpouse(person.id)}>
              <IconPlus size={13} /> Add spouse
            </button>
            <label className="check small">
              <input
                type="checkbox"
                checked={Boolean(c.spouses)}
                onChange={(e) => update({ confirmed: { ...c, spouses: e.target.checked } })}
              />
              All marriages entered
            </label>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Children</h3>
        <div className="rel-list">
          {children.map((l) => (
            <div className="rel-item" key={l.id}>
              <div className="head">
                <button className="link" onClick={() => s.select(l.childId)}>
                  {name(l.childId)}
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-danger"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => s.removeLink(l.id)}
                  aria-label={`Unlink child ${name(l.childId)}`}
                >
                  Unlink
                </button>
              </div>
              <LinkFields
                linkId={l.id}
                kind={l.kind}
                paternity={l.paternityEstablished}
                adoptedAway={l.adoptedAway}
                showPaternity={person.sex === 'male'}
              />
            </div>
          ))}
          <div className="row wrap">
            <button
              className="btn btn-sm"
              onClick={() => s.addChild([person.id, ...coParent(file, person.id)])}
            >
              <IconPlus size={13} /> Add child
            </button>
            <label className="check small">
              <input
                type="checkbox"
                checked={Boolean(c.children)}
                onChange={(e) => update({ confirmed: { ...c, children: e.target.checked } })}
              />
              All children entered
            </label>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Parents</h3>
        <div className="rel-list">
          {parents.map((l) => (
            <div className="rel-item" key={l.id}>
              <div className="head">
                <button className="link" onClick={() => s.select(l.parentId)}>
                  {name(l.parentId)}
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-danger"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => s.removeLink(l.id)}
                >
                  Unlink
                </button>
              </div>
              <LinkFields
                linkId={l.id}
                kind={l.kind}
                paternity={l.paternityEstablished}
                adoptedAway={l.adoptedAway}
                showPaternity={analysis.index.maybePerson(l.parentId)?.sex === 'male'}
              />
            </div>
          ))}
          <div className="row wrap">
            {parents.length < 2 ? (
              <button className="btn btn-sm" onClick={() => s.addParent(person.id)}>
                <IconPlus size={13} /> Add parent
              </button>
            ) : null}
            {analysis.index.legalParentIds(person.id).length > 0 ? (
              <button className="btn btn-sm" onClick={() => s.addSibling(person.id)}>
                <IconPlus size={13} /> Add sibling
              </button>
            ) : null}
            <label className="check small">
              <input
                type="checkbox"
                checked={Boolean(c.parents)}
                onChange={(e) => update({ confirmed: { ...c, parents: e.target.checked } })}
              />
              Parents entered
            </label>
            <label className="check small">
              <input
                type="checkbox"
                checked={Boolean(c.siblings)}
                onChange={(e) => update({ confirmed: { ...c, siblings: e.target.checked } })}
              />
              Siblings entered
            </label>
          </div>
        </div>
      </div>

      {person.status === 'deceased' ? <WillEditor person={person} others={others} /> : null}

      <div className="section">
        <h3>Disclaimers and disqualifications</h3>
        <div className="stack">
          {exclusions.map((ex, i) => (
            <div className="row small" key={i}>
              <span>
                {ex.reason === 'disclaimer'
                  ? 'Disclaimed'
                  : ex.reason === 'slayer'
                    ? 'Barred (slayer rule)'
                    : 'Excluded'}{' '}
                from the estate of <strong>{name(ex.decedentId)}</strong>
              </span>
              <button
                className="btn btn-ghost btn-sm btn-danger"
                style={{ marginLeft: 'auto' }}
                onClick={() =>
                  s.edit((d) => {
                    d.tree.exclusions = (d.tree.exclusions ?? []).filter(
                      (x) => !(x.personId === ex.personId && x.decedentId === ex.decedentId),
                    );
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {deceasedOthers.length > 0 ? (
            <ExclusionAdder personId={person.id} decedents={deceasedOthers} />
          ) : (
            <span className="small muted">
              Treats this person as having died first for one estate.
            </span>
          )}
        </div>
      </div>

      {issues.length ? (
        <div className="section">
          <h3>To review</h3>
          {issues.map((i, k) => (
            <div key={k} className={`issue ${i.level}`}>
              <span className="icon">{i.level === 'info' ? 'i' : '!'}</span>
              <span>{i.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="section">
        <button
          className="btn btn-danger"
          disabled={isOwner}
          title={isOwner ? 'Change the owner of record in the property settings first' : undefined}
          onClick={() => {
            if (window.confirm(`Remove ${person.name || 'this person'} and their relationships?`)) {
              s.removePerson(person.id);
            }
          }}
        >
          <IconTrash size={14} /> Remove person
        </button>
      </div>
    </div>
  );
}

/** The person's current spouse, used as the default other parent for a new child. */
function coParent(file: CaseFile, personId: string): string[] {
  const unions = file.tree.unions.filter((u) => u.partnerIds.includes(personId) && !u.endReason);
  const u = unions.at(-1);
  if (!u) return [];
  return [u.partnerIds[0] === personId ? u.partnerIds[1] : u.partnerIds[0]];
}

function LinkFields({
  linkId,
  kind,
  paternity,
  adoptedAway,
  showPaternity,
}: {
  linkId: string;
  kind: ParentChildKind;
  paternity?: boolean;
  adoptedAway?: boolean;
  showPaternity: boolean;
}) {
  const updateLink = useStore((s) => s.updateLink);
  return (
    <div className="field-row">
      <label className="field">
        <span>Relationship</span>
        <select
          value={kind}
          onChange={(e) => updateLink(linkId, { kind: e.target.value as ParentChildKind })}
        >
          {LINK_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {kind === 'biological' && showPaternity ? (
        <label className="field">
          <span>Paternity (if parents never married)</span>
          <select
            value={paternity === undefined ? '' : paternity ? 'yes' : 'no'}
            onChange={(e) =>
              updateLink(linkId, {
                paternityEstablished: e.target.value === '' ? undefined : e.target.value === 'yes',
              })
            }
          >
            <option value="">Unknown</option>
            <option value="yes">Legally established</option>
            <option value="no">Not established</option>
          </select>
        </label>
      ) : kind === 'biological' ? (
        <label className="check small" style={{ alignSelf: 'end' }}>
          <input
            type="checkbox"
            checked={Boolean(adoptedAway)}
            onChange={(e) => updateLink(linkId, { adoptedAway: e.target.checked || undefined })}
          />
          Later adopted by another family
        </label>
      ) : (
        <div />
      )}
    </div>
  );
}

function WillEditor({ person, others }: { person: Person; others: Person[] }) {
  const updatePerson = useStore((s) => s.updatePerson);
  const will = person.will;
  const setWill = (w: Person['will'] | undefined) => updatePerson(person.id, { will: w });
  return (
    <div className="section">
      <h3>Will</h3>
      <label className="check small" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={Boolean(will)}
          onChange={(e) => setWill(e.target.checked ? { probated: false, devises: [] } : undefined)}
        />
        {person.name || 'This person'} left a will
      </label>
      {will ? (
        <div className="stack">
          <label className="check small">
            <input
              type="checkbox"
              checked={will.probated}
              onChange={(e) => setWill({ ...will, probated: e.target.checked })}
            />
            The will was admitted to probate
          </label>
          <label className="field">
            <span>Probate reference</span>
            <input
              defaultValue={will.reference ?? ''}
              placeholder="Court and estate number"
              onBlur={(e) =>
                setWill({
                  ...will,
                  ...(e.target.value ? { reference: e.target.value } : { reference: undefined }),
                })
              }
            />
          </label>
          {will.devises.map((d, i) => (
            <div className="row" key={i}>
              <select
                className="input"
                value={d.personId}
                aria-label="Devisee"
                onChange={(e) =>
                  setWill({
                    ...will,
                    devises: will.devises.map((x, j) =>
                      j === i ? { ...x, personId: e.target.value } : x,
                    ),
                  })
                }
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name || 'Unnamed'}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ width: 90 }}
                aria-label="Share of the land"
                defaultValue={d.share}
                onBlur={(e) =>
                  setWill({
                    ...will,
                    devises: will.devises.map((x, j) =>
                      j === i ? { ...x, share: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                className="btn btn-ghost icon-btn"
                aria-label="Remove devise"
                onClick={() =>
                  setWill({ ...will, devises: will.devises.filter((_, j) => j !== i) })
                }
              >
                ×
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-sm"
              disabled={others.length === 0}
              onClick={() =>
                setWill({
                  ...will,
                  devises: [...will.devises, { personId: others[0]!.id, share: '1' }],
                })
              }
            >
              <IconPlus size={13} /> Add beneficiary of the land
            </button>
          </div>
          <small className="muted">
            Shares like 1/2. Anything not given away passes by intestacy. An unprobated will is
            treated as intestacy.
          </small>
        </div>
      ) : null}
    </div>
  );
}

function ExclusionAdder({ personId, decedents }: { personId: string; decedents: Person[] }) {
  const edit = useStore((s) => s.edit);
  const [decedentId, setDecedentId] = useState(decedents[0]!.id);
  const [reason, setReason] = useState<'disclaimer' | 'slayer' | 'other'>('disclaimer');
  return (
    <div className="row wrap">
      <select
        className="input"
        style={{ width: 'auto' }}
        value={reason}
        onChange={(e) => setReason(e.target.value as typeof reason)}
        aria-label="Reason"
      >
        <option value="disclaimer">Disclaimed</option>
        <option value="slayer">Barred (slayer)</option>
        <option value="other">Excluded</option>
      </select>
      <select
        className="input"
        style={{ width: 'auto', flex: 1 }}
        value={decedentId}
        onChange={(e) => setDecedentId(e.target.value)}
        aria-label="Estate"
      >
        {decedents.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name || 'Unnamed'}
          </option>
        ))}
      </select>
      <button
        className="btn btn-sm"
        onClick={() =>
          edit((d) => {
            d.tree.exclusions = [...(d.tree.exclusions ?? []), { personId, decedentId, reason }];
          })
        }
      >
        Add
      </button>
    </div>
  );
}
