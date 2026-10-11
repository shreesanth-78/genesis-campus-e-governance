import { NavLink, useNavigate } from 'react-router-dom';
import { Icon, Logo } from './ui';
import { cn } from '../utils/helpers';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export const STUDENT_NAV = [
  { to: '/student/dashboard', label: 'Dashboard', icon: 'LayoutGrid' },
  { to: '/student/events', label: 'Explore Events', icon: 'Compass' },
  { to: '/student/calendar', label: 'Event Calendar', icon: 'CalendarDays' },
  { to: '/student/registrations', label: 'My Registrations', icon: 'Ticket' },
  { to: '/student/clubs', label: 'Clubs Directory', icon: 'Users' },
  { to: '/student/club-space', label: 'Club Space', icon: 'MessageCircle' },
  { to: '/student/start-club', label: 'Start a Club', icon: 'Lightbulb' },
  { to: '/student/favorites', label: 'My Favorite Clubs', icon: 'Heart' },
  { to: '/student/notifications', label: 'Notifications', icon: 'Bell', badge: true },
  { to: '/student/assistant', label: 'Campus AI Assistant', icon: 'Sparkles' },
  { to: '/student/profile', label: 'My Profile', icon: 'User' },
  { to: '/student/settings', label: 'Settings', icon: 'Settings' },
];

export function SidebarContent({ items, sectionLabel, onNavigate, showAssistantCard = true, footer = null }) {
  const navigate = useNavigate();
  const { unreadCount } = useApp();
  const { logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-5 pt-7">
        <Logo />
      </div>
      <div className="px-6 pb-2 pt-3 text-[9px] font-bold uppercase tracking-[0.18em] text-ink-mute">{sectionLabel}</div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-4 scroll-thin" aria-label="Primary">
        {items.map((it) => (
          <NavLink
            key={it.label}
            to={it.to}
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-[11px] text-[13px] font-medium transition',
                isActive
                  ? 'bg-brand-50 font-bold text-brand-700 before:absolute before:left-[-16px] before:top-2 before:h-[calc(100%-16px)] before:w-[3px] before:rounded-full before:bg-brand-500'
                  : 'text-ink-soft hover:bg-brand-50/60 hover:text-brand-800'
              )
            }
          >
            <Icon name={it.icon} className="h-[18px] w-[18px]" />
            <span className="flex-1">{it.label}</span>
            {(it.count ?? (it.badge ? unreadCount : 0)) > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#ece7e8] px-1.5 text-[10px] font-bold text-ink-soft">
                {it.count ?? unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      {footer}
      {showAssistantCard && !footer && (
        <div className="m-4 rounded-2xl border border-line bg-white p-4 shadow-card">
          <div className="flex items-center gap-1 text-brand-500">
            <Icon name="Sparkles" className="h-4 w-4" />
            <span className="text-[10px]">✳ ✳</span>
          </div>
          <div className="mt-3 text-[13px] font-bold text-brand-900">Need help navigating campus?</div>
          <p className="mt-1 text-[11px] leading-snug text-ink-soft">Get a quick answer from your campus guide.</p>
          <button onClick={() => { navigate('/student/assistant'); onNavigate?.(); }} className="btn-primary mt-3 w-full">
            <Icon name="Sparkles" className="h-3.5 w-3.5" /> Ask Campus AI
          </button>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-mute">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Academic Year 2026–27
          </div>
        </div>
      )}
      <div className="border-t border-line px-4 py-3">
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-rose-ink transition hover:bg-rose-soft"
        >
          <Icon name="LogOut" className="h-[18px] w-[18px]" /> Sign out
        </button>
      </div>
    </div>
  );
}
