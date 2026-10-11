import { useState } from 'react';
import { Icon } from '../ui';
import Modal from './Modal';
import PosterPreview from './PosterPreview';
import { Card, InfoRow } from './Common';
import { REQUEST_DOCS, PROMO_CHANNELS } from '../../data/govData';
import { fmtDayLong, fmt12, fmtDate, fmtDateTime, fmtSize } from '../../store/selectors';
import { cn } from '../../utils/helpers';

/** Shared read-only view of an event request (used by admin + club). */
export function RequestDetails({ request: r, club }) {
  return (
    <Card title="Event details">
      <p className="mb-3 text-xs leading-relaxed text-ink-soft">{r.description || 'No description yet.'}</p>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <InfoRow icon="Users" label="Organizing club">{club?.name || r.clubId}</InfoRow>
        <InfoRow icon="CalendarDays" label="Date">{r.date ? fmtDayLong(r.date) : '—'}</InfoRow>
        <InfoRow icon="Clock3" label="Time">{r.startTime ? `${fmt12(r.startTime)} – ${fmt12(r.endTime)}` : '—'}</InfoRow>
        <InfoRow icon="MapPin" label="Venue">{r.venue || 'To be allocated'}</InfoRow>
        <InfoRow icon="Ticket" label="Expected attendance">{r.capacity || '—'}</InfoRow>
        <InfoRow icon="Timer" label="Registration closes">{r.regDeadline ? `${fmtDate(r.regDeadline)}, ${fmt12(r.regDeadlineTime)}` : '—'}</InfoRow>
        <InfoRow icon="GraduationCap" label="Audience">{r.audience || '—'}</InfoRow>
        <InfoRow icon="ClipboardList" label="Category">{r.category || '—'}</InfoRow>
      </div>
    </Card>
  );
}

export function PosterCard({ request: r }) {
  const [open, setOpen] = useState(false);
  return (
    <Card title="Poster" subtitle={r.poster ? `${r.poster.name} · ${fmtSize(r.poster.size)}` : 'No poster uploaded'} action={r.poster?.dataUrl && <button onClick={() => setOpen(true)} className="link-arrow text-[11px]">View full size</button>}>
      <PosterPreview request={r} large />
      {open && (
        <Modal title="Poster" subtitle={r.poster?.name} onClose={() => setOpen(false)} size="lg">
          <img src={r.poster.dataUrl} alt={`Poster for ${r.title}`} className="mx-auto max-h-[70vh] rounded-xl" />
        </Modal>
      )}
    </Card>
  );
}

export function DocumentsCard({ request: r, action }) {
  const [view, setView] = useState(null);
  return (
    <Card title="Submitted documents" subtitle="Online copies. Hard-copy verification is recorded separately." action={action}>
      <ul className="divide-y divide-line">
        {REQUEST_DOCS.map((d) => {
          const f = r.documents?.[d.key];
          return (
            <li key={d.key} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', f ? 'bg-brand-50 text-brand-600' : d.required ? 'bg-rose-soft text-rose-ink' : 'bg-[#f1eeee] text-ink-mute')}>
                <Icon name={f ? 'FileCheck2' : d.required ? 'FileWarning' : 'FileText'} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-brand-900">
                  {d.label} {d.hardCopy && <span className="ml-1 rounded-full bg-amber-soft px-2 py-0.5 text-[9px] font-bold text-amber-ink">Hard copy also required</span>}
                </div>
                <div className="truncate text-[10px] text-ink-mute">{f ? `${f.name} · ${fmtSize(f.size)}` : d.required ? 'Missing (required)' : 'Not provided (optional)'}</div>
              </div>
              {f && <button onClick={() => setView({ d, f })} className="btn-ghost px-3 py-1.5 text-[11px]"><Icon name="Eye" className="h-3.5 w-3.5" /> View</button>}
            </li>
          );
        })}
      </ul>
      {view && (
        <Modal title={view.d.label} subtitle="Prototype document viewer" onClose={() => setView(null)} footer={<button onClick={() => setView(null)} className="btn-primary">Close</button>}>
          <div className="rounded-2xl border border-line bg-canvas p-5 text-center">
            <Icon name="FileText" className="mx-auto h-8 w-8 text-brand-500" />
            <div className="mt-2 text-sm font-bold text-brand-900">{view.f.name}</div>
            <div className="text-[11px] text-ink-soft">{fmtSize(view.f.size)}{view.f.uploadedAt ? ` · attached ${fmtDateTime(view.f.uploadedAt)}` : ''}</div>
            <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-ink-mute">
              This prototype stores file details only, not file contents, so a real preview isn’t available. A backend would serve the document here.
            </p>
          </div>
        </Modal>
      )}
    </Card>
  );
}

export function PromotionSummary({ promo, request, club, children }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold text-brand-900">{request?.title || promo.requestId}</div>
          <div className="text-[10px] text-ink-mute">{promo.id} · {club?.name || promo.clubId} · requested {fmtDateTime(promo.createdAt)}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {promo.channels.map((c) => (
          <span key={c} className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">{PROMO_CHANNELS.find((p) => p.key === c)?.label || c}</span>
        ))}
        {promo.posterSupport && <span className="rounded-full bg-plum-soft px-2.5 py-1 text-[10px] font-semibold text-plum-ink">Poster publicity support</span>}
      </div>
      {promo.note && <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">“{promo.note}”</p>}
      {promo.reviewNote && (
        <p className="mt-2 rounded-xl bg-canvas px-3 py-2 text-[11px] text-ink-soft"><b className="text-brand-900">Reviewer note ({promo.reviewedBy}):</b> {promo.reviewNote}</p>
      )}
      {children}
    </div>
  );
}
