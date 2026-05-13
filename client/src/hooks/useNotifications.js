import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../utils/api';

let socket = null;

export function useNotifications(user) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('hmc_token');
    if (!token) return;

    // Connect socket
    socket = io('/', { auth: { token }, transports: ['websocket', 'polling'] });

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

    socket.on('payment_confirmed', ({ receiptNo, amount }) => {
      toast.success(`Payment confirmed! Receipt: ${receiptNo}`);
    });

    // Load initial unread count
    api.get('/notifications/unread-count')
      .then(res => setUnreadCount(res.data.count || 0))
      .catch(() => {});

    return () => {
      socket?.disconnect();
      socket = null;
      setConnected(false);
    };
  }, [user?.id]);

  const markRead = useCallback(async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.put('/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, connected, markRead, markAllRead };
}
