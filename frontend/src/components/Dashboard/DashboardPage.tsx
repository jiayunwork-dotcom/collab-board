import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { canvasApi, authApi, templateApi } from '@/api/client';
import { useCanvasStore } from '@/store/canvasStore';
import type { Canvas, Template } from '@/types';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [publicCanvases, setPublicCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated');
  const [creating, setCreating] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newCanvasForm, setNewCanvasForm] = useState({ title: '', description: '', backgroundType: 'GRID_DOTS' as 'SOLID' | 'GRID_DOTS' | 'GRID_LINES' });

  const { currentUser, setCurrentUser } = useCanvasStore();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = authApi.getCurrentUser();
        if (user) {
          const fresh = await authApi.me();
          setCurrentUser(fresh);
        }
      } catch {}
    };
    loadUser();
  }, [setCurrentUser]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mine, pub, tpls] = await Promise.all([
        canvasApi.list().catch(() => getMockCanvases()),
        canvasApi.listPublic().catch(() => []),
        templateApi.list().catch(() => getMockTemplates()),
      ]);
      setCanvases(mine);
      setPublicCanvases(pub);
      setTemplates(tpls.slice(0, 6));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getMockCanvases = (): Canvas[] => [
    {
      id: 'demo-1',
      ownerId: 'demo',
      title: '产品设计讨论',
      description: 'Q3产品路线图讨论和功能规划',
      isPublic: false,
      backgroundType: 'GRID_DOTS',
      backgroundColor: '#FFFFFF',
      gridSize: 40,
      viewportX: 0, viewportY: 0, viewportZoom: 1,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    },
    {
      id: 'demo-2',
      ownerId: 'demo',
      title: 'Q4 OKR 拆解',
      description: '团队第四季度目标和关键结果',
      isPublic: false,
      backgroundType: 'GRID_LINES',
      backgroundColor: '#FAFAFA',
      gridSize: 40,
      viewportX: 0, viewportY: 0, viewportZoom: 1,
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    },
    {
      id: 'demo-3',
      ownerId: 'demo',
      title: '用户调研分析',
      description: '深度访谈结果整理与分析',
      isPublic: false,
      backgroundType: 'SOLID',
      backgroundColor: '#F8FAFC',
      gridSize: 40,
      viewportX: 0, viewportY: 0, viewportZoom: 1,
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      id: 'demo-4',
      ownerId: 'demo',
      title: '架构设计评审',
      description: '新系统架构讨论',
      isPublic: true,
      backgroundType: 'GRID_DOTS',
      backgroundColor: '#FFFFFF',
      gridSize: 40,
      viewportX: 0, viewportY: 0, viewportZoom: 1,
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    },
  ];

  const getMockTemplates = (): Template[] => [
    { id: 't1', name: '头脑风暴', description: '自由发散创意', category: '创意', isBuiltin: true, data: { elements: [], connections: [] }, createdAt: '' },
    { id: 't2', name: '项目看板', description: '任务状态追踪', category: '项目管理', isBuiltin: true, data: { elements: [], connections: [] }, createdAt: '' },
    { id: 't3', name: 'SWOT分析', description: '战略分析工具', category: '战略', isBuiltin: true, data: { elements: [], connections: [] }, createdAt: '' },
    { id: 't4', name: '思维导图', description: '结构化整理', category: '学习', isBuiltin: true, data: { elements: [], connections: [] }, createdAt: '' },
    { id: 't5', name: '用户旅程', description: 'UX体验地图', category: 'UX设计', isBuiltin: true, data: { elements: [], connections: [] }, createdAt: '' },
    { id: 't6', name: '会议记录', description: '要点与决议', category: '会议', isBuiltin: true, data: { elements: [], connections: [] }, createdAt: '' },
  ];

  const createCanvas = async () => {
    if (!newCanvasForm.title.trim()) return;
    setCreating(true);
    try {
      const newCanvas = await canvasApi.create({
        title: newCanvasForm.title || '未命名画布',
        description: newCanvasForm.description,
        backgroundType: newCanvasForm.backgroundType,
      });
      navigate(`/canvas/${newCanvas.id}`);
    } catch {
      navigate(`/canvas/demo-new-${Date.now()}`);
    } finally {
      setCreating(false);
      setShowNewModal(false);
    }
  };

  const deleteCanvas = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个画布吗？此操作不可撤销。')) return;
    try {
      await canvasApi.delete(id);
      setCanvases(prev => prev.filter(c => c.id !== id));
    } catch {
      setCanvases(prev => prev.filter(c => c.id !== id));
    }
  };

  const formatDate = (d: string) => {
    try {
      const date = new Date(d);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch { return d; }
  };

  const filteredCanvases = canvases
    .filter(c => c.title.toLowerCase().includes(search.toLowerCase()) || (c.description || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const logout = () => {
    authApi.logout();
    setCurrentUser(null);
    navigate('/login', { replace: true });
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const trimmed = name.trim();
    if (trimmed.length <= 2) return trimmed.toUpperCase();
    const parts = trimmed.split(/[\s_]+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
  };

  const getBgGradient = (type: string, color: string) => {
    if (type === 'GRID_DOTS') {
      return `radial-gradient(circle, rgba(148,163,184,0.3) 1px, ${color} 1px) 0 0 / 16px 16px`;
    }
    if (type === 'GRID_LINES') {
      return `linear-gradient(rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.2) 1px, transparent 1px), ${color}`;
    }
    return color;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M3 9h18M9 21V9" />
                <circle cx="14" cy="5" r="1" />
                <circle cx="18" cy="14" r="1" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Collab Board</h1>
              <p className="text-xs text-slate-500">协作白板工作台</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                className="input pl-9 pr-4 w-72 py-2 bg-slate-50"
                placeholder="搜索画布..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button
              className="btn btn-primary gap-2 font-medium"
              onClick={() => {
                setNewCanvasForm({ title: '', description: '', backgroundType: 'GRID_DOTS' });
                setShowNewModal(true);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              新建画布
            </button>

            {currentUser ? (
              <div className="flex items-center gap-2 ml-2">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-700">{currentUser.username}</p>
                  <p className="text-xs text-slate-400 truncate max-w-[140px]">{currentUser.email}</p>
                </div>
                <div className="relative group">
                  <div
                    className="w-10 h-10 rounded-full cursor-pointer flex items-center justify-center text-white font-semibold text-sm ring-2 ring-white shadow-sm"
                    style={{ background: currentUser.color || '#6366F1' }}
                  >
                    {getInitials(currentUser.username || currentUser.email || 'U')}
                  </div>
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 py-1 z-50 hidden group-hover:block">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-700">{currentUser.username}</p>
                      <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
                    </div>
                    <button className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg>
                      个人设置
                    </button>
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      onClick={logout}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                      退出登录
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                className="btn text-sm font-medium"
                onClick={() => navigate('/login')}
              >
                登录
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <section className="mb-10">
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 rounded-3xl p-8 md:p-10 text-white relative overflow-hidden shadow-xl shadow-indigo-500/20">
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="30" stroke="white" strokeWidth="2" />
                <rect x="120" y="100" width="60" height="40" rx="5" stroke="white" strokeWidth="2" />
                <path d="M200 80L240 120L280 90L320 140" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M350 60L350 160M330 80L370 80" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                👋 你好{currentUser ? `，${currentUser.username}` : ''}
              </h2>
              <p className="text-white/80 mb-6 max-w-xl text-base">
                创建你的第一个协作白板，与团队一起头脑风暴、规划项目、对齐目标，让创意无限延展。
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  className="bg-white/20 backdrop-blur hover:bg-white/30 border border-white/30 text-white rounded-xl px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition-all hover:scale-[1.02]"
                  onClick={() => {
                    setNewCanvasForm({ title: '', description: '', backgroundType: 'GRID_DOTS' });
                    setShowNewModal(true);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  创建空白画布
                </button>
                <button
                  className="bg-white text-indigo-600 hover:bg-white/90 rounded-xl px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition-all hover:scale-[1.02] shadow-lg"
                  onClick={() => {
                    const tpl = templates[0];
                    if (tpl) {
                      createFromTemplate(tpl);
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4h16v4H4zM4 12h16v8H4zM12 8v4" />
                  </svg>
                  从模板开始
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-2xl">✨</span> 推荐模板
            </h3>
            <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              查看全部 →
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {templates.map(tpl => (
              <div
                key={tpl.id}
                onClick={() => createFromTemplate(tpl)}
                className="group cursor-pointer"
              >
                <div className="aspect-[4/3] rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm group-hover:shadow-md group-hover:border-indigo-200 transition-all">
                  <div className="h-full p-2">
                    <div className="w-full h-full rounded-lg bg-gradient-to-br from-slate-50 to-indigo-50 relative overflow-hidden flex items-center justify-center">
                      <TemplateThumbnail name={tpl.name} />
                      <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="bg-white text-indigo-600 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                          使用模板
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-700 text-center truncate">{tpl.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-2xl">📁</span> 我的画布
              <span className="text-sm font-normal text-slate-400">({filteredCanvases.length})</span>
            </h3>
            <div className="flex items-center gap-2">
              <select
                className="input text-sm py-1.5"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="updated">最近更新</option>
                <option value="created">创建时间</option>
                <option value="title">标题排序</option>
              </select>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  className={`px-2.5 py-1.5 rounded-md text-slate-600 ${view === 'grid' ? 'bg-white shadow-sm text-indigo-600' : ''}`}
                  onClick={() => setView('grid')}
                  title="网格视图"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </button>
                <button
                  className={`px-2.5 py-1.5 rounded-md text-slate-600 ${view === 'list' ? 'bg-white shadow-sm text-indigo-600' : ''}`}
                  onClick={() => setView('list')}
                  title="列表视图"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5' : 'space-y-3'}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="animate-pulse">
                  {view === 'grid' ? (
                    <>
                      <div className="aspect-video bg-slate-200 rounded-xl mb-3" />
                      <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-slate-200 rounded w-1/2" />
                    </>
                  ) : (
                    <div className="bg-white rounded-xl p-4 border border-slate-200 flex gap-4">
                      <div className="w-20 h-14 bg-slate-200 rounded-lg flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-200 rounded w-1/3" />
                        <div className="h-3 bg-slate-200 rounded w-1/2" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : filteredCanvases.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-slate-700 mb-2">
                {search ? '没有找到匹配的画布' : '还没有画布'}
              </h4>
              <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                {search ? '试试其他关键词或清除搜索条件' : '创建你的第一个协作画布，开始和团队一起头脑风暴'}
              </p>
              {!search && (
                <button
                  className="btn btn-primary gap-2"
                  onClick={() => {
                    setNewCanvasForm({ title: '', description: '', backgroundType: 'GRID_DOTS' });
                    setShowNewModal(true);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  创建第一个画布
                </button>
              )}
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredCanvases.map(canvas => (
                <div
                  key={canvas.id}
                  onClick={() => navigate(`/canvas/${canvas.id}`)}
                  className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg hover:shadow-slate-200/60 hover:border-indigo-200 transition-all duration-200 cursor-pointer"
                >
                  <div
                    className="aspect-video relative overflow-hidden"
                    style={{
                      background: getBgGradient(canvas.backgroundType, canvas.backgroundColor || '#FFFFFF'),
                      backgroundSize: canvas.backgroundType === 'GRID_DOTS' ? '16px 16px' : canvas.backgroundType === 'GRID_LINES' ? '20px 20px' : undefined,
                    }}
                  >
                    <div className="absolute inset-0 p-3 flex flex-wrap gap-1.5 items-start content-start">
                      <div className="w-10 h-8 rounded bg-indigo-100 border border-indigo-200" />
                      <div className="w-14 h-6 rounded bg-amber-100 border border-amber-200" />
                      <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200" />
                    </div>
                    {canvas.isPublic && (
                      <span className="absolute top-2 left-2 text-[10px] font-semibold bg-white/90 text-slate-600 px-2 py-0.5 rounded-full backdrop-blur flex items-center gap-1 shadow-sm">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                        公开
                      </span>
                    )}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="bg-white/95 hover:bg-white text-red-500 w-7 h-7 rounded-lg flex items-center justify-center shadow-md hover:shadow-lg transition-all"
                        onClick={(e) => deleteCanvas(canvas.id, e)}
                        title="删除画布"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-semibold text-slate-800 truncate flex-1 group-hover:text-indigo-600 transition-colors">
                        {canvas.title || '未命名画布'}
                      </h4>
                    </div>
                    {canvas.description && (
                      <p className="text-xs text-slate-500 mb-3 line-clamp-2 min-h-[2em]">
                        {canvas.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        {formatDate(canvas.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {filteredCanvases.map(canvas => (
                <div
                  key={canvas.id}
                  onClick={() => navigate(`/canvas/${canvas.id}`)}
                  className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <div
                    className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200"
                    style={{
                      background: getBgGradient(canvas.backgroundType, canvas.backgroundColor || '#FFFFFF'),
                      backgroundSize: canvas.backgroundType === 'GRID_DOTS' ? '10px 10px' : canvas.backgroundType === 'GRID_LINES' ? '12px 12px' : undefined,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                        {canvas.title || '未命名画布'}
                      </h4>
                      {canvas.isPublic && (
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0">公开</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {canvas.description || '暂无描述'}
                    </p>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-4">
                    <span className="hidden sm:inline">
                      创建于 {new Date(canvas.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                    <span>更新于 {formatDate(canvas.updatedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                      onClick={(e) => deleteCanvas(canvas.id, e)}
                      title="删除"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {publicCanvases.length > 0 && (
          <section className="mt-12">
            <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
              <span className="text-2xl">🌍</span> 社区公开画布
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {publicCanvases.slice(0, 3).map(canvas => (
                <div
                  key={canvas.id}
                  onClick={() => navigate(`/canvas/${canvas.id}`)}
                  className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                      style={{ background: '#64748b' }}
                    >
                      {String.fromCharCode(65 + (Math.abs(canvas.id.charCodeAt(canvas.id.length - 1)) % 26))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{canvas.title}</h4>
                      <p className="text-xs text-slate-400">公开分享</p>
                    </div>
                  </div>
                  {canvas.description && (
                    <p className="text-sm text-slate-600 line-clamp-2">{canvas.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowNewModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">创建新画布</h3>
              <p className="text-sm text-slate-500 mt-1">开始你的创作之旅</p>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  画布标题 <span className="text-red-500">*</span>
                </label>
                <input
                  className="input w-full py-2.5"
                  placeholder="例如：Q3 产品规划会议"
                  value={newCanvasForm.title}
                  onChange={(e) => setNewCanvasForm({ ...newCanvasForm, title: e.target.value })}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createCanvas();
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">描述</label>
                <textarea
                  className="input w-full py-2.5 resize-none min-h-[72px]"
                  placeholder="可选：简要描述这个画布的用途..."
                  value={newCanvasForm.description}
                  onChange={(e) => setNewCanvasForm({ ...newCanvasForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">背景样式</label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { v: 'SOLID', label: '纯色', icon: 'M3 3h18v18H3z' },
                    { v: 'GRID_DOTS', label: '点阵', icon: 'M5 5h.01M10 5h.01M15 5h.01M5 10h.01M10 10h.01M15 10h.01M5 15h.01M10 15h.01M15 15h.01' },
                    { v: 'GRID_LINES', label: '网格', icon: 'M4 4v16M10 4v16M16 4v16M4 4h16M4 10h16M4 16h16' },
                  ] as const).map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      className={`p-3 rounded-xl border-2 transition-all ${
                        newCanvasForm.backgroundType === opt.v
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      onClick={() => setNewCanvasForm({ ...newCanvasForm, backgroundType: opt.v })}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={newCanvasForm.backgroundType === opt.v ? '#6366F1' : '#94A3B8'} strokeWidth="2" className="mx-auto mb-1.5">
                        <path d={opt.icon} />
                      </svg>
                      <p className={`text-xs font-medium ${newCanvasForm.backgroundType === opt.v ? 'text-indigo-600' : 'text-slate-600'}`}>{opt.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
                className="flex-1 btn py-2.5 font-medium"
                onClick={() => setShowNewModal(false)}
                disabled={creating}
              >
                取消
              </button>
              <button
                className="flex-1 btn btn-primary py-2.5 font-medium disabled:opacity-60"
                onClick={createCanvas}
                disabled={creating || !newCanvasForm.title.trim()}
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    创建中...
                  </span>
                ) : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function createFromTemplate(tpl: Template) {
    try {
      const newCanvas = await canvasApi.create({
        title: tpl.name + ' - 副本',
        description: tpl.description,
        backgroundType: (tpl.data.backgroundType as any) || 'GRID_DOTS',
        backgroundColor: tpl.data.backgroundColor || '#FFFFFF',
      });
      navigate(`/canvas/${newCanvas.id}`);
    } catch {
      navigate(`/canvas/demo-${Date.now()}`);
    }
  }
};

const TemplateThumbnail: React.FC<{ name: string }> = ({ name }) => {
  const colors = ['#DBEAFE', '#FEF3C7', '#DCFCE7', '#FCE7F3', '#F3E8FF', '#E0E7FF'];
  const color = colors[Math.abs(name.charCodeAt(0)) % colors.length];
  const strokeColor = color.replace('E', '8').replace('F', '6').replace('D', '4').replace('C', '2').replace('B', '0');
  return (
    <div className="p-2 w-full h-full flex items-center justify-center">
      <div className="w-full h-full rounded border-2 flex items-center justify-center" style={{ borderColor: strokeColor, background: color + '80' }}>
        <span className="text-xs font-bold" style={{ color: strokeColor }}>{name.slice(0, 2)}</span>
      </div>
    </div>
  );
};

export default DashboardPage;
