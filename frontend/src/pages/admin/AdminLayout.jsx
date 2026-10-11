import { useMemo } from 'react';
import PortalShell from '../../components/gov/PortalShell';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { adminStats } from '../../store/selectors';

export const adminBase = (user) => `/admin/${user?.adminType === 'events' ? 'events' : 'osa'}`;
export const useAdminBase = () => adminBase(useAuth().user);

export default function AdminLayout() {
  const { user } = useAuth();
  const { state } = useGov();
  const stats = useMemo(() => adminStats(state), [state]);
  const base = adminBase(user);
  const isOsa = user?.adminType === 'osa';
  // OSA reviews event requests, gives permission and decides new clubs; the Events Section only allocates halls.
  const nav = isOsa
    ? [
        { to: `${base}/dashboard`, label: 'Overview', icon: 'LayoutGrid' },
        { to: `${base}/requests`, label: 'Event Requests', icon: 'ClipboardList', count: stats.pendingOnline + stats.readyForApproval },
        { to: `${base}/physical`, label: 'Hard-copy Checks', icon: 'FileCheck2', count: stats.awaitingPhysical },
        { to: `${base}/promotions`, label: 'Promotion Requests', icon: 'Megaphone', count: stats.pendingPromotions },
        { to: `${base}/club-applications`, label: 'Club Applications', icon: 'UserPlus', count: stats.clubApps },
        { to: `${base}/clubs`, label: 'Club Directory', icon: 'Users' },
        { to: `${base}/reports`, label: 'Reports', icon: 'BarChart3' },
        { to: `${base}/settings`, label: 'Settings', icon: 'Settings' },
      ]
    : [
        { to: `${base}/dashboard`, label: 'Overview', icon: 'LayoutGrid' },
        { to: `${base}/halls`, label: 'Hall Requests', icon: 'Building2', count: stats.hallRequests },
        { to: `${base}/clubs`, label: 'Club Directory', icon: 'Users' },
        { to: `${base}/reports`, label: 'Reports', icon: 'BarChart3' },
        { to: `${base}/settings`, label: 'Settings', icon: 'Settings' },
      ];
  return (
    <PortalShell
      nav={nav}
      sectionLabel={isOsa ? 'OSA Console' : 'Events Section'}
      footerNote={isOsa ? 'You review event requests, give permission to circulate them and decide new-club applications.' : 'You allocate halls to events once clubs have registrations. Reviews and approvals stay with OSA.'}
    />
  );
}
