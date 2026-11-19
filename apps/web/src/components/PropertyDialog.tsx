import { STATES, STATE_CODES, type Property, type StateCode } from '@heirmap/intestacy';
import { useState } from 'react';
import type { CaseFile } from '../model/case';
import { useStore } from '../store/store';
import { Dialog } from './Dialog';

export function PropertyDialog({ file, onClose }: { file: CaseFile; onClose: () => void }) {
  const edit = useStore((s) => s.edit);
  const [p, setP] = useState<Property>(structuredClone(file.property));
  const set = <K extends keyof Property>(key: K, value: Property[K]) =>
    setP((x) => ({ ...x, [key]: value }));
  const people = [...file.tree.people].sort((a, b) => a.name.localeCompare(b.name));

  const save = () => {
    edit((d) => {
      const clean: Property = { ...p };
      for (const k of Object.keys(clean) as (keyof Property)[]) {
        if (clean[k] === '' || clean[k] === undefined) delete clean[k];
      }
      d.property = clean;
    });
    onClose();
  };

  const owners = p.owners;
  return (
    <Dialog
      title="The land"
      description="Describe the parcel and who holds title under the vesting deed."
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose} data-close>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="field-row">
        <label className="field">
          <span>Property name</span>
          <input value={p.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          <span>State</span>
          <select value={p.state} onChange={(e) => set('state', e.target.value as StateCode)}>
            {STATE_CODES.map((c) => (
              <option key={c} value={c}>
                {STATES[c].name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>County</span>
          <input value={p.county ?? ''} onChange={(e) => set('county', e.target.value)} />
        </label>
        <label className="field">
          <span>Parcel / tax ID</span>
          <input value={p.parcelId ?? ''} onChange={(e) => set('parcelId', e.target.value)} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Vesting deed (book / page)</span>
          <input
            value={p.deedReference ?? ''}
            onChange={(e) => set('deedReference', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Deed date</span>
          <input
            type="date"
            value={p.deedDate ?? ''}
            onChange={(e) => set('deedDate', e.target.value)}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Acreage</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={p.acreage ?? ''}
            onChange={(e) =>
              set('acreage', e.target.value === '' ? undefined : Number(e.target.value))
            }
          />
        </label>
        <label className="field">
          <span>Co-owners held title as</span>
          <select
            value={p.tenancy ?? 'common'}
            onChange={(e) => set('tenancy', e.target.value as Property['tenancy'])}
          >
            <option value="common">Tenants in common (each share passes by inheritance)</option>
            <option value="survivorship">Joint tenants with right of survivorship</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Legal description</span>
        <textarea
          value={p.legalDescription ?? ''}
          onChange={(e) => set('legalDescription', e.target.value)}
        />
      </label>
      <div className="field">
        <span>Owner(s) of record</span>
        <div className="stack">
          {owners.map((o, i) => (
            <div className="row" key={i}>
              <select
                className="input"
                value={o.personId}
                onChange={(e) =>
                  set(
                    'owners',
                    owners.map((x, j) => (j === i ? { ...x, personId: e.target.value } : x)),
                  )
                }
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name || 'Unnamed'}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ width: 110 }}
                placeholder={`1/${owners.length}`}
                value={o.share ?? ''}
                aria-label="Share under the deed"
                onChange={(e) =>
                  set(
                    'owners',
                    owners.map((x, j) =>
                      j === i
                        ? {
                            personId: x.personId,
                            ...(e.target.value ? { share: e.target.value } : {}),
                          }
                        : x,
                    ),
                  )
                }
              />
              <button
                className="btn btn-ghost icon-btn"
                aria-label="Remove owner"
                disabled={owners.length === 1}
                onClick={() =>
                  set(
                    'owners',
                    owners.filter((_, j) => j !== i),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-sm"
              onClick={() => set('owners', [...owners, { personId: people[0]?.id ?? '' }])}
              disabled={people.length === 0}
            >
              Add co-owner
            </button>
          </div>
          <small className="muted">Leave shares blank for equal shares.</small>
        </div>
      </div>
    </Dialog>
  );
}
