import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TopBar } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', path: '/student' },
  { id: 'subjects', label: 'My Subjects', icon: '📚', path: '/student/subjects' },
  { id: 'content', label: 'Course Content', icon: '📄', path: '/student/content' },
  { id: 'exams', label: 'Exams', icon: '✏️', path: '/student/exams' },
  { id: 'marksheet', label: 'Marksheet', icon: '🏆', path: '/student/marksheet' },
  { id: 'timetable', label: 'Timetable', icon: '🗓️', path: '/student/timetable' },
  { id: 'fees', label: 'Fees', icon: '💰', path: '/student/fees' },
  { id: 'referrals', label: 'Referrals', icon: '🔗', path: '/student/referrals' },
  { id: 'notifications', label: 'Notifications', icon: '🔔', path: '/student/notifications' },
  { id: 'help', label: 'Help & Queries', icon: '❓', path: '/student/help' },
  { id: 'profile', label: 'My Profile', icon: '👤', path: '/student/profile' },
];

export default function StudentLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const active = NAV.find(n => n.path === location.pathname || (n.path !== '/student' && location.pathname.startsWith(n.path)))?.id || 'dashboard';
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Student';

  if (location.pathname.startsWith('/student/exams/') && location.pathname.endsWith('/take')) {
    return <Outlet />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar items={NAV} active={active} onSelect={id => navigate(NAV.find(n => n.id === id).path)}
        user={{ name: displayName, role: 'Student', id: user?.userIdDisplay }}
        onLogout={logout} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar title={NAV.find(n => n.id === active)?.label || 'Portal'} notifCount={unreadCount} />
        <div style={{ flex: 1, overflow: 'auto', background: '#F8F9FA' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
