import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, Pagination, SearchBox, StatCard, Tabs, usePaged } from '../../components/gov/Common';
import { RequestStatus } from '../../components/gov/Badges';
import HallPermission, { HallBadge, PriorityPill } from '../../components/gov/HallPermission';
import { RequestDetails } from '../../components/gov/RequestSummary';
import { usePortal } from '../../components/gov/PortalShell';
import { Timeline } from '../../components/gov/Tracker';
import { EmptyState, Icon, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { can } from '../../store/permissions';
import { fmtDate, getClubFrom, getRequest, hallOf } from '../../store/selectors';
import { firstName } from '../../utils/helpers';
import { useAdminBase } from './AdminLayout';

const ORDER = { high: 0, medium: 1, low: 2 };
const regCount = (state, r) => state.registrationCounts?.[`evt-${r.id.toLowerCase()}`] ?? 0;
// Events that are circulated (or past) and can have a hall.
const circulated = (r) => r.status === 'published';

const TABS = {
  requested: (r) => hallOf(r).status === 'requested',
  approved: (r) => hallOf(r).status === 'approved',
  waiting: (r) => ['none', 'rejected'].includes(hallOf(r).status),
  all: () => true,
};

/** Highest priority first, then the earliest event. */
const byPriority = (a, b) => (ORDER[hallOf(a).priority] ?? 3) - (ORDER[hallOf(b).priority] ?? 3) || a.date.localeCompare(b.date);

/* ------------------------------ overview ----------------------------- */
export function EventsOverview() {
  const { user } = useAuth();
  const base = useAdminBase();
  const { state } = useGov();
  const nav = useNavigate();
  const events = useMemo(() => state.requests.filter(circulated), [state.requests]);
  const queue = events.filter(TABS.requested).sort(byPriority);
  return (
    <div>
      <PageHeader
        eyebrow="Events Section"
        title={`Welcome back, ${firstName(user.name)}`}
        subtitle="Clubs ask for a hall once students are registering for an event OSA has allowed. You allocate the halls."
        action={<Link to={`${base}/halls`} className="btn-primary"><Icon name="Building2" className="h-4 w-4" /> Open hall requests</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting a hall decision" value={queue.length} icon="Building2" tone="amber" onClick={() => nav(`${base}/halls?tab=requested`)} />
        <StatCard label="Halls allocated" value={events.filter(TABS.approved).length} icon="CheckCircle2" tone="green" onClick={() => nav(`${base}/halls?tab=approved`)} />
        <StatCard label="Events yet to ask for a hall" value={events.filter(TABS.waiting).length} icon="Clock3" tone="sky" onClick={() => nav(`${base}/halls?tab=waiting`)} />
      </div>
      <Card className="mt-6" title="Waiting for you" subtitle="Highest priority first" pad={false}>
        {queue.length === 0 ? (
          <p className="p-6 text-center text-xs text-ink-soft">No hall requests are waiting.</p>
        ) : (
          <ul className="divide-y divide-line">
            {queue.map((r) => (
              <li key={r.id}>
                <Link to={`${base}/halls/${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-brand-50/50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-extrabold text-brand-900">{r.title}</div>
                    <div className="text-[10px] text-ink-mute">{getClubFrom(state, r.clubId)?.name} · {fmtDate(r.date)} · asks for {hallOf(r).requestedVenue} · {hallOf(r).registered} registered</div>
                  </div>
                  <PriorityPill priority={hallOf(r).priority} />
                  <Icon name="ChevronRight" className="h-4 w-4 text-ink-mute" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- list ------------------------------- */
export function HallRequestsList() {
  const base = useAdminBase();
  const { state } = useGov();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'requested';
  const q = params.get('q') || '';
  const set = (k, v) => {
    const n = new URLSearchParams(params);
    if (!v) n.delete(k); else n.set(k, v);
    setParams(n, { replace: true });
  };
  const events = useMemo(() => state.requests.filter(circulated), [state.requests]);
  const tabs = [['requested', 'Awaiting a decision'], ['approved', 'Allocated'], ['waiting', 'Not requested yet'], ['all', 'All']].map(([key, label]) => ({ key, label, count: events.filter(TABS[key]).length }));
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return events.filter(TABS[tab] || TABS.all).filter((r) => !t || `${r.title} ${r.id} ${getClubFrom(state, r.clubId)?.name}`.toLowerCase().includes(t)).sort(byPriority);
  }, [events, tab, q, state]);
  const paged = usePaged(list, 8, `${tab}|${q}`);

  return (
    <div>
      <PageHeader eyebrow="Halls" title="Hall requests" subtitle="Clubs ask for a hall using the number of students registered. Higher-priority events come first." />
      <div className="mb-4"><Tabs tabs={tabs} value={tab} onChange={(v) => set('tab', v)} /></div>
      <div className="mb-4 flex"><SearchBox value={q} onChange={(v) => set('q', v)} placeholder="Search by event, club or request ID" /></div>
      {list.length === 0 ? (
        <EmptyState icon="Building2" title="Nothing here" body="No events match this tab." />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-canvas text-[10px] font-bold uppercase tracking-wider text-ink-mute">
                <tr><th className="px-5 py-3">Event</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Registered</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Hall</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paged.items.map((r) => {
                  const h = hallOf(r);
                  return (
                    <tr key={r.id} className="hover:bg-brand-50/40">
                      <td className="px-5 py-3.5">
                        <Link to={`${base}/halls/${r.id}`} className="font-extrabold text-brand-900 hover:underline">{r.title}</Link>
                        <div className="text-[10px] text-ink-mute">{r.id} · {getClubFrom(state, r.clubId)?.name}</div>
                      </td>
                      <td className="px-5 py-3.5 text-ink-soft">{fmtDate(r.date)}</td>
                      <td className="px-5 py-3.5 font-bold text-brand-900">{h.registered || regCount(state, r)}</td>
                      <td className="px-5 py-3.5"><PriorityPill priority={h.priority} /></td>
                      <td className="px-5 py-3.5"><div className="font-semibold text-brand-900">{h.status === 'approved' ? r.venue : h.requestedVenue || '—'}</div><HallBadge status={h.status} /></td>
                      <td className="px-5 py-3.5 text-right"><Link to={`${base}/halls/${r.id}`} className="btn-ghost px-3 py-1.5 text-[11px]">Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-4"><Pagination {...paged} onPage={paged.setPage} /></div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------- detail ------------------------------ */
export function HallRequestDetail() {
  const { id } = useParams();
  const base = useAdminBase();
  const { user } = useAuth();
  const gov = useGov();
  const { notify } = usePortal();
  const { state } = gov;
  const r = getRequest(state, id);
  if (!r || !circulated(r)) {
    return <EmptyState icon="SearchX" title="Event not found" body="Only events that have been circulated to students can have a hall." action={<Link to={`${base}/halls`} className="btn-primary">Back to hall requests</Link>} />;
  }
  const club = getClubFrom(state, r.clubId);
  const done = (res, msg) => {
    notify(res.ok ? msg : res.error, res.ok ? 'success' : 'info');
    return res;
  };
  return (
    <div>
      <Link to={`${base}/halls`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-brand-800"><Icon name="ArrowLeft" className="h-3.5 w-3.5" /> Hall requests</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{r.id}</div>
          <h1 className="mt-2 text-3xl font-extrabold text-brand-900">{r.title}</h1>
          <p className="mt-1 text-sm text-ink-soft">{club?.name} · {fmtDate(r.date)} · {r.startTime}–{r.endTime}</p>
        </div>
        <RequestStatus status={r.status} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <RequestDetails request={r} club={club} />
          <Card title="History"><Timeline entries={r.history} /></Card>
        </div>
        <div className="space-y-6">
          <Card title="Hall" action={<HallBadge status={hallOf(r).status} />}>
            <HallPermission
              request={r}
              requests={state.requests}
              canDecide={can(user, 'request.hall')}
              onApprove={() => done(gov.reviewHall(r.id, { decision: 'approve' }), 'Hall allocated.')}
              onReassign={(venue, note) => done(gov.reviewHall(r.id, { decision: 'reassign', venue, note }), 'Hall assigned.')}
              onReject={(note) => done(gov.reviewHall(r.id, { decision: 'reject', note }), 'Sent back to the club.')}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
