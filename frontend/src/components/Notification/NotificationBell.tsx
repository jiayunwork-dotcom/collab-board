import React, { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import { notificationApi } from '@/api/client';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '@/types';

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  return d.toLocaleDateString();
};

const Avatar: React.FC<{ color?: string; name?: string; size?: number }> = ({ color = '#4F46E5', name = '?', size = 32 }) => (
  <div
    className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
    style={{
      width: size,
      height: size,
      background: color,
      fontSize: size * 0.4,
    }}
  >
    {(name || '?').charAt(0).toUpperCase()}
  </div>
);

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    currentUser,
    notifications,
    setNotifications,
    unreadNotificationCount,
    setUnreadNotificationCount,
    addNotification,
    markNotificationRead,
    notificationsOpen,
    setNotificationsOpen,
  } = useCanvasStore();

  const loadNotifications = async () => {
    try {
      const data = await notificationApi.list();
      setNotifications(data);
      const unread = data.filter(n => !n.isRead).length;
      setUnreadNotificationCount(unread);
    } catch (e) {
      console.error('Failed to load notifications', e);
    }
  };

  const refreshUnread = async () => {
    try {
      const r = await notificationApi.unreadCount();
      setUnreadNotificationCount(r.count);
    } catch {}
  };

  useEffect(() => {
    if (currentUser) {
      loadNotifications();
      const interval = setInterval(refreshUnread, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen, setNotificationsOpen]);

  const handleNotificationClick = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await notificationApi.markRead(n.id);
        markNotificationRead(n.id);
      } catch {}
    }
    setNotificationsOpen(false);
    if (n.payload?.canvasId) {
      navigate(`/canvas/${n.payload.canvasId}`);
      if (n.payload?.anchorX !== undefined && n.payload?.anchorY !== undefined) {
        setTimeout(() => {
          const store = useCanvasStore.getState();
          if (store.currentCanvas?.canvas.id === n.payload.canvasId) {
            store.setViewport({
              x: (n.payload.anchorX || 0) - window.innerWidth / 2 / (store.viewport.zoom || 1),
              y: (n.payload.anchorY || 0) - window.innerHeight / 2 / (store.viewport.zoom || 1),
            });
          }
        }, 800);
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      const updated = notifications.map(n => ({ ...n, isRead: true }));
      setNotifications(updated);
      setUnreadNotificationCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleOpen = async () => {
    if (!notificationsOpen) {
      await loadNotifications();
    }
    setNotificationsOpen(!notificationsOpen);
  };

  if (!currentUser) return null;

  return (
    <div ref={panelRef} className="relative">
      <button
        className="btn btn-icon btn-sm relative"
        onClick={toggleOpen}
        title="通知"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadNotificationCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 animate-pulse">
            {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setNotificationsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-80 panel shadow-xl overflow-hidden z-40" style={{ maxHeight: '70vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800">通知</h3>
                {unreadNotificationCount > 0 && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                    {unreadNotificationCount} 条未读
                  </span>
                )}
              </div>
              {unreadNotificationCount > 0 && (
                <button
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  onClick={handleMarkAllRead}
                >
                  全部已读
                </button>
              )}
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 52px)' }}>
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <path d="M22 4L12 14.01l-3-3" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-400">暂无通知</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map(n => (
                    <button
                      key={n.id}
                      className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${!n.isRead ? 'bg-indigo-50/30' : ''}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex gap-3">
                        <div className="relative flex-shrink-0">
                          <Avatar
                            name={n.payload?.fromUserName || '?'}
                            color={n.payload?.fromUserName ? getColorForName(n.payload.fromUserName) : '#64748b'}
                            size={36}
                          />
                          {!n.isRead && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm leading-snug text-slate-700">
                              <span className="font-semibold text-slate-900">{n.payload?.fromUserName || '某人'}</span>
                              {' '}在评论中 @了您
                              {n.payload?.canvasTitle && (
                                <>
                                  {' '}<span className="text-slate-500">·</span>{' '}
                                  <span className="text-indigo-600 font-medium truncate">{n.payload.canvasTitle}</span>
                                </>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 flex-shrink-0">{formatTime(n.createdAt)}</span>
                          </div>
                          {n.payload?.content && (
                            <p className="mt-1 text-xs text-slate-500 line-clamp-2 bg-slate-100/50 rounded-md px-2 py-1.5">
                              {n.payload.content}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E'];

const getColorForName = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};

export default NotificationBell;
