import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '../../components/gov/Common';
import FileField from '../../components/gov/FileField';
import { Field, Input, Select, Textarea } from '../../components/gov/Form';
import { FeedbackList } from '../../components/gov/Tracker';
import { usePortal } from '../../components/gov/PortalShell';
import HallPicker from '../../components/gov/HallPicker';
import { EmptyState, Icon, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { AUDIENCES, PROMO_CHANNELS, REQUEST_CATEGORIES, REQUEST_DOCS, VENUES } from '../../data/govData';
import { findConflicts, getRequest, TODAY_ISO } from '../../store/selectors';
import { ownsClub } from '../../store/permissions';
import { validateRequest } from '../../store/workflow';

const EMPTY = { title: '', category: '', description: '', date: '', startTime: '', endTime: '', venue: '', capacity: '', regDeadline: '', regDeadlineTime: '18:00', audience: '', poster: null, documents: {} };

export default function RequestForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const gov = useGov();
  const { notify } = usePortal();
  const existing = id ? getRequest(gov.state, id) : null;

  const [f, setF] = useState(() => (existing ? { ...EMPTY, ...existing, capacity: String(existing.capacity || '') } : EMPTY));
  const [errors, setErrors] = useState({});
  const [promo, setPromo] = useState({ on: false, channels: ['dashboard'], posterSupport: false, note: '' });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const venue = VENUES.find((v) => v.name === f.venue);
  const conflicts = useMemo(() => findConflicts(gov.state, { ...f, id: existing?.id || '__new' }), [gov.state, f, existing]);
  const { warnings } = useMemo(() => validateRequest(f), [f]);
  const overCap = venue && Number(f.capacity) > venue.capacity;

  if (id && (!existing || !ownsClub(user, existing.clubId))) {
    return <EmptyState icon="Lock" title="Request not available" body="It doesn’t exist or belongs to another club." action={<Link to="/club/requests" className="btn-primary">Back to requests</Link>} />;
  }
  if (existing && !['draft', 'correction_requested'].includes(existing.status)) {
    return <EmptyState icon="Lock" title="This request can’t be edited" body="Only drafts and requests with requested corrections can be changed." action={<Link to={`/club/requests/${existing.id}`} className="btn-primary">View request</Link>} />;
  }
  const resubmitting = existing?.status === 'correction_requested';

  const save = (submit) => {
    const { errors: errs } = validateRequest(f, { draft: !submit });
    if (submit && overCap) errs.capacity = `Venue holds ${venue.capacity}. Choose a larger venue or reduce attendance.`;
    setErrors(errs);
    if (Object.keys(errs).length) {
      notify('Please fix the highlighted fields.', 'info');
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    const res = gov.saveRequest(f, { submit, id: existing?.id });
    if (!res.ok) { setBusy(false); return notify(res.error, 'info'); }
    if (submit && promo.on) {
      const p = gov.createPromotion({ requestId: res.id, channels: promo.channels, posterSupport: promo.posterSupport, note: promo.note });
      if (!p.ok) notify(`Request submitted, but promotion failed: ${p.error}`, 'info');
    }
    notify(submit ? (resubmitting ? 'Corrected request resubmitted.' : 'Request submitted for review.') : 'Draft saved.');
    nav(`/club/requests/${res.id}`);
  };

  const toggleCh = (k) => setPromo((p) => ({ ...p, channels: p.channels.includes(k) ? p.channels.filter((c) => c !== k) : [...p.channels, k] }));

  return (
    <div>
      <Link to="/club/requests" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-brand-800"><Icon name="ArrowLeft" className="h-3.5 w-3.5" /> Event requests</Link>
      <PageHeader eyebrow={resubmitting ? `Correct & resubmit · ${existing.id}` : existing ? `Draft · ${existing.id}` : 'New request'} title={resubmitting ? 'Correct your request' : existing ? 'Edit draft' : 'Request an event'} subtitle="Events are only shown to students after online review, hard-copy verification, OSA approval and publication." />

      {resubmitting && existing.feedback.length > 0 && <Card className="mb-6" title="Feedback to address"><FeedbackList items={existing.feedback.filter((x) => !x.resolved)} /></Card>}

      <form onSubmit={(e) => { e.preventDefault(); save(true); }} noValidate className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Event details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Event title" htmlFor="rf-title" required error={errors.title}><Input id="rf-title" value={f.title} onChange={set('title')} error={errors.title} maxLength={80} /></Field>
              <Field label="Category" htmlFor="rf-cat" required error={errors.category}><Select id="rf-cat" value={f.category} onChange={set('category')} error={errors.category}><option value="">Choose…</option>{REQUEST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Who can attend" htmlFor="rf-aud" required error={errors.audience}><Select id="rf-aud" value={f.audience} onChange={set('audience')} error={errors.audience}><option value="">Choose…</option>{AUDIENCES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field className="sm:col-span-2" label="Description" htmlFor="rf-desc" required error={errors.description} hint={`${f.description.trim().length}/30 minimum characters`}><Textarea id="rf-desc" rows={4} value={f.description} onChange={set('description')} error={errors.description} /></Field>
            </div>
          </Card>
          <Card title="Schedule & venue">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Event date" htmlFor="rf-date" required error={errors.date}><Input id="rf-date" type="date" min={TODAY_ISO} value={f.date} onChange={set('date')} error={errors.date} /></Field>
              <Field label="Starts" htmlFor="rf-st" required error={errors.startTime}><Input id="rf-st" type="time" value={f.startTime} onChange={set('startTime')} error={errors.startTime} /></Field>
              <Field label="Ends" htmlFor="rf-et" required error={errors.endTime}><Input id="rf-et" type="time" value={f.endTime} onChange={set('endTime')} error={errors.endTime} /></Field>
              <Field label="Expected attendance" htmlFor="rf-cap" required error={errors.capacity} hint="How many registrations you expect: the hall suggestions follow this number."><Input id="rf-cap" type="number" min="5" value={f.capacity} onChange={set('capacity')} error={errors.capacity} /></Field>
              <Field label="Registration closes" htmlFor="rf-rd" required error={errors.regDeadline}><Input id="rf-rd" type="date" min={TODAY_ISO} max={f.date || undefined} value={f.regDeadline} onChange={set('regDeadline')} error={errors.regDeadline} /></Field>
              <Field label="Closing time" htmlFor="rf-rt"><Input id="rf-rt" type="time" value={f.regDeadlineTime} onChange={set('regDeadlineTime')} /></Field>
              <Field className="sm:col-span-3" label="Hall" htmlFor="rf-venue" required error={errors.venue} hint="Sorted by how well each hall fits your expected attendance."><HallPicker value={f.venue} onChange={(v) => setF((p) => ({ ...p, venue: v }))} attendance={f.capacity} date={f.date} startTime={f.startTime} endTime={f.endTime} category={f.category} requests={gov.state.requests} ignoreId={existing?.id} error={errors.venue} /></Field>
            </div>
            <div className="mt-4 space-y-2" aria-live="polite">
              {conflicts.length > 0 && <div className="flex gap-2 rounded-xl bg-rose-soft px-3 py-2.5 text-[11px] text-rose-ink"><Icon name="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" /> {conflicts.map((c) => c.title).join(', ')} is already requested for this venue at an overlapping time. Reviewers will see this clash.</div>}
              {overCap && <div className="flex gap-2 rounded-xl bg-amber-soft px-3 py-2.5 text-[11px] text-amber-ink"><Icon name="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" /> Expected attendance exceeds the venue capacity of {venue.capacity}.</div>}
              {warnings.map((w) => <div key={w} className="flex gap-2 rounded-xl bg-amber-soft px-3 py-2.5 text-[11px] text-amber-ink"><Icon name="Info" className="mt-0.5 h-4 w-4 shrink-0" /> {w}</div>)}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Poster" subtitle="PNG or JPG under 700 KB">
            <FileField image label="Event poster" required value={f.poster} onChange={(v) => setF({ ...f, poster: v })} error={errors.poster} hint="Shown to reviewers and students." />
          </Card>
          <Card title="Required documents" subtitle="Prototype stores file names only">
            <div className="space-y-2.5">
              {REQUEST_DOCS.map((d) => <FileField key={d.key} label={d.label} required={d.required} hint={d.hint} value={f.documents[d.key]} onChange={(v) => setF({ ...f, documents: { ...f.documents, [d.key]: v } })} />)}
            </div>
            {errors.documents && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-ink">{errors.documents}</p>}
            <p className="mt-3 rounded-xl bg-amber-soft px-3 py-2 text-[10px] text-amber-ink">The signed permission letter must also be delivered to OSA on paper. Online review and hard-copy verification are tracked separately.</p>
          </Card>
          {!existing || existing.status === 'draft' ? (
            <Card title="Promotion (optional)">
              <label className="flex items-center gap-2 text-xs font-bold text-brand-900"><input type="checkbox" checked={promo.on} onChange={(e) => setPromo({ ...promo, on: e.target.checked })} /> Also request promotion when I submit</label>
              {promo.on && (
                <div className="mt-3 space-y-2">
                  {PROMO_CHANNELS.map((c) => <label key={c.key} className="flex items-start gap-2 text-[11px] text-ink-soft"><input type="checkbox" className="mt-0.5" checked={promo.channels.includes(c.key)} onChange={() => toggleCh(c.key)} /><span><b className="text-brand-900">{c.label}</b> — {c.hint}</span></label>)}
                  <label className="flex items-center gap-2 text-[11px] text-ink-soft"><input type="checkbox" checked={promo.posterSupport} onChange={(e) => setPromo({ ...promo, posterSupport: e.target.checked })} /> Poster publicity support (printing)</label>
                  <Textarea aria-label="Promotion note" rows={2} placeholder="Anything the Events Section should know" value={promo.note} onChange={(e) => setPromo({ ...promo, note: e.target.value })} />
                </div>
              )}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:col-span-2">
          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50"><Icon name="Send" className="h-4 w-4" /> {resubmitting ? 'Resubmit for review' : 'Submit for review'}</button>
          {!resubmitting && <button type="button" disabled={busy} onClick={() => save(false)} className="btn-ghost">Save draft</button>}
          <Link to="/club/requests" className="btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
