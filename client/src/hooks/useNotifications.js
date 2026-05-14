import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../utils/api';

export function useNotifications(user) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  // Per-mount socket ref so two layouts can't fight over a shared singleton.
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('hmc_token');
    if (!token) return;

    const socket = io('/', { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('new_notification', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(prev => prev + 1);
      toast(notif.title, {
        icon: '🔔',
        style: { fontFamily: 'DM Sans, sans-serif', fontSize: '13px' },
      });
    });

    socket.on('grade_released', ({ subjectName }) => {
      toast.success(`Grades released for ${subjectName}`);
    });

    socket.on('payment_confirmed', ({ receiptNo }) => {
      toast.success(`Payment confirmed! Receipt: ${receiptNo}`);
    });

    api.get('/notifications/unread-count')
      .then(res => setUnreadCount(res.data.count || 0))
      .catch(() => {});

    // Seed the notifications list from the server so pre-existing unread items
    // appear on mount; previously the list only filled from new socket events.
    api.get('/notifications')
      .then(res => {
        const list = res.data?.notifications || res.data || [];
        if (Array.isArray(list)) setNotifications(list);
      })
      .catch(() => {});

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id]);

  // Schema field is `isRead` (camelCase). Pre-fix used `is_read`, so the
  // optimistic update never matched the read-flag checks elsewhere in the UI.
  const markRead = useCallback(async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.put('/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, connected, markRead, markAllRead };
}
