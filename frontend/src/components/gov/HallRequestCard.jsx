import { useState } from 'react';
import { Card } from './Common';
import { Field, Select, Textarea } from './Form';
import HallPicker from './HallPicker';
import { HallBadge, PriorityPill } from './HallPermission';
import { Icon } from '../ui';
import { hallOf } from '../../store/selectors';

/**
 * The club's side of the hall: once an event is circulated and students register, the club sees how many people are
 * coming and asks the Events Section for a hall, saying how important the event is. The Events Section allocates it.
 */
export default function HallRequestCard({ request: r, requests, registered, onRequest }) {
  const hall = hallOf(r);
  const [venue, setVenue] = useState(hall.requestedVenue || '');
  const [priority, setPriority] = useState(hall.priority || 'medium');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const attendance = registered || r.capacity;
  const canAsk = hall.status === 'none' || hall.status === 'rejected';

  const submit = () => {
    if (!venue) return setError('Choose a hall.');
    setError('');
    onRequest({ venue, priority, note });
  };

  return (
    <Card title="Registrations & hall" action={<HallBadge status={hall.status} />}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-brand-50 px-4 py-3">
          <div className="text-2xl font-extrabold text-brand-900">{registered}</div>
          <div className="text-[11px] text-brand-800">students registered so far</div>
        </div>
        <div className="rounded-xl bg-canvas px-4 py-3">
          <div className="text-2xl font-extrabold text-brand-900">{r.capacity}</div>
          <div className="text-[11px] text-ink-soft">seats you opened</div>
        </div>
      </div>

      {hall.status === 'approved' && (
        <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-800">
          <Icon name="CheckCircle2" className="mr-1.5 inline h-4 w-4" />
          <b>{r.venue}</b> is allocated.
          {hall.requestedVenue && hall.requestedVenue !== r.venue ? ` The Events Section assigned it instead of ${hall.requestedVenue}.` : ''}
          {hall.note ? ` “${hall.note}”` : ''}
        </div>
      )}
      {hall.status === 'requested' && (
        <div role="status" className="rounded-xl border border-line bg-canvas px-4 py-3 text-xs text-ink-soft">
          You asked for <b className="text-brand-900">{hall.requestedVenue}</b> with {hall.registered} registered. <PriorityPill priority={hall.priority} />
          <div className="mt-1 text-[11px]">Waiting for the Events Section to allocate it.</div>
        </div>
      )}
      {hall.status === 'rejected' && (
        <div role="alert" className="mb-4 rounded-xl border border-[#f1c9c4] bg-rose-soft px-4 py-3 text-xs text-rose-ink">
          The Events Section could not give {hall.requestedVenue}: {hall.note || 'no reason given'}. Pick another hall below and ask again.
        </div>
      )}

      {canAsk && (
        <div className="space-y-4">
          <p className="text-[11px] leading-relaxed text-ink-soft">
            Ask for a hall using the {registered ? 'registrations you have' : 'expected attendance'}. Several events can wait for halls at the same time: set a priority so the Events Section knows which matter most to your club.
          </p>
          <Field label="Hall" htmlFor="rf-venue" required error={error} hint={`Sorted by how well each hall fits ${attendance} people.`}>
            <HallPicker
              value={venue}
              onChange={setVenue}
              attendance={attendance}
              date={r.date}
              startTime={r.startTime}
              endTime={r.endTime}
              category={r.category}
              requests={requests}
              ignoreId={r.id}
              error={error}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority for your club" htmlFor="hr-priority">
              <Select id="hr-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="high">High: our most important event</option>
                <option value="medium">Medium</option>
                <option value="low">Low: only if a hall is free</option>
              </Select>
            </Field>
            <Field label="Note for the Events Section (optional)" htmlFor="hr-note">
              <Textarea id="hr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <button type="button" onClick={submit} className="btn-primary">
            <Icon name="Building2" className="h-4 w-4" /> Request this hall
          </button>
        </div>
      )}
    </Card>
  );
}
