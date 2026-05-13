import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, TopBar, PageWrapper } from '../../components/common/index';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';

const NAV = [
  { key: '', label: 'Dashboard', icon: '🏠' },
  { divider: true },
  { key: 'users', label: 'User Management', icon: '👥' },
  { key: 'programmes', label: 'Programmes', icon: '🎓' },
  { key: 'semesters', label: 'Semesters', icon: '📅' },
  { key: 'subjects', label: 'Subjects', icon: '📚' },
  { divider: true },
  { key: 'admissions', label: 'Admissions', icon: '📋' },
  { key: 'finance', label: 'Finance', icon: '₹' },
  { key: 'fee-settings', label: 'Fee Settings', icon: '⚙' },
  { divider: true },
  { key: 'reports', label: 'Reports', icon: '📊' },
  { key: 'messages', label: 'Messages', icon: '✉' },
  { divider: true },
  { key: 'settings', label: 'System Settings', icon: '🔧' },
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
          onSelect={key => navigate(`/admin${key ? '/' + key : ''}`)}
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
