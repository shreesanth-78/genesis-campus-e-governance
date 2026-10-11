import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, Pagination, SearchBox, Tabs, usePaged } from '../../components/gov/Common';
import { OnlineBadge, PhysicalBadge, RequestStatus } from '../../components/gov/Badges';
import { EmptyState, Icon, PageHeader } from '../../components/ui';
import { Select } from '../../components/gov/Form';
import { useGov } from '../../context/GovContext';
import { REQUEST_CATEGORIES } from '../../data/govData';
import { findConflicts, fmtDate, getClubFrom, needsOnlineReview, needsPhysical, readyForApproval, readyToPublish } from '../../store/selectors';
import { useAdminBase } from './AdminLayout';

const TAB_FILTERS = {
  all: () => true,
  review: needsOnlineReview,
  physical: needsPhysical,
  approval: readyForApproval,
  publish: readyToPublish,
  published: (r) => r.status === 'published',
  returned: (r) => ['correction_requested', 'rejected'].includes(r.status),
  completed: (r) => r.status === 'completed',
};

export default function EventRequests() {
  const base = useAdminBase();
  const { state } = useGov();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'all';
  const q = params.get('q') || '';
  const cat = params.get('cat') || 'all';
  const set = (k, v) => {
    const n = new URLSearchParams(params);
    if (!v || v === 'all') n.delete(k); else n.set(k, v);
    setParams(n, { replace: true });
  };

  const submitted = useMemo(() => state.requests.filter((r) => r.status !== 'draft'), [state.requests]);
  const conflictIds = useMemo(() => new Set(submitted.filter((r) => ['submitted', 'approved'].includes(r.status) && findConflicts(state, r).length).map((r) => r.id)), [submitted, state]);

  const filters = { ...TAB_FILTERS, conflicts: (r) => conflictIds.has(r.id) };
  const tabs = [
    ['all', 'All'], ['review', 'Online review'], ['physical', 'Hard-copy'], ['approval', 'Ready for permission'],
    ['publish', 'Permission given'], ['published', 'Circulated'], ['returned', 'Returned'], ['completed', 'Past'], ['conflicts', 'Conflicts'],
  ].map(([key, label]) => ({ key, label, count: submitted.filter(filters[key]).length }));

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return submitted
      .filter((r) => (filters[tab] || filters.all)(r))
      .filter((r) => cat === 'all' || r.category === cat)
      .filter((r) => !t || `${r.title} ${r.id} ${getClubFrom(state, r.clubId)?.name}`.toLowerCase().includes(t))
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, tab, q, cat, state, conflictIds]);
  const paged = usePaged(list, 8, `${tab}|${q}|${cat}`);

  return (
    <div>
      <PageHeader eyebrow="Review" title="Event requests" subtitle="Online review and hard-copy verification, then OSA gives permission. The club circulates the event and later asks for a hall." />
      <div className="mb-4"><Tabs tabs={tabs} value={tab} onChange={(v) => set('tab', v)} /></div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={(v) => set('q', v)} placeholder="Search by event, club or request ID" />
        <Select value={cat} onChange={(e) => set('cat', e.target.value)} aria-label="Category" className="w-auto py-2.5">
          <option value="all">All categories</option>
          {REQUEST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="SearchX" title="No requests match" body="Change the tab, search or category filter." />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-canvas text-[10px] font-bold uppercase tracking-wider text-ink-mute">
                <tr><th className="px-5 py-3">Event</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Online review</th><th className="px-5 py-3">Hard copy</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paged.items.map((r) => (
                  <tr key={r.id} className="hover:bg-brand-50/40">
                    <td className="px-5 py-3.5">
                      <Link to={`${base}/requests/${r.id}`} className="font-extrabold text-brand-900 hover:underline">{r.title}</Link>
                      <div className="text-[10px] text-ink-mute">{r.id} · {getClubFrom(state, r.clubId)?.name} · v{r.version}</div>
                      {conflictIds.has(r.id) && <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-rose-ink"><Icon name="AlertTriangle" className="h-3 w-3" /> Venue conflict</div>}
                    </td>
                    <td className="px-5 py-3.5 text-ink-soft">{fmtDate(r.date)}</td>
                    <td className="px-5 py-3.5"><OnlineBadge status={r.onlineReview.status} /></td>
                    <td className="px-5 py-3.5"><PhysicalBadge status={r.physical.status} /></td>
                    <td className="px-5 py-3.5"><RequestStatus status={r.status} /></td>
                    <td className="px-5 py-3.5 text-right"><Link to={`${base}/requests/${r.id}`} className="btn-ghost px-3 py-1.5 text-[11px]">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-4"><Pagination {...paged} onPage={paged.setPage} /></div>
        </Card>
      )}
    </div>
  );
}
