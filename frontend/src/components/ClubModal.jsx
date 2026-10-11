import { useNavigate } from 'react-router-dom';
import { Icon } from './ui';
import { CLUB_TONES } from '../data/mockData';
import { useGov } from '../context/GovContext';
import { cn } from '../utils/helpers';
import { useApp } from '../context/AppContext';

export default function ClubModal({ club, onClose }) {
  const navigate = useNavigate();
  const { favorites, toggleFavorite, memberships, closedClubs, joinClub, leaveClub } = useApp();
  const { events: EVENTS } = useGov();
  if (!club) return null;
  const tone = CLUB_TONES[club.tone];
  const fav = favorites.includes(club.id);
  const member = memberships.includes(club.id);
  const closed = closedClubs.includes(club.id);
  const events = EVENTS.filter((e) => e.clubId === club.id && e.status !== 'closed');

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-brand-900/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={club.name} onClick={onClose}>
      <div className="relative w-full max-w-[480px] overflow-hidden rounded-3xl bg-white shadow-pop animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className={cn('relative h-28', tone.bg)}>
          <span className={cn('absolute right-3 top-0 select-none text-[96px] font-extrabold leading-none', tone.letter)}>{club.letter}</span>
          <span className="absolute bottom-[-24px] left-6 grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-card"><Icon name={club.icon} className={cn('h-6 w-6', tone.icon)} /></span>
          <button onClick={onClose} className="absolute left-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink-soft" aria-label="Close"><Icon name="X" className="h-4 w-4" /></button>
        </div>
        <div className="px-6 pb-6 pt-9">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-brand-600">{club.category}</div>
          <h3 className="mt-1 text-xl font-extrabold text-brand-900">{club.name}</h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">{club.blurb}</p>
          <div className="mt-4 flex gap-6 text-[11px] text-ink-soft">
            <span className="inline-flex items-center gap-1.5"><Icon name="Users" className="h-4 w-4" /> <b className="text-brand-900">{club.members}</b> members</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="CalendarDays" className="h-4 w-4" /> <b className="text-brand-900">{club.upcoming}</b> upcoming</span>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-mute">Approved events</div>
            {events.length === 0 ? (
              <p className="mt-2 text-xs text-ink-soft">No approved events are listed for this club right now.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {events.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => { onClose(); navigate(`/student/events/${e.id}`); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-brand-50">
                      <span><span className="block text-xs font-bold text-brand-900">{e.title}</span><span className="text-[10px] text-ink-mute">{e.dateLabel} · {e.venue}</span></span>
                      <Icon name="ChevronRight" className="h-4 w-4 text-ink-mute" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={cn('mt-5 rounded-2xl border px-4 py-3', member ? 'border-brand-200 bg-brand-50' : 'border-line bg-canvas')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-[11px] leading-snug text-ink-soft">
                {member ? <><b className="text-brand-900">You are a member.</b> The club’s announcements and discussion are in your Club Space.</> : <><b className="text-brand-900">Join this club</b> to read its announcements and talk with other members in the Club Space, instead of in WhatsApp.</>}
              </p>
              {member ? (
                <div className="flex gap-2">
                  <button onClick={() => { onClose(); navigate(`/student/club-space?club=${club.id}`); }} className="btn-primary px-3 py-2 text-[11px]"><Icon name="MessageCircle" className="h-3.5 w-3.5" /> Open space</button>
                  <button onClick={() => leaveClub(club.id)} className="btn-ghost px-3 py-2 text-[11px]">Leave</button>
                </div>
              ) : (
                <button onClick={() => joinClub(club.id)} disabled={closed} className="btn-primary px-3 py-2 text-[11px] disabled:opacity-50"><Icon name="UserPlus" className="h-3.5 w-3.5" /> {closed ? 'Not taking members' : 'Join club'}</button>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => toggleFavorite(club.id)} className={cn('btn-primary flex-1', fav && 'bg-brand-50 text-brand-800 hover:bg-brand-100')}>
              <Icon name="Heart" className="h-4 w-4" fill={fav ? 'currentColor' : 'none'} /> {fav ? 'Saved to favourites' : 'Save to favourites'}
            </button>
            <button onClick={onClose} className="btn-ghost">Close</button>
          </div>
          <p className="mt-3 text-[9px] text-ink-mute">Saving to favourites is only a bookmark. Joining gives you access to the club’s space.</p>
        </div>
      </div>
    </div>
  );
}
