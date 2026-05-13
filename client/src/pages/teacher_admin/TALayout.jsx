import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TopBar } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';

const ADMIN_NAV = [
  { id: 'admin-dashboard', label: 'Admin Dashboard', icon: '🏠', path: '/ta' },
  { id: 'course-assignment', label: 'Course Assignment', icon: '📚', path: '/ta/courses' },
  { id: 'batch-progression', label: 'Batch Progression', icon: '🎓', path: '/ta/progression' },
  { id: 'exceptions', label: 'Exceptions', icon: '⚠️', path: '/ta/exceptions' },
  { id: 'all-grades', label: 'All Grades', icon: '🏆', path: '/ta/grades' },
  { id: 'record-fees', label: 'Record Fees', icon: '💰', path: '/ta/fees' },
];

const TEACHER_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', path: '/faculty' },
  { id: 'subjects', label: 'My Subjects', icon: '📚', path: '/faculty/subjects' },
  { id: 'content', label: 'Course Content', icon: '📄', path: '/faculty/content' },
  { id: 'exams', label: 'Exams & Grading', icon: '📝', path: '/faculty/exams' },
  { id: 'qbank', label: 'Question Bank', icon: '❓', path: '/faculty/question-bank' },
  { id: 'gradebook', label: 'Gradebook', icon: '🏆', path: '/faculty/gradebook' },
  { id: 'attendance', label: 'Attendance', icon: '📅', path: '/faculty/attendance' },
];

export default function TALayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [mode, setMode] = useState(location.pathname.startsWith('/faculty') ? 'teacher' : 'admin');
  const nav = mode === 'admin' ? ADMIN_NAV : TEACHER_NAV;
  const active = nav.find(n => n.path === location.pathname || (n.path !== '/' && location.pathname.startsWith(n.path)))?.id || nav[0].id;

  const toggleMode = () => {
    const next = mode === 'admin' ? 'teacher' : 'admin';
    setMode(next);
    navigate(next === 'admin' ? '/ta' : '/faculty');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar items={nav} active={active} onSelect={id => navigate(nav.find(n => n.id === id).path)}
        user={{ name: `${user?.firstName} ${user?.lastName}`, role: 'Teacher-Admin', id: user?.userIdDisplay }}
        onLogout={logout}
        headerExtra={
          <button onClick={toggleMode}
            style={{ width: '100%', margin: '0 0 8px', padding: '8px 12px', background: mode === 'admin' ? 'rgba(201,146,10,0.15)' : 'rgba(15,118,110,0.15)', border: 'none', borderRadius: 8, color: mode === 'admin' ? '#F5E6BE' : '#99F6E4', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            {mode === 'admin' ? '🔄 Switch to Teacher View' : '🔄 Switch to Admin View'}
          </button>
        }
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar title={nav.find(n => n.id === active)?.label || 'Teacher-Admin'} notifCount={unreadCount}
          badge={<span style={{ padding: '3px 8px', background: mode === 'admin' ? '#C9920A' : '#0F766E', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{mode === 'admin' ? 'Admin Mode' : 'Teacher Mode'}</span>} />
        <div style={{ flex: 1, overflow: 'auto', background: '#F8F9FA' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
