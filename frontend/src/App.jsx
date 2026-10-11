import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, homeFor } from './context/AuthContext';

import RoleSelect from './pages/RoleSelect';
import AdminTypeSelect from './pages/AdminTypeSelect';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import ChatWidget from './components/ChatWidget';

import StudentLayout from './components/StudentLayout';
import Dashboard from './pages/student/Dashboard';
import ExploreEvents from './pages/student/ExploreEvents';
import EventDetails from './pages/student/EventDetails';
import EventCalendar from './pages/student/EventCalendar';
import MyRegistrations from './pages/student/MyRegistrations';
import ClubsDirectory from './pages/student/ClubsDirectory';
import FavoriteClubs from './pages/student/FavoriteClubs';
import Notifications from './pages/student/Notifications';
import CampusAssistant from './pages/student/CampusAssistant';
import StartClub from './pages/student/StartClub';
import StudentClubSpace from './pages/student/ClubSpacePage';
import Profile from './pages/student/Profile';
import Settings from './pages/student/Settings';

import AdminLayout from './pages/admin/AdminLayout';
import Overview from './pages/admin/Overview';
import { EventsOverview, HallRequestsList, HallRequestDetail } from './pages/admin/HallRequests';
import EventRequests from './pages/admin/EventRequests';
import AdminRequestDetail from './pages/admin/RequestDetail';
import PhysicalQueue from './pages/admin/PhysicalQueue';
import Promotions from './pages/admin/Promotions';
import { ClubApplicationsList, ClubApplicationDetail } from './pages/admin/ClubApplications';
import { ClubDirectory, ClubDetail } from './pages/admin/ClubDirectory';
import Reports from './pages/admin/Reports';
import PortalSettings from './pages/admin/PortalSettings';

import ClubLayout from './pages/club/ClubLayout';
import ClubOverview from './pages/club/ClubOverview';
import ClubProfile from './pages/club/ClubProfile';
import ClubMembers from './pages/club/ClubMembers';
import ClubSpaceAuthority from './pages/club/ClubSpaceAuthority';
import ClubRequests from './pages/club/ClubRequests';
import RequestForm from './pages/club/RequestForm';
import ClubRequestDetail from './pages/club/ClubRequestDetail';
import ClubPromotions from './pages/club/ClubPromotions';
import ClubEvents from './pages/club/ClubEvents';

/** Route guard: hides screens the role cannot use. The server enforces every rule again on each call. */
function Protected({ allow, adminType, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  const roleOk = user.role === allow && (allow !== 'admin' || user.adminType === adminType);
  if (!roleOk) return <Navigate to={homeFor(user)} replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <>
    <Routes>
      {/* Entry flow */}
      <Route path="/" element={<RoleSelect />} />
      <Route path="/admin-type" element={<AdminTypeSelect />} />
      <Route path="/login/:role" element={user ? <Navigate to={homeFor(user)} replace /> : <Login />} />
      <Route
        path="/login/:role/:adminType"
        element={user ? <Navigate to={homeFor(user)} replace /> : <Login />}
      />

      {/* Student portal */}
      <Route
        path="/student"
        element={
          <Protected allow="student">
            <StudentLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="events" element={<ExploreEvents />} />
        <Route path="events/:eventId" element={<EventDetails />} />
        <Route path="calendar" element={<EventCalendar />} />
        <Route path="registrations" element={<MyRegistrations />} />
        <Route path="clubs" element={<ClubsDirectory />} />
        <Route path="favorites" element={<FavoriteClubs />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="assistant" element={<CampusAssistant />} />
        <Route path="club-space" element={<StudentClubSpace />} />
        <Route path="start-club" element={<StartClub />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Administrator portals: separate OSA and Events Section access */}
      {['osa', 'events'].map((type) => (
        <Route
          key={type}
          path={`/admin/${type}`}
          element={
            <Protected allow="admin" adminType={type}>
              <AdminLayout />
            </Protected>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          {type === 'osa' ? (
            <>
              <Route path="dashboard" element={<Overview />} />
              <Route path="requests" element={<EventRequests />} />
              <Route path="requests/:id" element={<AdminRequestDetail />} />
              <Route path="physical" element={<PhysicalQueue />} />
              <Route path="promotions" element={<Promotions />} />
              <Route path="club-applications" element={<ClubApplicationsList />} />
              <Route path="club-applications/:id" element={<ClubApplicationDetail />} />
            </>
          ) : (
            <>
              <Route path="dashboard" element={<EventsOverview />} />
              <Route path="halls" element={<HallRequestsList />} />
              <Route path="halls/:id" element={<HallRequestDetail />} />
            </>
          )}
          <Route path="clubs" element={<ClubDirectory />} />
          <Route path="clubs/:id" element={<ClubDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<PortalSettings />} />
          <Route path="*" element={<Navigate to={`/admin/${type}/dashboard`} replace />} />
        </Route>
      ))}

      {/* Club Authority portal */}
      <Route
        path="/club"
        element={
          <Protected allow="club">
            <ClubLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ClubOverview />} />
        <Route path="profile" element={<ClubProfile />} />
        <Route path="members" element={<ClubMembers />} />
        <Route path="space" element={<ClubSpaceAuthority />} />
        <Route path="requests" element={<ClubRequests />} />
        <Route path="requests/new" element={<RequestForm />} />
        <Route path="requests/:id" element={<ClubRequestDetail />} />
        <Route path="requests/:id/edit" element={<RequestForm />} />
        <Route path="promotions" element={<ClubPromotions />} />
        <Route path="events" element={<ClubEvents />} />
        <Route path="settings" element={<PortalSettings />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
      <Route path="/admin/:other/*" element={<Navigate to="/admin-type" replace />} />
      <Route path="/admin" element={<Navigate to="/admin-type" replace />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    {user && <ChatWidget />}
    </>
  );
}
