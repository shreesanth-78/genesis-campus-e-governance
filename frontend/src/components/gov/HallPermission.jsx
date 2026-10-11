import { useMemo, useState } from 'react';
import { VENUES } from '../../data/govData';
import { rankHalls } from '@gcc/shared/gov/halls';
import { hallOf } from '../../store/selectors';
import { recommendHalls } from '../../services/ai';
import { Icon } from '../ui';
import { Field, Textarea, Select } from './Form';
import { Badge } from './Badges';
import { FIT } from './HallPicker';
import { cn } from '../../utils/helpers';

const HALL_BADGE = { pending: ['Awaiting permission', 'gray'], approved: ['Hall approved', 'green'], rejected: ['Hall not approved', 'rose'] };
export const HallBadge = ({ status }) => <Badge tone={(HALL_BADGE[status] ?? HALL_BADGE.pending)[1]}>{(HALL_BADGE[status] ?? HALL_BADGE.pending)[0]}</Badge>;

/**
 * The reviewer's decision on the hall the club asked for: approve it, assign a different one that fits and is free, or
 * say it cannot be used (the request then goes back to the club with the reason).
 */
export default function HallPermission({ request: r, requests, canDecide, open, onApprove, onReassign, onReject }) {
  const hall = hallOf(r);
  const [panel, setPanel] = useState(null); // 'reassign' | 'reject'
  const [venue, setVenue] = useState('');
  const [note, setNote] = useState('');
  const [advice, setAdvice] = useState(null);
  const [busy, setBusy] = useState(false);

  const ranked = useMemo(
    () => rankHalls({ attendance: r.capacity, date: r.date, startTime: r.startTime, endTime: r.endTime, category: r.category, requests, ignoreId: r.id }),
    [r, requests],
  );
  const current = ranked.find((h) => h.name === r.venue);
  const usable = ranked.filter((h) => h.fits && h.available && h.name !== r.venue);
  const info = VENUES.find((v) => v.name === r.venue);
  const fit = FIT[current?.status] ?? FIT.unknown;
  const decided = hall.status === 'approved';

  const ask = async () => {
    setBusy(true);
    try {
      setAdvice(await recommendHalls({ attendance: r.capacity, date: r.date, startTime: r.startTime, endTime: r.endTime, category: r.category, requestId: r.id }, { requests }));
    } finally {
      setBusy(false);
    }
  };
  const best = advice?.rankings?.find((h) => h.recommended && h.name !== r.venue);

  const reset = () => {
    setPanel(null);
    setNote('');
    setVenue('');
  };

  return (
    <div>
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3 text-[11px]">
        <div>
          <dt className="text-ink-mute">{hall.requestedVenue && hall.requestedVenue !== r.venue ? 'Assigned hall' : 'Requested hall'}</dt>
          <dd className="font-bold text-brand-900">{r.venue}</dd>
        </div>
        <div>
          <dt className="text-ink-mute">Capacity vs expected</dt>
          <dd className="font-bold text-brand-900">
            holds {info?.capacity ?? '—'} · expected {r.capacity}
          </dd>
        </div>
        {hall.requestedVenue && hall.requestedVenue !== r.venue && (
          <div className="col-span-2">
            <dt className="text-ink-mute">Changed from</dt>
            <dd className="font-bold text-brand-900">{hall.requestedVenue}</dd>
          </div>
        )}
        {info && (
          <div className="col-span-2">
            <dt className="text-ink-mute">Facilities</dt>
            <dd className="font-bold text-brand-900">{info.facilities.join(', ')}</dd>
          </div>
        )}
      </dl>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {fit.label && <span className={cn('pill', fit.cls)}>{fit.label}</span>}
        {current && !current.available && <span className="pill bg-rose-soft text-rose-ink">Clash with another request</span>}
      </div>
      {hall.by && (
        <p className="mt-2 text-[10px] text-ink-mute">
          {decided ? 'Approved' : 'Decided'} by {hall.by}
          {hall.note ? ` · “${hall.note}”` : ''}
        </p>
      )}

      {canDecide && open && !decided && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={onApprove} className="btn-primary">
              <Icon name="Check" className="h-4 w-4" /> Approve hall
            </button>
            <button onClick={() => (setPanel(panel === 'reassign' ? null : 'reassign'), setNote(''))} className="btn-ghost">
              Assign a different hall
            </button>
            <button onClick={() => (setPanel(panel === 'reject' ? null : 'reject'), setNote(''))} className="btn-ghost text-rose-ink">
              Hall can’t be used
            </button>
          </div>

          <button type="button" onClick={ask} disabled={busy} className="btn-ghost px-3 py-1.5 text-[11px]">
            <Icon name={busy ? 'Loader2' : 'Sparkles'} className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Ask AI for the best hall
          </button>
          {advice && (
            <div role="status" className="rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-[11px] text-ink">
              {advice.summary}
              {best && (
                <button type="button" onClick={() => (setPanel('reassign'), setVenue(best.name))} className="ml-2 font-bold text-brand-700 hover:underline">
                  Assign {best.name}
                </button>
              )}
            </div>
          )}

          {panel === 'reassign' && (
            <div className="space-y-3 rounded-xl border border-line p-3">
              <Field label="New hall" htmlFor="h-venue" hint={usable.length ? 'Only halls that hold the expected crowd and are free at that time are listed.' : 'No other hall fits and is free at that time.'}>
                <Select id="h-venue" value={venue} onChange={(e) => setVenue(e.target.value)}>
                  <option value="">Choose…</option>
                  {usable.map((h) => (
                    <option key={h.name} value={h.name}>
                      {h.name} (holds {h.capacity}, {FIT[h.status]?.label.toLowerCase() || 'fits'})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note to the club (optional)" htmlFor="h-note">
                <Textarea id="h-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <button disabled={!venue} onClick={() => { onReassign(venue, note); reset(); }} className="btn-primary disabled:opacity-50">
                  Assign hall
                </button>
                <button onClick={reset} className="btn-ghost">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {panel === 'reject' && (
            <div className="space-y-3 rounded-xl border border-line p-3">
              <Field label="Why can’t this hall be used?" htmlFor="h-reason" required>
                <Textarea id="h-reason" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <p className="text-[10px] text-ink-mute">The request goes back to the club with this reason, and the club picks another hall and resubmits.</p>
              <div className="flex gap-2">
                <button disabled={!note.trim()} onClick={() => { onReject(note); reset(); }} className="btn-primary disabled:opacity-50">
                  Send back to the club
                </button>
                <button onClick={reset} className="btn-ghost">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {!canDecide && <p className="mt-3 text-[11px] text-ink-mute">Your role is not permitted to give hall permission.</p>}
    </div>
  );
}
