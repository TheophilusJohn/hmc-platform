import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, TopBar, PageWrapper } from '../../components/common/index';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';

const NAV = [
  { id: '', label: 'Dashboard', icon: '🏠' },
  { divider: true },
  { id: 'users', label: 'User Management', icon: '👥' },
  { id: 'programmes', label: 'Programmes', icon: '🎓' },
  { id: 'semesters', label: 'Semesters', icon: '📅' },
  { id: 'subjects', label: 'Subjects', icon: '📚' },
  { divider: true },
  { id: 'admissions', label: 'Admissions', icon: '📋' },
  { id: 'finance', label: 'Finance', icon: '₹' },
  { id: 'fee-settings', label: 'Fee Settings', icon: '⚙' },
  { divider: true },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'messages', label: 'Messages', icon: '✉' },
  { divider: true },
  { id: 'settings', label: 'System Settings', icon: '🔧' },
];

const titles = { '': 'Dashboard', users: 'User Management', programmes: 'Programmes', semesters: 'Semesters', subjects: 'Subjects', admissions: 'Admissions', finance: 'Finance', 'fee-settings': 'Fee Settings', reports: 'Reports', messages: 'Messages', settings: 'System Settings' };

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications(user);
  const segment = location.pathname.split('/admin/')[1] || '';
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <PageWrapper
      sidebar={
        <Sidebar
          items={NAV}
          active={segment}
          onSelect={id => navigate(`/admin${id ? '/' + id : ''}`)}
          user={{ name: user?.name || 'Admin', display_id: user?.userIdDisplay }}
          onLogout={logout}
        />
      }
      topbar={<TopBar title={titles[segment] || 'Admin'} notifCount={unreadCount} onMenuClick={() => setMobileOpen(v => !v)} />}
    >
      <Outlet />
    </PageWrapper>
  );
}
