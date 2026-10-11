import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Avatar } from './ui';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useGov } from '../context/GovContext';

export default function Topbar({ onMenu, student = true }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useApp();
  const { events: EVENTS, clubs: CLUBS } = useGov();
  const [q, setQ] = useState('');
  const [openSearch, setOpenSearch] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
  const [openHelp, setOpenHelp] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const helpRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpenSearch(false);
        setOpenMenu(false);
        setOpenHelp(false);
      }
    };
    const onClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setOpenSearch(false);
      // Each popover closes only when the press is outside its own wrapper (the user menu used to be treated as
      // 'outside' the help wrapper and closed on mouse-down, before its Sign out button could be clicked).
      if (helpRef.current && !helpRef.current.contains(e.target)) setOpenHelp(false);
      if (userRef.current && !userRef.current.contains(e.target)) setOpenMenu(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const ev = EVENTS.filter((e) => `${e.title} ${e.organizer} ${e.venue} ${e.category}`.toLowerCase().includes(term)).map((e) => ({
      key: `e-${e.id}`, type: 'Event', title: e.title, sub: `${e.dateLabel} · ${e.venue}`, to: `/student/events/${e.id}`,
    }));
    const cl = CLUBS.filter((c) => `${c.name} ${c.category} ${c.blurb}`.toLowerCase().includes(term)).map((c) => ({
      key: `c-${c.id}`, type: 'Club', title: c.name, sub: `${c.members} members · ${c.category}`, to: '/student/clubs',
    }));
    return [...ev, ...cl].slice(0, 6);
  }, [q, EVENTS, CLUBS]);

  const go = (to) => {
    setOpenSearch(false);
    setQ('');
    navigate(to);
  };

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button onClick={onMenu} className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-soft hover:bg-brand-50 lg:hidden" aria-label="Open menu">
        <Icon name="Menu" className="h-5 w-5" />
      </button>

      {student ? (
        <div ref={searchRef} className="relative min-w-0 max-w-[440px] flex-1">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
            <Icon name="Search" className="h-4 w-4 text-ink-mute" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpenSearch(true); }}
              onFocus={() => setOpenSearch(true)}
              placeholder="Search events, clubs, and activities…"
              className="min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-ink-mute"
              aria-label="Search"
            />
            <kbd className="hidden rounded-md border border-line bg-white px-1.5 py-0.5 text-[9px] font-semibold text-ink-mute sm:block">⌘ K</kbd>
          </div>
          {openSearch && q.trim() && (
            <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-line bg-white shadow-pop animate-pop">
              {results.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-ink-soft">No matches for “{q}”.</div>
              ) : (
                results.map((r) => (
                  <button key={r.key} onClick={() => go(r.to)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon name={r.type === 'Event' ? 'CalendarDays' : 'Users'} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-brand-900">{r.title}</span>
                      <span className="block truncate text-[11px] text-ink-soft">{r.sub}</span>
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-ink-mute">{r.type}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        {student && (
          <button onClick={() => navigate('/student/notifications')} className="relative grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-brand-50" aria-label="Notifications">
            <Icon name="Bell" className="h-[18px] w-[18px]" />
            {unreadCount > 0 && <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#e5533d]" />}
          </button>
        )}
        <div ref={helpRef} className="relative">
          <button onClick={() => setOpenHelp((v) => !v)} className="grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-brand-50" aria-label="Help">
            <Icon name="CircleHelp" className="h-[18px] w-[18px]" />
          </button>
          {openHelp && (
            <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-line bg-white p-4 shadow-pop animate-pop">
              <div className="text-xs font-bold text-brand-900">Prototype help</div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                This is a demo built for the GENESIS Hackathon. Data is sample data; sign-in and permissions are checked by the server.
              </p>
            </div>
          )}
        </div>
        <div ref={userRef} className="relative">
          <button onClick={() => setOpenMenu((v) => !v)} className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-brand-50" aria-haspopup="menu" aria-expanded={openMenu}>
            <Avatar initials={user?.initials} />
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-xs font-bold text-brand-900">{user?.name}</span>
              <span className="block text-[10px] capitalize text-ink-mute">{user?.role === 'admin' ? 'Administrator' : user?.role === 'club' ? 'Club Authority' : 'Student'}</span>
            </span>
            <Icon name="ChevronDown" className="hidden h-4 w-4 text-ink-mute sm:block" />
          </button>
          {openMenu && (
            <div role="menu" className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-line bg-white shadow-pop animate-pop">
              <div className="border-b border-line px-4 py-3">
                <div className="text-xs font-bold text-brand-900">{user?.name}</div>
                <div className="truncate text-[11px] text-ink-soft">{user?.email}</div>
              </div>
              {student && (
                <button role="menuitem" onClick={() => { setOpenMenu(false); navigate('/student/profile'); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-ink hover:bg-brand-50">
                  <Icon name="User" /> My profile
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => { logout(); navigate('/'); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-rose-ink hover:bg-rose-soft"
              >
                <Icon name="LogOut" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
