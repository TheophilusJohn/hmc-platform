import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TopBar } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', path: '/faculty' },
  { id: 'subjects', label: 'My Subjects', icon: '📚', path: '/faculty/subjects' },
  { id: 'content', label: 'Course Content', icon: '📄', path: '/faculty/content' },
  { id: 'exams', label: 'Exams & Grading', icon: '📝', path: '/faculty/exams' },
  { id: 'qbank', label: 'Question Bank', icon: '❓', path: '/faculty/question-bank' },
  { id: 'gradebook', label: 'Gradebook', icon: '🏆', path: '/faculty/gradebook' },
  { id: 'attendance', label: 'Attendance', icon: '📅', path: '/faculty/attendance' },
  { id: 'students', label: 'Students', icon: '👥', path: '/faculty/students' },
  { id: 'timetable', label: 'Timetable', icon: '🗓️', path: '/faculty/timetable' },
  { id: 'messages', label: 'Messages', icon: '💬', path: '/faculty/messages' },
];

export default function FacultyLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const active = NAV.find(n => location.pathname === n.path || (n.path !== '/faculty' && location.pathname.startsWith(n.path)))?.id || 'dashboard';
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Faculty Member';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar items={NAV} active={active} onSelect={id => navigate(NAV.find(n => n.id === id).path)}
        user={{ name: displayName, role: 'Faculty', id: user?.userIdDisplay }}
        onLogout={logout} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar title={NAV.find(n => n.id === active)?.label || 'Faculty'} notifCount={unreadCount} />
        <div style={{ flex: 1, overflow: 'auto', background: '#F8F9FA' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
