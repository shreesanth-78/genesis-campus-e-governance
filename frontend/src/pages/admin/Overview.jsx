import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, StatCard } from '../../components/gov/Common';
import { RequestStatus } from '../../components/gov/Badges';
import { Icon, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { adminStats, fmtDate, fmtDateTime, getClubFrom, needsOnlineReview, needsPhysical, readyForApproval } from '../../store/selectors';
import { useAdminBase } from './AdminLayout';
import { firstName } from '../../utils/helpers';

const KIND_ICON = { request: 'ClipboardList', promotion: 'Megaphone', physical: 'FileCheck2', approval: 'Stamp', publish: 'Send', club: 'Users' };

export default function Overview() {
  const { user } = useAuth();
  const base = useAdminBase();
  const nav = useNavigate();
  const { state } = useGov();
  const s = useMemo(() => adminStats(state), [state]);

  // Actionable queue for this role
  const queue = useMemo(() => {
    const rows = [];
    state.requests.forEach((r) => {
      if (needsOnlineReview(r)) rows.push({ r, action: 'Online review needed', tone: 'sky' });
      else if (readyForApproval(r)) rows.push({ r, action: 'Ready to give permission', tone: 'green' });
      else if (needsPhysical(r) && r.onlineReview.status === 'cleared') rows.push({ r, action: 'Hard-copy letter not verified', tone: 'amber' });
    });
    return rows.slice(0, 7);
  }, [state]);

  const stats = [
    { label: 'Awaiting online review', value: s.pendingOnline, icon: 'Eye', tone: 'sky', to: `${base}/requests?tab=review` },
    { label: 'Hard-copy checks pending', value: s.awaitingPhysical, icon: 'FileCheck2', tone: 'amber', to: `${base}/physical` },
    { label: 'Ready for your permission', value: s.readyForApproval, icon: 'Stamp', tone: 'green', to: `${base}/requests?tab=approval` },
    { label: 'Permission given · club to circulate', value: s.readyToPublish, icon: 'Send', tone: 'green', to: `${base}/requests?tab=publish` },
    { label: 'Promotion requests', value: s.pendingPromotions, icon: 'Megaphone', tone: 'plum', to: `${base}/promotions` },
    { label: 'Club applications', value: s.clubApps, icon: 'UserPlus', tone: 'plum', to: `${base}/club-applications` },
    { label: 'Venue conflicts', value: s.conflicts, icon: 'AlertTriangle', tone: s.conflicts ? 'rose' : 'green', to: `${base}/requests?tab=conflicts` },
    { label: 'Events circulated to students', value: s.published, icon: 'PartyPopper', tone: 'green', to: `${base}/requests?tab=published` },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Office of Student Affairs"
        title={`Welcome back, ${firstName(user.name)}`}
        subtitle="Review event requests, give permission to circulate them and decide new-club applications."
        action={<Link to={`${base}/requests`} className="btn-primary"><Icon name="ClipboardList" className="h-4 w-4" /> Open request queue</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((x) => <StatCard key={x.label} label={x.label} value={x.value} icon={x.icon} tone={x.tone} onClick={() => nav(x.to)} />)}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Needs attention" subtitle="Requests waiting on the next step" action={<Link to={`${base}/requests`} className="link-arrow text-[11px]">All requests <Icon name="ArrowRight" className="h-3 w-3" /></Link>} pad={false}>
          {queue.length === 0 ? (
            <p className="p-6 text-center text-xs text-ink-soft">Nothing is waiting. Great work!</p>
          ) : (
            <ul className="divide-y divide-line">
              {queue.map(({ r, action, tone }) => (
                <li key={r.id}>
                  <Link to={`${base}/requests/${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-brand-50/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-extrabold text-brand-900">{r.title}</div>
                      <div className="text-[10px] text-ink-mute">{r.id} · {getClubFrom(state, r.clubId)?.name} · {fmtDate(r.date)}</div>
                    </div>
                    <span className={`pill ${{ sky: 'bg-sky-soft text-sky-ink', green: 'bg-brand-50 text-brand-700', amber: 'bg-amber-soft text-amber-ink', gray: 'bg-[#f1eeee] text-ink-soft' }[tone]}`}>{action}</span>
                    <Icon name="ChevronRight" className="h-4 w-4 text-ink-mute" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" subtitle="Across clubs and administrators" pad={false}>
          <ul className="max-h-[420px] divide-y divide-line overflow-y-auto scroll-thin">
            {state.activity.slice(0, 10).map((a) => (
              <li key={a.id} className="flex gap-3 px-5 py-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon name={KIND_ICON[a.kind] || 'Info'} className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-xs text-brand-900"><b>{a.by}</b> <span className="text-ink-soft">{a.text}</span></p>
                  <p className="text-[10px] text-ink-mute">{a.role} · {fmtDateTime(a.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6" title="Latest requests" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-canvas text-[10px] font-bold uppercase tracking-wider text-ink-mute"><tr><th className="px-5 py-3">Event</th><th className="px-5 py-3">Club</th><th className="px-5 py-3">Event date</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[...state.requests].filter((r) => r.status !== 'draft').sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')).slice(0, 6).map((r) => (
                <tr key={r.id} className="hover:bg-brand-50/40">
                  <td className="px-5 py-3"><Link className="font-bold text-brand-900 hover:underline" to={`${base}/requests/${r.id}`}>{r.title}</Link></td>
                  <td className="px-5 py-3 text-ink-soft">{getClubFrom(state, r.clubId)?.name}</td>
                  <td className="px-5 py-3 text-ink-soft">{fmtDate(r.date)}</td>
                  <td className="px-5 py-3"><RequestStatus status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
