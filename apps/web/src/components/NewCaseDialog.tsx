import { STATES, STATE_CODES, type StateCode } from '@heirmap/intestacy';
import { useState, type FormEvent } from 'react';
import { useStore } from '../store/store';
import { Dialog } from './Dialog';

export function NewCaseDialog({ onClose }: { onClose: () => void }) {
  const createCase = useStore((s) => s.createCase);
  const [title, setTitle] = useState('');
  const [state, setState] = useState<StateCode>('GA');
  const [county, setCounty] = useState('');
  const [parcelId, setParcelId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerSex, setOwnerSex] = useState<'' | 'female' | 'male'>('');
  const [ownerDeathDate, setOwnerDeathDate] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim()) return;
    createCase({
      title: title || `${ownerName.trim()} property`,
      state,
      county: county.trim(),
      parcelId: parcelId.trim(),
      ownerName,
      ...(ownerSex ? { ownerSex } : {}),
      ...(ownerDeathDate ? { ownerDeathDate } : {}),
    });
    onClose();
  };

  return (
    <Dialog
      title="Start a new case"
      description="Begin with the land and the person named on the deed. Everything stays on this device."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} data-close>
            Cancel
          </button>
          <button type="submit" form="new-case" className="btn btn-primary">
            Create case
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={submit} id="new-case">
        <label className="field">
          <span>Owner of record (name on the deed)</span>
          <input
            required
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="e.g. Elijah Freeman"
            autoComplete="off"
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Owner's date of death</span>
            <input
              type="date"
              value={ownerDeathDate}
              onChange={(e) => setOwnerDeathDate(e.target.value)}
            />
            <small>From the death certificate. Leave blank if unknown.</small>
          </label>
          <label className="field">
            <span>Owner's sex</span>
            <select
              value={ownerSex}
              onChange={(e) => setOwnerSex(e.target.value as typeof ownerSex)}
            >
              <option value="">Not recorded</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <small>Older statutes treated widows and widowers differently.</small>
          </label>
        </div>
        <label className="field">
          <span>State where the land is</span>
          <select value={state} onChange={(e) => setState(e.target.value as StateCode)}>
            {STATE_CODES.map((code) => (
              <option key={code} value={code}>
                {STATES[code].name}
              </option>
            ))}
          </select>
          <small>
            Land passes under the law of the state where it sits, using the statute in force on each
            date of death.
          </small>
        </label>
        <div className="field-row">
          <label className="field">
            <span>County</span>
            <input
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              placeholder="e.g. Greene"
            />
          </label>
          <label className="field">
            <span>Parcel / tax ID</span>
            <input
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
              placeholder="optional"
            />
          </label>
        </div>
        <label className="field">
          <span>Case name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Freeman home place"
          />
        </label>
      </form>
    </Dialog>
  );
}
