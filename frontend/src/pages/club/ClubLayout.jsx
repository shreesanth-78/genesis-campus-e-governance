import { useMemo } from 'react';
import PortalShell from '../../components/gov/PortalShell';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { requestsForClub } from '../../store/selectors';

export const useClubId = () => useAuth().user?.clubId;

export default function ClubLayout() {
  const { user } = useAuth();
  const { state } = useGov();
  const mine = useMemo(() => requestsForClub(state, user.clubId), [state, user.clubId]);
  const action = mine.filter((r) => r.status === 'correction_requested' || r.status === 'draft').length
    + state.promotions.filter((p) => p.clubId === user.clubId && p.status === 'changes').length;
  const nav = [
    { to: '/club/dashboard', label: 'Overview', icon: 'LayoutGrid' },
    { to: '/club/profile', label: 'Club Profile', icon: 'Landmark' },
    { to: '/club/members', label: 'Members', icon: 'Users' },
    { to: '/club/space', label: 'Club Space', icon: 'MessageCircle' },
    { to: '/club/requests', label: 'Event Requests', icon: 'ClipboardList', count: action },
    { to: '/club/promotions', label: 'Promotions', icon: 'Megaphone' },
    { to: '/club/events', label: 'Our Events', icon: 'CalendarDays' },
    { to: '/club/settings', label: 'Settings', icon: 'Settings' },
  ];
  return <PortalShell nav={nav} sectionLabel="Club Authority" footerNote="You can manage only your own club: its profile, event requests and promotions." />;
}
