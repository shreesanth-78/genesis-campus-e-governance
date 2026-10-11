import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '../../components/gov/Common';
import { Field, Input, Textarea } from '../../components/gov/Form';
import Modal from '../../components/gov/Modal';
import ReasonDialog from '../../components/gov/ReasonDialog';
import { FeedbackList, Timeline, Tracker } from '../../components/gov/Tracker';
import { OnlineBadge, PhysicalBadge, PromoStatus, RequestStatus } from '../../components/gov/Badges';
import { DocumentsCard, PosterCard, PromotionSummary, RequestDetails } from '../../components/gov/RequestSummary';
import { usePortal } from '../../components/gov/PortalShell';
import { EmptyState, Icon } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { can, deniedReason } from '../../store/permissions';
import { findConflicts, fmtDate, fmtDateTime, getClubFrom, getRequest, hallOf, TODAY_ISO } from '../../store/selectors';
import { precheckRequest, aiMode } from '../../services/ai';
import { VENUES } from '../../data/govData';
import HallPermission, { HallBadge } from '../../components/gov/HallPermission';
import { useAdminBase } from './AdminLayout';

const CORRECTION_REASONS = ['Poster needs changes', 'Missing document', 'Venue/time clash', 'Budget unclear', 'Description incomplete', 'Policy non-compliance'];
const REJECT_REASONS = ['Violates campus policy', 'Venue unavailable', 'Insufficient notice', 'Duplicate event', 'Safety concerns', 'Incomplete submission'];

function Step({ n, title, badge, children, locked }) {
  return (
    <Card title={`${n}. ${title}`} action={badge} className={locked ? 'opacity-90' : ''}>
      {children}
    </Card>
  );
}

export default function RequestDetail() {
  const { id } = useParams();
  const base = useAdminBase();
  const nav = useNavigate();
  const { user } = useAuth();
  const gov = useGov();
  const { notify } = usePortal();
  const { state } = gov;
  const r = getRequest(state, id);

  const [dialog, setDialog] = useState(null); // 'correction' | 'reject' | 'physical' | 'approve' | 'publish'
  const [ai, setAi] = useState(null);

  const conflicts = useMemo(() => (r ? findConflicts(state, r) : []), [state, r]);
  const promos = useMemo(() => state.promotions.filter((p) => p.requestId === id), [state.promotions, id]);

  if (!r) {
    return <EmptyState icon="SearchX" title="Request not found" body="It may have been removed or the link is incorrect." action={<Link to={`${base}/requests`} className="btn-primary">Back to requests</Link>} />;
  }
  const club = getClubFrom(state, r.clubId);
  const canReview = can(user, 'request.review');
  const canPhys = can(user, 'request.physical');
  const canHall = can(user, 'request.hall');
  const hallApproved = hallOf(r).status === 'approved';
  const canApprove = can(user, 'request.approve');
  const canPublish = can(user, 'request.publish');
  const open = r.status === 'submitted';

  const done = (res, msg) => {
    if (res.ok) { notify(msg); setDialog(null); } else notify(res.error, 'info');
    return res;
  };

  const runPrecheck = () => {
    const venue = VENUES.find((v) => v.name === r.venue);
    setAi(precheckRequest(r, { conflicts, venueCapacity: venue?.capacity }));
  };

  const approveBlockers = [];
  if (!hallApproved) approveBlockers.push('The hall must be approved');
  if (r.onlineReview.status !== 'cleared') approveBlockers.push('Online review must be cleared');
  if (r.physical.status !== 'verified') approveBlockers.push('Hard-copy letter must be verified');

  return (
    <div>
      <Link to={`${base}/requests`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-brand-800"><Icon name="ArrowLeft" className="h-3.5 w-3.5" /> Event requests</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{r.id} · version {r.version}</div>
          <h1 className="mt-2 text-3xl font-extrabold text-brand-900">{r.title}</h1>
          <p className="mt-1 text-sm text-ink-soft">{club?.name} · submitted {r.submittedAt ? fmtDateTime(r.submittedAt) : '—'}</p>
        </div>
        <RequestStatus status={r.status} />
      </div>

      <Card className="mb-6"><Tracker request={r} /></Card>

      {conflicts.length > 0 && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-[#f1c9c4] bg-rose-soft px-4 py-3 text-xs text-rose-ink">
          <Icon name="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>Venue conflict.</b> {conflicts.map((c) => `${c.title} (${c.id}, ${c.startTime}–${c.endTime})`).join('; ')} overlaps at {r.venue} on {fmtDate(r.date)}.</div>
        </div>
      )}
      {r.status === 'draft' && <div className="mb-6 rounded-2xl border border-line bg-white px-4 py-3 text-xs text-ink-soft">This request is still a draft and hasn’t been submitted.</div>}
      {r.status === 'published' && !r.legacyEventId && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-800">
          <Icon name="CheckCircle2" className="h-4 w-4" /> Live on the Student Dashboard since {fmtDateTime(r.publication.at)}.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <RequestDetails request={r} club={club} />
          <DocumentsCard request={r} />
          <PosterCard request={r} />
          {r.feedback.length > 0 && <Card title="Feedback sent to the club"><FeedbackList items={r.feedback} /></Card>}
          <Card title="Activity history"><Timeline entries={r.history} /></Card>
        </div>

        <div className="space-y-6">
          <Step n={1} title="Hall permission" badge={<HallBadge status={hallOf(r).status} />}>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-soft">The club asked for this hall with its request. Approve it, assign a hall that fits the expected crowd, or send the request back.</p>
            <HallPermission
              request={r}
              requests={state.requests}
              canDecide={canHall}
              open={open}
              onApprove={() => done(gov.reviewHall(r.id, { decision: 'approve' }), 'Hall approved.')}
              onReassign={(venue, note) => done(gov.reviewHall(r.id, { decision: 'reassign', venue, note }), 'Hall assigned.')}
              onReject={(note) => done(gov.reviewHall(r.id, { decision: 'reject', note }), 'Sent back to the club.')}
            />
          </Step>

          <Step n={2} title="Online review" badge={<OnlineBadge status={r.onlineReview.status} />}>
            <p className="text-[11px] leading-relaxed text-ink-soft">Check the details, poster and uploaded documents. This is independent of the hard-copy check.</p>
            {r.onlineReview.by && <p className="mt-2 text-[10px] text-ink-mute">Last action by {r.onlineReview.by} · {fmtDateTime(r.onlineReview.at)}</p>}
            {canReview ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button disabled={!open || !hallApproved || r.onlineReview.status === 'cleared'} onClick={() => done(gov.reviewRequest(r.id, { decision: 'clear' }), 'Online review cleared.')} className="btn-primary disabled:opacity-40"><Icon name="Check" className="h-4 w-4" /> Clear online review</button>
                <button disabled={!open} onClick={() => setDialog('correction')} className="btn-ghost disabled:opacity-40">Request corrections</button>
                <button disabled={!open} onClick={() => setDialog('reject')} className="btn-ghost text-rose-ink disabled:opacity-40">Reject</button>
              </div>
            ) : <p className="mt-3 text-[11px] text-ink-mute">{deniedReason('request.review')}</p>}
            {canReview && open && !hallApproved && <p className="mt-2 text-[10px] text-amber-ink">Approve the hall first: the online review can be cleared once the hall has permission.</p>}
          </Step>

          <Step n={3} title="Hard-copy letter verification" badge={<PhysicalBadge status={r.physical.status} />}>
            <p className="text-[11px] leading-relaxed text-ink-soft">Record that the signed permission letter was received on paper and checked. Recorded separately from the online review.</p>
            {r.physical.status !== 'pending' && (
              <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3 text-[11px]">
                <div><dt className="text-ink-mute">Recorded by</dt><dd className="font-bold text-brand-900">{r.physical.by}</dd></div>
                <div><dt className="text-ink-mute">Received on</dt><dd className="font-bold text-brand-900">{r.physical.receivedOn ? fmtDate(r.physical.receivedOn) : '—'}</dd></div>
                <div><dt className="text-ink-mute">Reference</dt><dd className="font-bold text-brand-900">{r.physical.refNo || '—'}</dd></div>
                {r.physical.note && <div className="col-span-2"><dt className="text-ink-mute">Note</dt><dd className="font-bold text-brand-900">{r.physical.note}</dd></div>}
              </dl>
            )}
            {canPhys ? (
              <button disabled={!open} onClick={() => setDialog('physical')} className="btn-ghost mt-4 disabled:opacity-40"><Icon name="FileCheck2" className="h-4 w-4" /> {r.physical.status === 'pending' ? 'Record hard-copy check' : 'Update hard-copy check'}</button>
            ) : <p className="mt-3 text-[11px] text-ink-mute">{deniedReason('request.physical')}</p>}
          </Step>

          <Step n={4} title="Final approval (OSA)" badge={r.approval ? <span className="pill bg-brand-50 text-brand-700">Granted</span> : <span className="pill bg-[#f1eeee] text-ink-soft">Not yet</span>}>
            {r.approval ? (
              <p className="text-[11px] text-ink-soft">Approved by <b className="text-brand-900">{r.approval.by}</b> · {fmtDateTime(r.approval.at)}{r.approval.note ? ` — “${r.approval.note}”` : ''}</p>
            ) : (
              <>
                <p className="text-[11px] leading-relaxed text-ink-soft">Only authorized OSA staff can grant final approval, after the online review is cleared and the hard copy is verified.</p>
                {approveBlockers.length > 0 && open && <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-ink">{approveBlockers.map((b) => <li key={b}>{b}</li>)}</ul>}
              </>
            )}
            {!r.approval && (canApprove ? (
              <button disabled={!open || approveBlockers.length > 0} onClick={() => setDialog('approve')} className="btn-primary mt-4 disabled:opacity-40"><Icon name="Stamp" className="h-4 w-4" /> Grant final approval</button>
            ) : (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-[11px] text-ink-soft"><Icon name="Lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {deniedReason('request.approve')}</div>
            ))}
          </Step>

          <Step n={5} title="Publish to students" badge={r.status === 'published' ? <span className="pill bg-brand-800 text-white">Published</span> : null}>
            <p className="text-[11px] leading-relaxed text-ink-soft">Only OSA-approved events can be published. Publishing adds the event to the Student Dashboard and sends an in-app notification.</p>
            {canPublish && (
              <button disabled={r.status !== 'approved'} onClick={() => setDialog('publish')} className="btn-primary mt-4 disabled:opacity-40"><Icon name="Send" className="h-4 w-4" /> Publish &amp; notify students</button>
            )}
            {r.status !== 'approved' && r.status !== 'published' && <p className="mt-2 text-[10px] text-ink-mute">Unapproved requests are never shown to students.</p>}
          </Step>

          <Card title="AI pre-check" subtitle={aiMode()} action={<button onClick={runPrecheck} className="btn-ghost px-3 py-1.5 text-[11px]"><Icon name="Sparkles" className="h-3.5 w-3.5" /> Run</button>}>
            {!ai ? <p className="text-[11px] text-ink-soft">Optional advisory scan for policy, capacity and scheduling issues. It never decides anything.</p> : (
              <ul className="space-y-2">
                {ai.findings.map((f, i) => (
                  <li key={i} className={`rounded-xl px-3 py-2 text-[11px] ${f.level === 'warn' ? 'bg-amber-soft text-amber-ink' : f.level === 'risk' ? 'bg-rose-soft text-rose-ink' : 'bg-brand-50 text-brand-800'}`}>{f.text}</li>
                ))}
                <li className="text-[10px] text-ink-mute">Source: {ai.source === 'ai-service' ? 'AI service' : 'Local mock fallback'}</li>
              </ul>
            )}
          </Card>

          <Card title="Promotion requests">
            {promos.length === 0 ? <p className="text-[11px] text-ink-soft">No promotion requested for this event.</p> : (
              <div className="space-y-3">
                {promos.map((p) => (
                  <PromotionSummary key={p.id} promo={p} request={r} club={club}>
                    <div className="mt-3 flex items-center justify-between"><PromoStatus status={p.status} /><Link to={`${base}/promotions`} className="link-arrow text-[11px]">Review</Link></div>
                  </PromotionSummary>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {dialog === 'correction' && (
        <ReasonDialog title="Request corrections" subtitle="The club will see this and can edit and resubmit." reasons={CORRECTION_REASONS} confirmLabel="Send corrections" onClose={() => setDialog(null)}
          onConfirm={(reasons, note) => done(gov.reviewRequest(r.id, { decision: 'correction', reasons, note }), 'Corrections sent to the club.')} />
      )}
      {dialog === 'reject' && (
        <ReasonDialog title="Reject request" subtitle="A written reason is required and is shown to the club." reasons={REJECT_REASONS} requireNote tone="danger" confirmLabel="Reject request" noteLabel="Reason for rejection" onClose={() => setDialog(null)}
          onConfirm={(reasons, note) => done(gov.reviewRequest(r.id, { decision: 'reject', reasons, note }), 'Request rejected.')} />
      )}
      {dialog === 'physical' && <PhysicalDialog request={r} onClose={() => setDialog(null)} onSave={(p) => done(gov.recordPhysical(r.id, p), p.status === 'verified' ? 'Hard-copy letter verified.' : 'Hard-copy issue recorded.')} />}
      {dialog === 'approve' && <ApproveDialog request={r} onClose={() => setDialog(null)} onSave={(note) => done(gov.finalApprove(r.id, { note }), 'Final approval granted.')} />}
      {dialog === 'publish' && (
        <Modal title="Publish to Student Dashboard?" onClose={() => setDialog(null)} size="sm" footer={<><button className="btn-ghost" onClick={() => setDialog(null)}>Cancel</button><button className="btn-primary" onClick={() => { const res = done(gov.publishRequest(r.id), 'Published. Students have been notified.'); if (res.ok) nav(`${base}/requests/${r.id}`); }}>Publish</button></>}>
          <p className="text-xs leading-relaxed text-ink-soft">“{r.title}” will appear as an official event for students and a notification will be sent in-app.</p>
        </Modal>
      )}
    </div>
  );
}

function PhysicalDialog({ request: r, onClose, onSave }) {
  const [status, setStatus] = useState(r.physical.status === 'issue' ? 'issue' : 'verified');
  const [receivedOn, setReceivedOn] = useState(r.physical.receivedOn || TODAY_ISO);
  const [refNo, setRefNo] = useState(r.physical.refNo || '');
  const [note, setNote] = useState(r.physical.note || '');
  return (
    <Modal title="Hard-copy letter check" subtitle="Faculty coordinator permission letter" onClose={onClose}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave({ status, receivedOn, refNo, note })}>Save</button></>}>
      <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Outcome">
        {[['verified', 'Letter verified'], ['issue', 'Issue found']].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={status === k} onClick={() => setStatus(k)} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${status === k ? 'border-brand-700 bg-brand-800 text-white' : 'border-line bg-white text-ink-soft'}`}>{l}</button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date received" htmlFor="p-date"><Input id="p-date" type="date" value={receivedOn} max={TODAY_ISO} onChange={(e) => setReceivedOn(e.target.value)} /></Field>
        <Field label="Hard-copy reference no." htmlFor="p-ref"><Input id="p-ref" value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="e.g. OSA/HC/2026/0450" /></Field>
      </div>
      <Field className="mt-4" label={status === 'issue' ? 'Describe the issue' : 'Note (optional)'} htmlFor="p-note"><Textarea id="p-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function ApproveDialog({ request: r, onClose, onSave }) {
  const [note, setNote] = useState('');
  return (
    <Modal title="Grant final approval" subtitle={r.title} onClose={onClose}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(note)}><Icon name="Stamp" className="h-4 w-4" /> Approve event</button></>}>
      <ul className="mb-4 space-y-1.5 text-[11px] text-ink-soft">
        <li className="flex items-center gap-2"><Icon name="CheckCircle2" className="h-4 w-4 text-brand-500" /> Online review cleared by {r.onlineReview.by}</li>
        <li className="flex items-center gap-2"><Icon name="CheckCircle2" className="h-4 w-4 text-brand-500" /> Hard copy {r.physical.refNo} verified by {r.physical.by}</li>
      </ul>
      <Field label="Approval note (optional)" htmlFor="a-note"><Textarea id="a-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <p className="mt-3 text-[10px] text-ink-mute">Approval doesn’t publish the event. Publishing is a separate step.</p>
    </Modal>
  );
}
