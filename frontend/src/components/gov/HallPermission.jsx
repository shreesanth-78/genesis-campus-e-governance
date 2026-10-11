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

const HALL_BADGE = {
  none: ['No hall yet', 'gray'],
  requested: ['Hall requested', 'sky'],
  approved: ['Hall allocated', 'green'],
  rejected: ['Hall not given', 'rose'],
};
export const HallBadge = ({ status }) => <Badge tone={(HALL_BADGE[status] ?? HALL_BADGE.none)[1]}>{(HALL_BADGE[status] ?? HALL_BADGE.none)[0]}</Badge>;

export const PRIORITY = { high: ['High priority', 'bg-rose-soft text-rose-ink'], medium: ['Medium priority', 'bg-amber-soft text-amber-ink'], low: ['Low priority', 'bg-[#f1eeee] text-ink-soft'] };
export const PriorityPill = ({ priority }) => (PRIORITY[priority] ? <span className={cn('pill', PRIORITY[priority][1])}>{PRIORITY[priority][0]}</span> : null);

/**
 * The Events Section's decision on a hall a club has asked for: allocate it, allocate a different one that holds the
 * registered crowd and is free, or say it cannot be given (the club then asks again).
 */
export default function HallPermission({ request: r, requests, canDecide, onApprove, onReassign, onReject }) {
  const hall = hallOf(r);
  const [panel, setPanel] = useState(null); // 'reassign' | 'reject'
  const [venue, setVenue] = useState('');
  const [note, setNote] = useState('');
  const [advice, setAdvice] = useState(null);
  const [busy, setBusy] = useState(false);
  const attendance = hall.registered || r.capacity;

  const ranked = useMemo(
    () => rankHalls({ attendance, date: r.date, startTime: r.startTime, endTime: r.endTime, category: r.category, requests, ignoreId: r.id }),
    [r, requests, attendance],
  );
  const asked = ranked.find((h) => h.name === hall.requestedVenue);
  const usable = ranked.filter((h) => h.fits && h.available && h.name !== hall.requestedVenue);
  const info = VENUES.find((v) => v.name === hall.requestedVenue);
  const fit = FIT[asked?.status] ?? FIT.unknown;
  const open = hall.status === 'requested';

  const ask = async () => {
    setBusy(true);
    try {
      setAdvice(await recommendHalls({ attendance, date: r.date, startTime: r.startTime, endTime: r.endTime, category: r.category, requestId: r.id }, { requests }));
    } finally {
      setBusy(false);
    }
  };
  const best = advice?.rankings?.find((h) => h.recommended && h.name !== hall.requestedVenue);

  const reset = () => {
    setPanel(null);
    setNote('');
    setVenue('');
  };

  if (hall.status === 'none') return <p className="text-[11px] text-ink-soft">The club has not asked for a hall yet. It does that once students are registering.</p>;

  return (
    <div>
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3 text-[11px]">
        <div>
          <dt className="text-ink-mute">{hall.status === 'approved' && r.venue !== hall.requestedVenue ? 'Allocated hall' : 'Hall asked for'}</dt>
          <dd className="font-bold text-brand-900">{hall.status === 'approved' ? r.venue : hall.requestedVenue}</dd>
        </div>
        <div>
          <dt className="text-ink-mute">Registered vs capacity</dt>
          <dd className="font-bold text-brand-900">
            {hall.registered || '—'} registered · holds {info?.capacity ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-mute">Club priority</dt>
          <dd className="mt-0.5"><PriorityPill priority={hall.priority} /></dd>
        </div>
        <div>
          <dt className="text-ink-mute">Requested by</dt>
          <dd className="font-bold text-brand-900">{hall.requestedBy || 'Club authority'}</dd>
        </div>
        {hall.status === 'approved' && hall.requestedVenue !== r.venue && (
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
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fit.label && <span className={cn('pill', fit.cls)}>{fit.label}</span>}
          {asked && !asked.available && <span className="pill bg-rose-soft text-rose-ink">Clash with an allocated event</span>}
        </div>
      )}
      {hall.note && <p className="mt-2 text-[10px] text-ink-mute">{open ? 'Club note' : 'Note'}: “{hall.note}”</p>}
      {!open && hall.by && (
        <p className="mt-2 text-[10px] text-ink-mute">
          {hall.status === 'approved' ? 'Allocated' : 'Decided'} by {hall.by}
        </p>
      )}

      {canDecide && open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={onApprove} className="btn-primary">
              <Icon name="Check" className="h-4 w-4" /> Allocate this hall
            </button>
            <button onClick={() => (setPanel(panel === 'reassign' ? null : 'reassign'), setNote(''))} className="btn-ghost">
              Assign a different hall
            </button>
            <button onClick={() => (setPanel(panel === 'reject' ? null : 'reject'), setNote(''))} className="btn-ghost text-rose-ink">
              Hall can’t be given
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
              <Field label="New hall" htmlFor="h-venue" hint={usable.length ? 'Only halls that hold the registered crowd and are free at that time are listed.' : 'No other hall fits and is free at that time.'}>
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
              <Field label="Why can’t this hall be given?" htmlFor="h-reason" required>
                <Textarea id="h-reason" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <p className="text-[10px] text-ink-mute">The club sees this reason and can ask for another hall. The event stays open for registration.</p>
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
      {!canDecide && <p className="mt-3 text-[11px] text-ink-mute">Only the Events Section allocates halls.</p>}
    </div>
  );
}
