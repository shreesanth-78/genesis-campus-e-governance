import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import HallRequestCard from '../../components/gov/HallRequestCard';
import { Card } from '../../components/gov/Common';
import { OnlineBadge, PhysicalBadge, PromoStatus, RequestStatus } from '../../components/gov/Badges';
import Modal from '../../components/gov/Modal';
import { DocumentsCard, PosterCard, PromotionSummary, RequestDetails } from '../../components/gov/RequestSummary';
import { FeedbackList, Timeline, Tracker } from '../../components/gov/Tracker';
import { usePortal } from '../../components/gov/PortalShell';
import { EmptyState, Icon } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { ownsClub } from '../../store/permissions';
import { fmtDate, fmtDateTime, getClubFrom, getRequest } from '../../store/selectors';

export default function ClubRequestDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const gov = useGov();
  const { notify } = usePortal();
  const r = getRequest(gov.state, id);
  const [del, setDel] = useState(false);
  const [circulate, setCirculate] = useState(false);
  const promos = useMemo(() => gov.state.promotions.filter((p) => p.requestId === id), [gov.state.promotions, id]);

  if (!r || !ownsClub(user, r.clubId)) {
    return <EmptyState icon="Lock" title="Request not available" body="It doesn’t exist or belongs to another club." action={<Link to="/club/requests" className="btn-primary">Back to requests</Link>} />;
  }
  const club = getClubFrom(gov.state, r.clubId);
  const editable = ['draft', 'correction_requested'].includes(r.status);
  const canPromo = !['draft', 'rejected', 'completed'].includes(r.status) && !promos.some((p) => ['submitted', 'changes'].includes(p.status));

  return (
    <div>
      <Link to="/club/requests" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-brand-800"><Icon name="ArrowLeft" className="h-3.5 w-3.5" /> Event requests</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><div className="eyebrow">{r.id} · version {r.version}</div><h1 className="mt-2 text-3xl font-extrabold text-brand-900">{r.title}</h1><p className="mt-1 text-sm text-ink-soft">{r.submittedAt ? `Submitted ${fmtDateTime(r.submittedAt)}` : 'Not submitted yet'}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatus status={r.status} />
          {editable && <Link to={`/club/requests/${r.id}/edit`} className="btn-primary"><Icon name="Pencil" className="h-4 w-4" /> {r.status === 'draft' ? 'Edit & submit' : 'Correct & resubmit'}</Link>}
          {r.status === 'draft' && <button onClick={() => setDel(true)} className="btn-ghost text-rose-ink"><Icon name="Trash2" className="h-4 w-4" /> Delete</button>}
        </div>
      </div>

      {r.status !== 'draft' && <Card className="mb-6"><Tracker request={r} /></Card>}

      {r.status === 'correction_requested' && <div role="status" className="mb-6 flex gap-3 rounded-2xl border border-[#f0dcb4] bg-amber-soft px-4 py-3 text-xs text-amber-ink"><Icon name="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" /> Corrections were requested. Edit the request and resubmit it for another review.</div>}
      {r.status === 'rejected' && <div role="status" className="mb-6 flex gap-3 rounded-2xl border border-[#f1c9c4] bg-rose-soft px-4 py-3 text-xs text-rose-ink"><Icon name="XCircle" className="mt-0.5 h-4 w-4 shrink-0" /> This request was rejected. See the feedback below; you can start a new request addressing it.</div>}
      {r.status === 'approved' && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-800">
          <Icon name="BadgeCheck" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">OSA has given permission. Circulate the event on the portal so students can register: the number who sign up decides which hall you ask for.</span>
          <button onClick={() => setCirculate(true)} className="btn-primary"><Icon name="Send" className="h-4 w-4" /> Circulate to students</button>
        </div>
      )}
      {r.status === 'published' && <div role="status" className="mb-6 flex gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-800"><Icon name="PartyPopper" className="mt-0.5 h-4 w-4 shrink-0" /> Live for students{r.publication?.at ? ` since ${fmtDateTime(r.publication.at)}` : ''}.</div>}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {r.feedback.length > 0 && <Card title="Feedback from reviewers"><FeedbackList items={r.feedback} /></Card>}
          <RequestDetails request={r} club={club} />
          <DocumentsCard request={r} />
          <PosterCard request={r} />
        </div>
        <div className="space-y-6">
          {r.status === 'published' && (
            <HallRequestCard
              request={r}
              requests={gov.state.requests}
              registered={gov.state.registrationCounts?.[`evt-${r.id.toLowerCase()}`] ?? 0}
              onRequest={(p) => {
                const res = gov.requestHall(r.id, { ...p, registered: gov.state.registrationCounts?.[`evt-${r.id.toLowerCase()}`] ?? 0 });
                notify(res.ok ? 'Hall requested. The Events Section will allocate it.' : res.error, res.ok ? 'success' : 'info');
              }}
            />
          )}
          {r.status !== 'draft' && (
            <Card title="Review status">
              <dl className="space-y-3 text-xs">
                <div className="flex items-center justify-between"><dt className="font-semibold text-ink-soft">Online review</dt><dd><OnlineBadge status={r.onlineReview.status} /></dd></div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-ink-soft">Hard-copy letter</dt><dd><PhysicalBadge status={r.physical.status} /></dd></div>
                {r.physical.status === 'verified' && <div className="rounded-xl bg-canvas px-3 py-2 text-[11px] text-ink-soft">Ref {r.physical.refNo} · received {r.physical.receivedOn ? fmtDate(r.physical.receivedOn) : '—'}</div>}
                {r.physical.status === 'issue' && <div className="rounded-xl bg-amber-soft px-3 py-2 text-[11px] text-amber-ink">Issue with the hard copy: {r.physical.note}</div>}
                {r.physical.status === 'pending' && r.status === 'submitted' && <div className="rounded-xl bg-canvas px-3 py-2 text-[11px] text-ink-soft">Deliver the signed permission letter to the OSA office.</div>}
                <div className="flex items-center justify-between"><dt className="font-semibold text-ink-soft">OSA permission</dt><dd>{r.approval ? <span className="pill bg-brand-50 text-brand-700">Granted</span> : <span className="pill bg-[#f1eeee] text-ink-soft">Pending</span>}</dd></div>
              </dl>
            </Card>
          )}
          <Card title="Promotion" action={canPromo && <PromoButton request={r} />}>
            {promos.length === 0 ? <p className="text-[11px] text-ink-soft">No promotion requested yet.</p> : (
              <div className="space-y-3">{promos.map((p) => <PromotionSummary key={p.id} promo={p} request={r} club={club}><div className="mt-3"><PromoStatus status={p.status} /> {p.status === 'changes' && <Link to="/club/promotions" className="link-arrow ml-2 text-[11px]">Update</Link>}</div></PromotionSummary>)}</div>
            )}
          </Card>
          <Card title="History"><Timeline entries={r.history} /></Card>
        </div>
      </div>

      {circulate && <Modal title="Circulate to students?" size="sm" onClose={() => setCirculate(false)} footer={<><button className="btn-ghost" onClick={() => setCirculate(false)}>Cancel</button><button className="btn-primary" onClick={() => { const res = gov.publishRequest(r.id); if (res.ok) { notify('Circulated. Students have been notified and can register.'); setCirculate(false); } else notify(res.error, 'info'); }}>Circulate</button></>}><p className="text-xs leading-relaxed text-ink-soft">“{r.title}” will appear on the Student Dashboard and students are notified. You will see how many register, then request a hall.</p></Modal>}
      {del && <Modal title="Delete this draft?" size="sm" onClose={() => setDel(false)} footer={<><button className="btn-ghost" onClick={() => setDel(false)}>Cancel</button><button className="btn-primary" onClick={() => { const res = gov.deleteDraft(r.id); if (res.ok) { notify('Draft deleted.'); nav('/club/requests'); } else notify(res.error, 'info'); }}>Delete</button></>}><p className="text-xs text-ink-soft">“{r.title}” will be removed permanently.</p></Modal>}
    </div>
  );
}

function PromoButton({ request }) {
  const nav = useNavigate();
  return <button onClick={() => nav('/club/promotions', { state: { requestId: request.id } })} className="btn-ghost px-3 py-1.5 text-[11px]"><Icon name="Megaphone" className="h-3.5 w-3.5" /> Request promotion</button>;
}
