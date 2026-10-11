import { cn } from '../../utils/helpers';

const TONES = {
  green: 'bg-ok-50 text-ok-700',
  strong: 'bg-brand-800 text-white',
  amber: 'bg-amber-soft text-amber-ink',
  rose: 'bg-rose-soft text-rose-ink',
  sky: 'bg-sky-soft text-sky-ink',
  plum: 'bg-plum-soft text-plum-ink',
  gray: 'bg-[#f1eeee] text-ink-soft',
};
const DOTS = { green: 'bg-ok-500', strong: 'bg-brand-200', amber: 'bg-[#e3a02c]', rose: 'bg-[#e06052]', sky: 'bg-[#4a73c4]', plum: 'bg-[#8a5bb0]', gray: 'bg-ink-mute' };

export function Badge({ tone = 'gray', children, dot = true, className }) {
  return (
    <span className={cn('pill whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  );
}

export const REQUEST_STATUS = {
  draft: { label: 'Draft', tone: 'gray' },
  submitted: { label: 'Under review', tone: 'sky' },
  correction_requested: { label: 'Corrections requested', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'rose' },
  approved: { label: 'Permission given', tone: 'green' },
  published: { label: 'Circulated', tone: 'strong' },
  completed: { label: 'Completed', tone: 'gray' },
};
export const RequestStatus = ({ status }) => {
  const m = REQUEST_STATUS[status] || REQUEST_STATUS.draft;
  return <Badge tone={m.tone}>{m.label}</Badge>;
};

const ONLINE = { pending: ['Awaiting review', 'gray'], cleared: ['Cleared', 'green'], correction: ['Corrections', 'amber'], rejected: ['Rejected', 'rose'] };
const PHYSICAL = { pending: ['Awaiting letter', 'gray'], verified: ['Verified', 'green'], issue: ['Issue found', 'amber'] };
export const OnlineBadge = ({ status }) => <Badge tone={ONLINE[status][1]}>{ONLINE[status][0]}</Badge>;
export const PhysicalBadge = ({ status }) => <Badge tone={PHYSICAL[status][1]}>{PHYSICAL[status][0]}</Badge>;

const PROMO = { submitted: ['Under review', 'sky'], approved: ['Approved', 'green'], changes: ['Changes requested', 'amber'], rejected: ['Rejected', 'rose'] };
export const PromoStatus = ({ status }) => <Badge tone={PROMO[status][1]}>{PROMO[status][0]}</Badge>;

const CLUBAPP = { submitted: ['Awaiting decision', 'sky'], correction_requested: ['Corrections requested', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'rose'] };
export const ClubAppStatus = ({ status }) => <Badge tone={CLUBAPP[status][1]}>{CLUBAPP[status][0]}</Badge>;
