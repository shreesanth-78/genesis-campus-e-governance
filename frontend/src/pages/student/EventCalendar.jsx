import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, PageHeader } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { CATEGORY_STYLES } from '../../data/mockData';
import { useGov } from '../../context/GovContext';
import { cn, pad } from '../../utils/helpers';

const CATS = ['All', 'Workshop', 'Hackathon', 'Technical', 'Cultural', 'Sports', 'Social Impact'];
const WD = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export default function EventCalendar() {
  const navigate = useNavigate();
  const app = useApp();
  const { calendar: CAL, getEvent } = useGov();
  const [cat, setCat] = useState('All');
  const [view, setView] = useState('Month');
  const [selected, setSelected] = useState('innovation-sprint');
  const [weekStart, setWeekStart] = useState(12);
  const [monthOffset, setMonthOffset] = useState(0);

  // Only October 2026 has sample data; other months render empty grids.
  const monthDate = new Date(2026, 9 + monthOffset, 1);
  const monthLabel = monthDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const lead = (monthDate.getDay() + 6) % 7; // Monday-first offset
  const isOct = monthOffset === 0;
  const monthKey = `${monthDate.getFullYear()}-${pad(monthDate.getMonth() + 1)}`;
  const events = useMemo(
    () => CAL.filter((e) => e.date.startsWith(monthKey) && (cat === 'All' || e.category === cat)).map((e) => ({ ...e, day: Number(e.date.slice(8, 10)) })),
    [cat, monthKey, CAL]
  );

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const selectedCal = CAL.map((e) => ({ ...e, day: Number(e.date.slice(8, 10)) })).find((e) => e.id === selected);
  const full = selectedCal?.eventId ? getEvent(selectedCal.eventId) : null;
  const registered = full && app.isRegistered(full.id);

  const goToday = () => { setMonthOffset(0); setWeekStart(5 + 5); setSelected('innovation-sprint'); };

  const pill = (e, i) => (
    <button
      key={e.id + i}
      onClick={(ev) => { ev.stopPropagation(); setSelected(e.id); }}
      className={cn(
        'mt-1 block w-full truncate rounded border-l-2 px-1.5 py-1 text-left text-[8px] font-semibold max-sm:h-1.5 max-sm:border-l-0 max-sm:p-0 max-sm:text-[0px]', // on phones an event is a small colour bar; tap the day to open it
        CATEGORY_STYLES[e.category].event,
        selected === e.id && 'ring-1 ring-[#e0a02f]'
      )}
    >
      {e.title}
    </button>
  );

  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i).filter((d) => d >= 1 && d <= 31);

  return (
    <div>
      <PageHeader
        eyebrow="Plan your month"
        title="Event Calendar"
        subtitle="Approved campus events, all in one place."
        action={
          <button onClick={() => app.notify('Calendar subscription is not enabled in this demo.', 'info')} className="btn-ghost"><Icon name="Plus" className="h-4 w-4" /> Subscribe</button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setMonthOffset((m) => m - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white hover:bg-brand-50" aria-label="Previous month"><Icon name="ChevronLeft" /></button>
          <button onClick={() => setMonthOffset((m) => m + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white hover:bg-brand-50" aria-label="Next month"><Icon name="ChevronRight" /></button>
          <h2 className="text-xl font-extrabold text-brand-900">{monthLabel}</h2>
          <button onClick={goToday} className="btn-ghost py-2">Today</button>
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1 text-[10px] font-bold">
          {['Month', 'Week', 'Agenda'].map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn('rounded-lg px-4 py-1.5', view === v ? 'bg-brand-50 text-brand-800' : 'text-ink-mute hover:text-brand-800')}>{v}</button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition', cat === c ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink-soft hover:bg-brand-50/50')}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', c === 'All' ? 'bg-brand-400' : CATEGORY_STYLES[c].chip)} /> {c}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-ink-mute"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Approved events only</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_466px]">
        <div className="card overflow-hidden">
          {view === 'Month' && (
            <div className="overflow-x-auto scroll-thin">
              <div className="sm:min-w-[640px]">
                <div className="grid grid-cols-7 border-b border-line bg-canvas/60">
                  {WD.map((d) => <div key={d} className="px-3 py-3 text-[8px] font-bold tracking-[0.14em] text-ink-mute max-sm:px-0 max-sm:text-center max-sm:tracking-normal">{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((d, i) => {
                    const dayEvents = d ? events.filter((e) => e.day === d) : [];
                    const isToday = isOct && d === 12; // mockup highlights the featured day
                    return (
                      <div
                        key={i}
                        onClick={() => d && dayEvents[0] && setSelected(dayEvents[0].id)}
                        className={cn('min-h-[90px] border-b border-r border-line p-2 text-[9px] text-ink-soft max-sm:min-h-[56px] max-sm:p-1', !d && 'bg-canvas/50', isToday && 'bg-brand-50/60', d && dayEvents[0] && 'cursor-pointer hover:bg-brand-50/40')}
                      >
                        {d && (isToday ? <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">{d}</span> : <span>{d}</span>)}
                        {dayEvents.map(pill)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {view === 'Week' && (
            <div>
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <button onClick={() => setWeekStart((w) => Math.max(-5, w - 7))} className="btn-ghost py-1.5"><Icon name="ChevronLeft" className="h-3.5 w-3.5" /> Prev</button>
                <div className="text-xs font-bold text-brand-900">Week of {weekStart} October</div>
                <button onClick={() => setWeekStart((w) => Math.min(31, w + 7))} className="btn-ghost py-1.5">Next <Icon name="ChevronRight" className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
                {Array.from({ length: 7 }, (_, i) => weekStart + i).map((d, i) => (
                  <div key={d} className="min-h-[220px] border-b border-r border-line p-3">
                    <div className="text-[8px] font-bold tracking-[0.14em] text-ink-mute">{WD[i]}</div>
                    <div className="text-lg font-extrabold text-brand-900">{d >= 1 && d <= 31 ? d : '—'}</div>
                    {events.filter((e) => e.day === d).map(pill)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'Agenda' && (
            <ul className="divide-y divide-line">
              {events.length === 0 && <li className="p-10 text-center text-xs text-ink-soft">No events for this selection.</li>}
              {[...events].sort((a, b) => a.day - b.day).map((e) => (
                <li key={e.id}>
                  <button onClick={() => setSelected(e.id)} className={cn('flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-brand-50/40', selected === e.id && 'bg-brand-50/60')}>
                    <span className="grid h-11 w-11 place-content-center rounded-xl bg-canvas text-center leading-none">
                      <span className="text-base font-extrabold text-brand-900">{e.day}</span>
                      <span className="text-[8px] font-bold text-ink-mute">OCT</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-brand-900">{e.title}</span>
                      <span className="mt-0.5 inline-flex items-center gap-1.5 text-[10px] text-ink-mute"><span className={cn('h-1.5 w-1.5 rounded-full', CATEGORY_STYLES[e.category].chip)} /> {e.category}</span>
                    </span>
                    <Icon name="ChevronRight" className="h-4 w-4 text-ink-mute" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail panel */}
        <aside className="card self-start overflow-hidden">
          {selectedCal ? (
            <>
              <div className="relative bg-[#8b5f26] p-5 text-white">
                <div className="absolute right-6 top-5 h-20 w-20 rounded-full border border-white/25" />
                <div className="absolute right-12 top-10 h-16 w-16 rotate-12 rounded-lg border border-white/25" />
                <div className="relative flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em]">
                  <span className="grid h-6 w-6 place-items-center rounded-md border border-white/50 text-[10px]">G</span> Genesis Campus
                </div>
                <div className="relative mt-12 flex items-end justify-between">
                  <div>
                    <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/80">{selectedCal.category} · {new Date(selectedCal.date + 'T00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
                    <div className="mt-1 max-w-[260px] text-xl font-extrabold leading-tight">{selectedCal.title}</div>
                  </div>
                  <div className="text-right"><div className="text-3xl font-extrabold leading-none">{selectedCal.day}</div><div className="text-[9px] font-bold">{new Date(selectedCal.date + 'T00:00').toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</div></div>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <span className="pill bg-brand-50 text-brand-700"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Approved</span>
                  <button onClick={() => setSelected(null)} className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:bg-brand-50" aria-label="Close details"><Icon name="X" className="h-4 w-4" /></button>
                </div>
                <h3 className="mt-3 text-lg font-extrabold text-brand-900">{selectedCal.title}</h3>
                <div className="text-[10px] text-ink-mute">{full ? full.organizer : 'Campus organiser'}</div>
                <p className="mt-3 border-b border-line pb-4 text-[10px] leading-relaxed text-ink-soft">{full ? full.summary : 'An approved campus event. Full details will be published by the organiser.'}</p>
                <ul className="mt-4 space-y-3">
                  <Row icon="CalendarDays" title={`${new Date(selectedCal.date + 'T00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`} sub="Autumn semester" />
                  <Row icon="Clock3" title={full ? `${full.time} – ${full.endTime}` : 'Time to be confirmed'} sub="Local campus time" />
                  <Row icon="MapPin" title={full ? full.venue : 'Venue to be confirmed'} sub="GENESIS University campus" />
                </ul>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => (full ? navigate(`/student/events/${full.id}`) : app.notify('This event has no public registration page in the demo.', 'info'))}
                    className="btn-primary flex-1 py-3"
                  >
                    <Icon name="Sparkles" className="h-3.5 w-3.5" /> Event details
                  </button>
                  {full && (
                    <button
                      onClick={() => (registered ? app.notify("You're already registered.", 'info') : app.register(full.id))}
                      className="btn-ghost h-[42px] w-[42px] px-0"
                      aria-label="Register"
                      title={registered ? 'Registered' : 'Register'}
                    >
                      <Icon name={registered ? 'Check' : 'Plus'} className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button onClick={() => app.notify('Added to your calendar (demo).')} className="mt-3 inline-flex items-center gap-2 text-[10px] text-ink-soft hover:text-brand-800">
                  <Icon name="CalendarPlus" className="h-3.5 w-3.5" /> Add to my calendar
                </button>
              </div>
            </>
          ) : (
            <div className="grid place-items-center p-10 text-center text-xs text-ink-soft">
              <Icon name="CalendarSearch" className="mb-2 h-7 w-7 text-brand-400" /> Select an event to see its details.
            </div>
          )}
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-mute">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> All events shown have been approved by university authorities.</span>
        <button onClick={() => navigate('/student/events')} className="link-arrow">Explore all events <Icon name="ArrowRight" className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function Row({ icon, title, sub }) {
  return (
    <li className="flex items-start gap-3">
      <Icon name={icon} className="mt-0.5 h-4 w-4 text-brand-600" />
      <div><div className="text-[11px] font-bold text-brand-900">{title}</div><div className="text-[9px] text-ink-mute">{sub}</div></div>
    </li>
  );
}
