import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, StatCard } from '../../components/gov/Common';
import { RequestStatus } from '../../components/gov/Badges';
import { Icon, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { fmtDate, fmtDateTime, getClubFrom, requestsForClub, TODAY_ISO } from '../../store/selectors';
import { firstName } from '../../utils/helpers';

export default function ClubOverview() {
  const { user } = useAuth();
  const { state } = useGov();
  const club = getClubFrom(state, user.clubId);
  const mine = useMemo(() => requestsForClub(state, user.clubId), [state, user.clubId]);
  const c = (f) => mine.filter(f).length;
  const needs = mine.filter((r) => r.status === 'correction_requested' || r.status === 'draft');
  const upcoming = mine.filter((r) => r.status === 'published' && r.date >= TODAY_ISO).sort((a, b) => a.date.localeCompare(b.date));
  const promoChanges = state.promotions.filter((p) => p.clubId === user.clubId && p.status === 'changes');
  const feed = state.activity.filter((a) => a.clubId === user.clubId).slice(0, 6);

  return (
    <div>
      <PageHeader eyebrow={club?.name} title={`Hello, ${firstName(user.name)}`} subtitle="Track your event requests from submission to publication."
        action={<Link to="/club/requests/new" className="btn-primary"><Icon name="Plus" className="h-4 w-4" /> New event request</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Under review" value={c((r) => r.status === 'submitted')} icon="Hourglass" tone="sky" />
        <StatCard label="Need your action" value={needs.length + promoChanges.length} icon="AlertTriangle" tone="amber" />
        <StatCard label="Approved / live" value={c((r) => ['approved', 'published'].includes(r.status))} icon="BadgeCheck" />
        <StatCard label="Members" value={club?.members ?? 0} icon="Users" tone="plum" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card title="Needs your action" pad={false}>
            {needs.length + promoChanges.length === 0 ? <p className="p-6 text-center text-xs text-ink-soft">All caught up.</p> : (
              <ul className="divide-y divide-line">
                {needs.map((r) => (
                  <li key={r.id}><Link to={`/club/requests/${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-brand-50/50">
                    <div className="min-w-0 flex-1"><div className="truncate text-xs font-extrabold text-brand-900">{r.title}</div><div className="text-[10px] text-ink-mute">{r.id} · {r.status === 'draft' ? 'Draft — not submitted' : 'Corrections requested — edit and resubmit'}</div></div>
                    <RequestStatus status={r.status} /><Icon name="ChevronRight" className="h-4 w-4 text-ink-mute" />
                  </Link></li>
                ))}
                {promoChanges.map((p) => (
                  <li key={p.id}><Link to="/club/promotions" className="flex items-center gap-3 px-5 py-3.5 hover:bg-brand-50/50">
                    <div className="min-w-0 flex-1"><div className="text-xs font-extrabold text-brand-900">Promotion {p.id}: changes requested</div><div className="text-[10px] text-ink-mute">{p.reviewNote}</div></div><Icon name="ChevronRight" className="h-4 w-4 text-ink-mute" />
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Upcoming published events" action={<Link to="/club/events" className="link-arrow text-[11px]">All events</Link>} pad={false}>
            {upcoming.length === 0 ? <p className="p-6 text-center text-xs text-ink-soft">No published upcoming events yet.</p> : (
              <ul className="divide-y divide-line">{upcoming.map((r) => <li key={r.id} className="flex items-center gap-3 px-5 py-3.5"><div className="min-w-0 flex-1 text-xs font-extrabold text-brand-900">{r.title}<div className="text-[10px] font-normal text-ink-mute">{fmtDate(r.date)} · {r.venue || 'Hall to be announced'}</div></div><span className="pill bg-brand-800 text-white">Live</span></li>)}</ul>
            )}
          </Card>
        </div>
        <Card title="Recent club activity" pad={false}>
          {feed.length === 0 ? <p className="p-6 text-center text-xs text-ink-soft">No recent activity.</p> : (
            <ul className="divide-y divide-line">{feed.map((a) => <li key={a.id} className="px-5 py-3"><p className="text-xs text-brand-900"><b>{a.by}</b> <span className="text-ink-soft">{a.text}</span></p><p className="text-[10px] text-ink-mute">{a.role} · {fmtDateTime(a.at)}</p></li>)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
