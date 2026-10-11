import { useMemo, useState } from 'react';
import { VENUES } from '../../data/govData';
import { rankHalls } from '@gcc/shared/gov/halls';
import { recommendHalls } from '../../services/ai';
import { Icon } from '../ui';
import { cn } from '../../utils/helpers';

export const FIT = {
  good: { label: 'Good fit', cls: 'bg-ok-50 text-ok-700', bar: 'bg-ok-500' },
  comfortable: { label: 'Comfortable', cls: 'bg-ok-50 text-ok-700', bar: 'bg-ok-500' },
  tight: { label: 'Almost full', cls: 'bg-amber-soft text-amber-ink', bar: 'bg-[#e3a02c]' },
  oversized: { label: 'Much larger than needed', cls: 'bg-amber-soft text-amber-ink', bar: 'bg-[#e3a02c]' },
  too_small: { label: 'Too small', cls: 'bg-rose-soft text-rose-ink', bar: 'bg-[#e06052]' },
  booked: { label: 'Already booked', cls: 'bg-rose-soft text-rose-ink', bar: 'bg-[#e06052]' },
  unknown: { label: '', cls: '', bar: 'bg-brand-200' },
};

/**
 * Choose the hall for an event. Every hall shows how well it fits the number of people the club expects, whether it is
 * already requested at that time, and its facilities. "Recommend a hall" asks the AI (or the built-in rules) for the
 * best choice and explains why.
 */
export default function HallPicker({ value, onChange, attendance, date, startTime, endTime, category, requests, ignoreId, error }) {
  const [advice, setAdvice] = useState(null);
  const [busy, setBusy] = useState(false);
  const n = Number(attendance) || 0;

  const ranked = useMemo(
    () => rankHalls({ attendance: n, date, startTime, endTime, category, requests, ignoreId }),
    [n, date, startTime, endTime, category, requests, ignoreId],
  );
  // Without a number of people the halls keep their usual order; with one the best fit comes first.
  const list = n > 0 ? ranked : VENUES.map((v) => ranked.find((h) => h.name === v.name));

  const ask = async () => {
    setBusy(true);
    try {
      setAdvice(await recommendHalls({ attendance: n, date, startTime, endTime, category, requestId: ignoreId }, { requests }));
    } finally {
      setBusy(false);
    }
  };
  const best = advice?.rankings?.find((h) => h.recommended);

  return (
    <div id="rf-venue" role="radiogroup" aria-label="Hall" aria-invalid={error ? 'true' : undefined} tabIndex={-1} className="outline-none">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3.5 py-3">
        <Icon name="Sparkles" className="h-4 w-4 text-brand-600" />
        <p className="min-w-0 flex-1 text-[11px] text-brand-900">
          {n > 0 ? (
            <>
              Halls are sorted for <b>{n} people</b>. Pick one, or let the AI recommend.
            </>
          ) : (
            'Enter your expected attendance and the halls will be sorted by how well they fit.'
          )}
        </p>
        <button type="button" onClick={ask} disabled={n <= 0 || busy} className="btn-ghost px-3 py-1.5 text-[11px] disabled:opacity-50">
          <Icon name={busy ? 'Loader2' : 'Sparkles'} className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Recommend a hall
        </button>
      </div>

      {advice && (
        <div role="status" className="mb-3 rounded-xl border border-brand-200 bg-white px-3.5 py-3 text-[11px] leading-relaxed text-ink-soft">
          <div className="flex items-start gap-2">
            <Icon name="Bot" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <p className="min-w-0 flex-1 text-ink">{advice.summary}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-ink-mute">
              {advice.source === 'ai-service' ? 'Written by the AI assistant' : 'Built-in recommendation'} · advisory: the Events Section gives the final permission
            </span>
            {best && value !== best.name && (
              <button type="button" onClick={() => onChange(best.name)} className="btn-primary px-3 py-1.5 text-[11px]">
                Use {best.name}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {list.map((h) => {
          const selected = value === h.name;
          const fit = FIT[h.status] ?? FIT.unknown;
          return (
            <button
              key={h.name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${h.name} (holds ${h.capacity})`}
              onClick={() => onChange(h.name)}
              className={cn(
                'rounded-2xl border bg-white p-3.5 text-left transition hover:border-brand-300 hover:shadow-card',
                selected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-line',
                (h.status === 'too_small' || h.status === 'booked') && !selected && 'opacity-80',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-brand-900">{h.name}</div>
                  <div className="text-[10px] text-ink-mute">
                    {h.location} · holds {h.capacity}
                  </div>
                </div>
                <span
                  className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-line')}
                  aria-hidden="true"
                >
                  {selected && <Icon name="Check" className="h-3 w-3" />}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {h.recommended && <span className="pill bg-brand-800 text-white">Recommended</span>}
                {fit.label && <span className={cn('pill', fit.cls)}>{fit.label}</span>}
              </div>
              {n > 0 && (
                <div className="mt-2.5" aria-hidden="true">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f1eeee]">
                    <div className={cn('h-full rounded-full', fit.bar)} style={{ width: `${Math.min(100, h.utilisation)}%` }} />
                  </div>
                  <div className="mt-1 text-[9px] text-ink-mute">{Math.min(h.utilisation, 999)}% full with {n} people</div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {h.facilities.map((f) => (
                  <span key={f} className="rounded-md bg-[#f1eeee] px-1.5 py-0.5 text-[9px] font-semibold text-ink-soft">
                    {f}
                  </span>
                ))}
              </div>
              {h.status === 'booked' && <p className="mt-2 text-[10px] text-rose-ink">{h.reasons.at(-1)}</p>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-ink-mute">The Events Section reviews the hall you choose and may approve it or assign another.</p>
    </div>
  );
}
