import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import LoginPage from './components/Auth/LoginPage';
import DashboardPage from './components/Dashboard/DashboardPage';
import CanvasBoard from './components/Canvas/CanvasBoard';
import MainToolbar from './components/Toolbar/MainToolbar';
import LeftPanel from './components/Sidebar/LeftPanel';
import RightPanel from './components/Sidebar/RightPanel';
import ChatPanel, { ChatButton } from './components/Chat/ChatPanel';
import { useCanvasStore } from './store/canvasStore';
import { canvasApi, authApi } from './api/client';
import type { FullCanvas, Role } from './types';

const CanvasPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const {
    currentCanvas,
    currentUser,
    setCurrentCanvas,
    setElements,
    setConnections,
    setViewport,
    setCanvasRole,
    setCurrentUser,
    setOnlineUsers,
  } = useCanvasStore();

  const isPublic = location.pathname.includes('/public/');

  const loadCanvas = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data: FullCanvas = await canvasApi.get(id, isPublic);
      setCurrentCanvas(data);
      setElements(data.elements || []);
      setConnections(data.connections || []);
      if (data.viewport) {
        setViewport(data.viewport);
      }

      if (!isPublic) {
        try {
          const roleData = await canvasApi.getRole(id);
          setCanvasRole(roleData.role);
          setRole(roleData.role);
        } catch {
          setCanvasRole('VIEWER');
          setRole('VIEWER');
        }
      } else {
        setCanvasRole('PUBLIC');
        setRole('PUBLIC');
      }
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? '画布不存在或已被删除'
        : err?.response?.status === 403
          ? '您没有权限访问此画布'
          : '加载画布失败，请稍后重试';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [id, isPublic, setCurrentCanvas, setElements, setConnections, setViewport, setCanvasRole]);

  useEffect(() => {
    loadCanvas();
    return () => {
      setOnlineUsers([]);
    };
  }, [loadCanvas, setOnlineUsers]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 animate-pulse">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <div className="absolute -inset-4 rounded-3xl bg-indigo-500/10 animate-ping" style={{ animationDuration: '1.5s' }} />
        </div>
        <div className="mt-8 text-center">
          <h3 className="text-lg font-semibold text-slate-700 mb-2">正在加载画布...</h3>
          <p className="text-sm text-slate-400">准备协作环境，请稍候</p>
        </div>
        <div className="mt-6 w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-[progress_1.5s_ease-in-out_infinite]" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-red-50/50 p-4">
        <div className="max-w-md w-full card text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-red-100 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">加载失败</h3>
          <p className="text-slate-500 mb-6">{loadError}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button className="btn" onClick={() => navigate('/dashboard')}>
              返回仪表盘
            </button>
            <button className="btn btn-primary" onClick={loadCanvas}>
              重试加载
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canEdit = role && role !== 'VIEWER' && role !== 'PUBLIC';

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-100 overflow-hidden">
      <MainToolbar />

      <div className="flex-1 flex overflow-hidden relative">
        {showLeftPanel && (
          <div className="relative z-10 flex-shrink-0 shadow-[2px_0_8px_rgba(0,0,0,0.04)]">
            <LeftPanel />
          </div>
        )}

        <div
          className="flex-1 relative overflow-hidden bg-slate-50"
          data-canvas-container
        >
          <CanvasBoard />

          {!showLeftPanel && (
            <button
              onClick={() => setShowLeftPanel(true)}
              className="absolute top-4 left-4 z-20 btn btn-icon bg-white shadow-md hover:shadow-lg"
              title="显示左侧面板"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          )}

          {!showRightPanel && (
            <button
              onClick={() => setShowRightPanel(true)}
              className="absolute top-4 right-4 z-20 btn btn-icon bg-white shadow-md hover:shadow-lg"
              title="显示右侧面板"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M15 3v18" />
              </svg>
            </button>
          )}

          {role === 'PUBLIC' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-full text-sm font-medium shadow-sm flex items-center gap-2 backdrop-blur-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              您正在以访客身份查看此公开画布
              <button
                className="ml-2 text-indigo-600 hover:text-indigo-700 font-semibold underline-offset-2 hover:underline"
                onClick={() => navigate('/login?next=' + encodeURIComponent(location.pathname))}
              >
                登录编辑
              </button>
            </div>
          )}

          {!canEdit && role !== 'PUBLIC' && role !== null && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-full text-sm font-medium shadow-sm flex items-center gap-2 backdrop-blur-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              只读模式 - 您只有查看权限
            </div>
          )}

          {showChat ? (
            <ChatPanel open={showChat} onClose={() => setShowChat(false)} />
          ) : (
            <ChatButton onClick={() => setShowChat(true)} />
          )}
        </div>

        {showRightPanel && (
          <div className="relative z-10 flex-shrink-0 shadow-[-2px_0_8px_rgba(0,0,0,0.04)]">
            <RightPanel />
          </div>
        )}

        <style>{`
          @keyframes progress {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(80%); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
      </div>
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAuth?: boolean }> = ({ children, requireAuth = false }) => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useCanvasStore();
  const [checking, setChecking] = useState(!currentUser);

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      const stored = authApi.getCurrentUser();
      if (!stored) {
        if (requireAuth) {
          navigate('/login', { replace: true });
        }
        if (!cancelled) setChecking(false);
        return;
      }
      try {
        const fresh = await authApi.me();
        if (!cancelled) {
          setCurrentUser(fresh);
        }
      } catch {
        authApi.logout();
        if (requireAuth && !cancelled) {
          navigate('/login', { replace: true });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    if (!currentUser) {
      verify();
    } else {
      setChecking(false);
    }
    return () => { cancelled = true; };
  }, [currentUser, requireAuth, navigate, setCurrentUser]);

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-10 w-10 text-indigo-600" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-slate-500 text-sm">验证登录状态...</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/canvas/:id"
        element={
          <ProtectedRoute requireAuth={false}>
            <CanvasPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/public/canvas/:id"
        element={<CanvasPage />}
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default App;
