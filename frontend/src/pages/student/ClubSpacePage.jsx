import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ClubSpace from '../../components/ClubSpace';
import { EmptyState, Icon, PageHeader } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { useGov } from '../../context/GovContext';
import { cn } from '../../utils/helpers';

/** The student's side of the Club Space: one tab per club they joined. */
export default function ClubSpacePage() {
  const { memberships, leaveClub } = useApp();
  const { clubs } = useGov();
  const [params, setParams] = useSearchParams();
  const mine = useMemo(() => memberships.map((id) => clubs.find((c) => c.id === id)).filter(Boolean), [memberships, clubs]);
  const wanted = params.get('club');
  const current = mine.find((c) => c.id === wanted) ?? mine[0];

  return (
    <div>
      <PageHeader
        eyebrow="Your clubs"
        title="Club Space"
        subtitle="Announcements and discussion for the clubs you joined. Plan events here instead of in a WhatsApp group."
        action={<Link to="/student/clubs" className="btn-ghost"><Icon name="Users" className="h-4 w-4" /> Find clubs to join</Link>}
      />
      {mine.length === 0 ? (
        <EmptyState
          icon="MessageCircle"
          title="You have not joined a club yet"
          body="Open a club in the Clubs Directory and press Join. Its announcements and discussion appear here, visible only to its members."
          action={<Link to="/student/clubs" className="btn-primary">Browse clubs <Icon name="ArrowRight" className="h-4 w-4" /></Link>}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Your clubs">
            {mine.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={current.id === c.id}
                onClick={() => setParams({ club: c.id }, { replace: true })}
                className={cn('rounded-full border px-4 py-2 text-xs font-bold', current.id === c.id ? 'border-brand-700 bg-brand-800 text-white' : 'border-line bg-white text-ink-soft hover:bg-brand-50')}
              >
                {c.name}
              </button>
            ))}
            <button onClick={() => leaveClub(current.id)} className="ml-auto text-[11px] font-bold text-ink-mute hover:text-rose-ink">
              Leave {current.name}
            </button>
          </div>
          <ClubSpace key={current.id} clubId={current.id} />
        </>
      )}
    </div>
  );
}
