import ClubSpace from '../../components/ClubSpace';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useGov } from '../../context/GovContext';
import { getClubFrom } from '../../store/selectors';

/** The club authority's side of the Club Space: post announcements, join the discussion, manage the members. */
export default function ClubSpaceAuthority() {
  const { user } = useAuth();
  const { state } = useGov();
  const club = getClubFrom(state, user.clubId);
  return (
    <div>
      <PageHeader
        eyebrow={club?.name}
        title="Club Space"
        subtitle="Post announcements to your members and talk with them about your events, in one place instead of WhatsApp."
      />
      <ClubSpace clubId={user.clubId} authority />
    </div>
  );
}
