// AdmissionsLayout.jsx
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TopBar } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', path: '/admissions' },
  { id: 'pipeline', label: 'Pipeline', icon: '📊', path: '/admissions/pipeline' },
  { id: 'new', label: 'New Applicant', icon: '➕', path: '/admissions/new' },
  { id: 'interviews', label: 'Interviews', icon: '🗓️', path: '/admissions/interviews' },
  { id: 'references', label: 'References', icon: '📝', path: '/admissions/references' },
  { id: 'fees', label: 'Record Fees', icon: '💰', path: '/admissions/fees' },
];

export default function AdmissionsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const active = NAV.find(n => n.path === location.pathname)?.id || 'dashboard';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar items={NAV} active={active} onSelect={id => navigate(NAV.find(n => n.id === id).path)}
        user={{ name: `${user?.firstName} ${user?.lastName}`, role: 'Admissions Officer', id: user?.userIdDisplay }}
        onLogout={logout} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar title={NAV.find(n => n.id === active)?.label || 'Admissions'} notifCount={unreadCount} />
        <div style={{ flex: 1, overflow: 'auto', background: '#F8F9FA' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
