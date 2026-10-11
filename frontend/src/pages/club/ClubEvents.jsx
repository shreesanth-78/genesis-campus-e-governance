import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tabs } from '../../components/gov/Common';
import PosterPreview from '../../components/gov/PosterPreview';
import { EmptyState, Icon, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { fmtDayLong, fmt12, requestsForClub, TODAY_ISO } from '../../store/selectors';

export default function ClubEvents() {
  const { user } = useAuth();
  const { state } = useGov();
  const [tab, setTab] = useState('upcoming');
  const mine = useMemo(() => requestsForClub(state, user.clubId), [state, user.clubId]);
  const lists = {
    upcoming: mine.filter((r) => r.status === 'published' && r.date >= TODAY_ISO).sort((a, b) => a.date.localeCompare(b.date)),
    previous: mine.filter((r) => (r.status === 'completed' || (r.status === 'published' && r.date < TODAY_ISO))).sort((a, b) => b.date.localeCompare(a.date)),
  };
  const tabs = [{ key: 'upcoming', label: 'Upcoming', count: lists.upcoming.length }, { key: 'previous', label: 'Previous', count: lists.previous.length }];
  return (
    <div>
      <PageHeader eyebrow="Events" title="Our events" subtitle="Published upcoming events and your event history. Pending requests live under Event Requests." />
      <div className="mb-4"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      {lists[tab].length === 0 ? <EmptyState icon="CalendarDays" title={`No ${tab} events`} action={<Link to="/club/requests" className="btn-ghost">View requests</Link>} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lists[tab].map((r) => (
            <div key={r.id} className="card overflow-hidden">
              <PosterPreview request={r} className="h-40 rounded-none" />
              <div className="p-4">
                <div className="text-sm font-extrabold text-brand-900">{r.title}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-soft"><Icon name="CalendarDays" className="h-3.5 w-3.5" /> {fmtDayLong(r.date)} · {fmt12(r.startTime)}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-soft"><Icon name="MapPin" className="h-3.5 w-3.5" /> {r.venue || 'Hall to be announced'}</div>
                <Link to={`/club/requests/${r.id}`} className="link-arrow mt-3 inline-flex text-[11px]">Request details</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
