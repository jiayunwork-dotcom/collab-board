import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { Template, Version, CanvasElement, CanvasConnection } from '@/types';
import { templateApi, versionApi, canvasApi } from '@/api/client';
import { useNavigate, useParams } from 'react-router-dom';
import { lerp, uid } from '@/utils';

type TabKey = 'users' | 'templates' | 'versions';
type PlaybackSpeed = 'slow' | 'normal' | 'fast';

const LeftPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>('normal');
  const playbackAnimRef = useRef<number | null>(null);
  const playbackDataRef = useRef<Array<{ elements: CanvasElement[]; connections: CanvasConnection[] }>>([]);
  const playbackSnapshotsRef = useRef<Map<string, any>>(new Map());
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();

  const {
    onlineUsers,
    viewport,
    setViewport,
    setElements,
    setConnections,
    remoteCursors,
  } = useCanvasStore();

  const canvasId = params.id;

  useEffect(() => {
    if (activeTab === 'templates') {
      loadTemplates();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'versions' && canvasId) {
      loadVersions();
    }
  }, [activeTab, canvasId]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await templateApi.list();
      setTemplates(data);
    } catch (e) {
      console.error('Load templates failed', e);
      setTemplates(getBuiltinTemplates());
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadVersions = async () => {
    if (!canvasId) return;
    setLoadingVersions(true);
    try {
      const data = await versionApi.list(canvasId);
      setVersions(data);
    } catch (e) {
      console.error('Load versions failed', e);
    } finally {
      setLoadingVersions(false);
    }
  };

  const getBuiltinTemplates = (): Template[] => [
    {
      id: 'tpl-1',
      name: '头脑风暴',
      description: '自由发散创意，记录灵感',
      category: '创意',
      isBuiltin: true,
      data: {
        elements: [
          { type: 'mindnode', x: -200, y: -40, width: 200, height: 80, data: { text: '核心主题', mindMapLevel: 0, fillColor: '#DBEAFE', strokeColor: '#3B82F6' } },
        ],
        connections: [],
        backgroundType: 'GRID_DOTS',
        backgroundColor: '#FFFFFF',
      },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tpl-2',
      name: '项目规划',
      description: '任务拆解与时间规划',
      category: '项目管理',
      isBuiltin: true,
      data: {
        elements: [
          { type: 'sticky_note', x: -200, y: -100, width: 150, height: 100, data: { text: '待办', noteColor: '#FCE7F3' } },
          { type: 'sticky_note', x: 0, y: -100, width: 150, height: 100, data: { text: '进行中', noteColor: '#FEF3C7' } },
          { type: 'sticky_note', x: 200, y: -100, width: 150, height: 100, data: { text: '已完成', noteColor: '#DCFCE7' } },
        ],
        connections: [],
        backgroundType: 'GRID_LINES',
        backgroundColor: '#FFFFFF',
      },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tpl-3',
      name: '用户旅程地图',
      description: '可视化用户体验流程',
      category: 'UX设计',
      isBuiltin: true,
      data: {
        elements: [
          { type: 'text', x: -300, y: 0, width: 120, height: 60, data: { text: '发现', fontSize: 18, align: 'center' } },
          { type: 'arrow', x: -150, y: 25, width: 80, height: 10, data: { points: [{x:0,y:5},{x:80,y:5}], arrowEnd: true } },
          { type: 'text', x: -50, y: 0, width: 120, height: 60, data: { text: '购买', fontSize: 18, align: 'center' } },
          { type: 'arrow', x: 100, y: 25, width: 80, height: 10, data: { points: [{x:0,y:5},{x:80,y:5}], arrowEnd: true } },
          { type: 'text', x: 200, y: 0, width: 120, height: 60, data: { text: '使用', fontSize: 18, align: 'center' } },
        ],
        connections: [],
        backgroundType: 'SOLID',
        backgroundColor: '#F8FAFC',
      },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tpl-4',
      name: '思维导图',
      description: '结构化整理想法',
      category: '学习',
      isBuiltin: true,
      data: {
        elements: [
          { type: 'mindnode', x: -100, y: -30, width: 200, height: 60, data: { text: '中心主题', mindMapLevel: 0, shape: 'ellipse', fillColor: '#EFF6FF', strokeColor: '#6366F1' } },
        ],
        connections: [],
        backgroundType: 'GRID_DOTS',
        backgroundColor: '#FFFFFF',
      },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tpl-5',
      name: '会议记录',
      description: '快速记录要点与决议',
      category: '会议',
      isBuiltin: true,
      data: {
        elements: [
          { type: 'rectangle', x: -250, y: -150, width: 500, height: 60, data: { text: '会议主题 / 日期', fontSize: 20, fillColor: '#E0E7FF', strokeColor: '#6366F1', align: 'center' } },
          { type: 'sticky_note', x: -250, y: -70, width: 240, height: 120, data: { text: '议题一\n\n要点...', noteColor: '#FEF3C7' } },
          { type: 'sticky_note', x: 10, y: -70, width: 240, height: 120, data: { text: '决议事项\n\n要点...', noteColor: '#DBEAFE' } },
          { type: 'sticky_note', x: -250, y: 70, width: 240, height: 120, data: { text: '待办事项\n\n负责人 + 截止', noteColor: '#DCFCE7' } },
          { type: 'sticky_note', x: 10, y: 70, width: 240, height: 120, data: { text: '下次会议\n\n时间 + 议题', noteColor: '#FCE7F3' } },
        ],
        connections: [],
        backgroundType: 'SOLID',
        backgroundColor: '#FFFFFF',
      },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tpl-6',
      name: 'SWOT分析',
      description: '优势劣势机会威胁分析',
      category: '战略',
      isBuiltin: true,
      data: {
        elements: [
          { type: 'rectangle', x: -260, y: -180, width: 250, height: 160, data: { text: '优势 (S)\n\n• \n• ', fillColor: '#DCFCE7', strokeColor: '#10B981', strokeWidth: 2 } },
          { type: 'rectangle', x: 10, y: -180, width: 250, height: 160, data: { text: '劣势 (W)\n\n• \n• ', fillColor: '#FCE7F3', strokeColor: '#EC4899', strokeWidth: 2 } },
          { type: 'rectangle', x: -260, y: -10, width: 250, height: 160, data: { text: '机会 (O)\n\n• \n• ', fillColor: '#DBEAFE', strokeColor: '#3B82F6', strokeWidth: 2 } },
          { type: 'rectangle', x: 10, y: -10, width: 250, height: 160, data: { text: '威胁 (T)\n\n• \n• ', fillColor: '#FEF3C7', strokeColor: '#F59E0B', strokeWidth: 2 } },
        ],
        connections: [],
        backgroundType: 'GRID_LINES',
        backgroundColor: '#F8FAFC',
      },
      createdAt: new Date().toISOString(),
    },
  ];

  const displayTemplates = templates.length > 0 ? templates : getBuiltinTemplates();

  const jumpToUser = (userId: string) => {
    const cursor = remoteCursors.get(userId);
    const user = onlineUsers.get(userId);
    if (cursor) {
      const rect = document.querySelector('[data-canvas-container]')?.getBoundingClientRect();
      const w = rect?.width || window.innerWidth;
      const h = rect?.height || window.innerHeight;
      setViewport({
        x: cursor.x - w / 2 / viewport.zoom,
        y: cursor.y - h / 2 / viewport.zoom,
      });
    } else if (user) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({
        x: user.cursorX - w / 2 / viewport.zoom,
        y: user.cursorY - h / 2 / viewport.zoom,
      });
    }
  };

  const applyTemplate = async (tpl: Template) => {
    if (!canvasId) return;
    try {
      const elementsData = tpl.data.elements.map((el: any, i: number) => ({
        id: el.id || `tpl-${Date.now()}-${i}`,
        ...el,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation || 0,
        zIndex: i,
        opacity: 1,
        locked: false,
        visible: true,
        data: el.data || {},
      }));
      setElements(elementsData);
      setConnections(tpl.data.connections || []);

      if (tpl.data.backgroundType || tpl.data.backgroundColor) {
        useCanvasStore.getState().updateCanvasMeta({
          ...(tpl.data.backgroundType && { backgroundType: tpl.data.backgroundType as any }),
          ...(tpl.data.backgroundColor && { backgroundColor: tpl.data.backgroundColor }),
        });
      }

      setViewport({ x: -400, y: -300, zoom: 1 });
    } catch (e) {
      console.error('Apply template failed', e);
    }
  };

  const restoreVersion = async (version: Version) => {
    if (!canvasId) return;
    try {
      await versionApi.restore(canvasId, version.id);
      await loadVersions();
    } catch (e) {
      console.error('Restore version failed', e);
      alert('恢复失败：' + (e as any)?.response?.data?.message || (e as Error).message);
    }
  };

  const stopPlayback = useCallback(() => {
    if (playbackAnimRef.current != null) {
      cancelAnimationFrame(playbackAnimRef.current);
      playbackAnimRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackIndex(-1);
    playbackDataRef.current = [];
    playbackSnapshotsRef.current.clear();
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const applySnapshotToCanvas = (snap: any) => {
    if (snap?.elements) {
      setElements(snap.elements.map((el: any) => ({
        ...el,
        data: el.data || {},
        visible: el.visible !== false,
        opacity: el.opacity ?? 1,
        rotation: el.rotation ?? 0,
        zIndex: el.zIndex ?? 0,
        locked: el.locked === true,
      })));
    }
    if (snap?.connections) {
      setConnections(snap.connections);
    }
  };

  const buildInterpSnapshots = async (startIdx: number, endIdx: number) => {
    const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
    const slice = sorted.slice(startIdx, endIdx + 1);
    const snaps = new Map<string, any>();
    for (const v of slice) {
      if (!playbackSnapshotsRef.current.has(v.id)) {
        try {
          const s = await versionApi.getSnapshot(canvasId!, v.id);
          playbackSnapshotsRef.current.set(v.id, s);
        } catch (e) {
          console.error('Get snapshot failed', v.id, e);
        }
      }
      snaps.set(v.id, playbackSnapshotsRef.current.get(v.id));
    }
    return { slice, snaps };
  };

  const animateBetweenSnapshots = (
    snapA: any,
    snapB: any,
    duration: number,
    onComplete: () => void
  ) => {
    const elsA = new Map<string, CanvasElement>((snapA?.elements || []).map((e: CanvasElement) => [e.id, e]));
    const elsB = new Map<string, CanvasElement>((snapB?.elements || []).map((e: CanvasElement) => [e.id, e]));
    const allIds = new Set<string>([...elsA.keys(), ...elsB.keys()]);

    const frames: Array<{ elements: CanvasElement[]; connections: CanvasConnection[] }> = [];
    const steps = Math.max(12, Math.floor(duration / 16));

    const connsA: CanvasConnection[] = (snapB?.connections || snapA?.connections || []);

    for (let f = 0; f <= steps; f++) {
      const t = f / steps;
      const interpolated: CanvasElement[] = [];
      allIds.forEach((id: string) => {
        const a = elsA.get(id);
        const b = elsB.get(id);
        if (a && b) {
          interpolated.push({
            ...b,
            x: lerp(a.x ?? b.x ?? 0, b.x ?? a.x ?? 0, t),
            y: lerp(a.y ?? b.y ?? 0, b.y ?? a.y ?? 0, t),
            width: lerp(a.width ?? b.width ?? 0, b.width ?? a.width ?? 0, t),
            height: lerp(a.height ?? b.height ?? 0, b.height ?? a.height ?? 0, t),
            rotation: lerp(a.rotation ?? 0, b.rotation ?? 0, t),
            opacity: lerp(a.opacity ?? 1, b.opacity ?? 1, t),
            zIndex: b.zIndex ?? a.zIndex ?? 0,
            data: { ...(a.data || {}), ...(b.data || {}) },
            visible: b.visible !== false,
            locked: b.locked === true,
          } as CanvasElement);
        } else if (b) {
          const appear = Math.min(1, t * 2.5);
          interpolated.push({ ...b, opacity: (b.opacity ?? 1) * appear } as CanvasElement);
        } else if (a) {
          const disappear = Math.max(0, 1 - t * 2.5);
          interpolated.push({ ...a, opacity: (a.opacity ?? 1) * disappear } as CanvasElement);
        }
      });
      frames.push({ elements: interpolated, connections: connsA });
    }
    playbackDataRef.current = frames;
  };

  const startPlayback = async (startVersion: Version) => {
    if (!canvasId) return;
    stopPlayback();
    const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
    const startIdx = sorted.findIndex(v => v.id === startVersion.id);
    if (startIdx < 0) return;
    const endIdx = sorted.length - 1;
    if (startIdx >= endIdx) {
      alert('此版本已是最新，无可回放操作');
      return;
    }
    try {
      const { slice, snaps } = await buildInterpSnapshots(startIdx, endIdx);
      applySnapshotToCanvas(snaps.get(slice[0].id));
      setIsPlaying(true);

      const speedFactor = playbackSpeed === 'slow' ? 0.5 : playbackSpeed === 'fast' ? 2.5 : 1;
      let frameIdx = 0;
      let segmentStartVersion = 0;
      const versionCount = slice.length - 1;

      const runSegment = async (segIdx: number) => {
        if (segIdx >= versionCount) {
          stopPlayback();
          const last = slice[slice.length - 1];
          const snap = snaps.get(last.id);
          if (snap) applySnapshotToCanvas(snap);
          return;
        }
        const segDuration = 900 / speedFactor;
        const snapA = snaps.get(slice[segIdx].id);
        const snapB = snaps.get(slice[segIdx + 1].id);
        animateBetweenSnapshots(snapA, snapB, segDuration, () => {});

        const totalFrames = playbackDataRef.current.length;
        const startTime = performance.now();
        setPlaybackIndex(segIdx);

        const tick = () => {
          const elapsed = performance.now() - startTime;
          const localProgress = Math.min(1, elapsed / segDuration);
          const frameToShow = Math.min(totalFrames - 1, Math.floor(localProgress * (totalFrames - 1)));
          if (frameToShow >= 0 && playbackDataRef.current[frameToShow]) {
            const fd = playbackDataRef.current[frameToShow];
            setElements(fd.elements);
            setConnections(fd.connections);
          }
          if (localProgress >= 1) {
            setTimeout(() => runSegment(segIdx + 1), 180);
          } else {
            playbackAnimRef.current = requestAnimationFrame(tick);
          }
        };
        playbackAnimRef.current = requestAnimationFrame(tick);
      };
      runSegment(0);
    } catch (e) {
      console.error('Playback failed', e);
      stopPlayback();
    }
  };

  const createFromTemplate = async (tpl: Template) => {
    try {
      const newCanvas = await canvasApi.create({
        title: tpl.name + ' - 副本',
        description: tpl.description,
        backgroundType: (tpl.data.backgroundType as any) || 'GRID_DOTS',
        backgroundColor: tpl.data.backgroundColor || '#FFFFFF',
        gridSize: 40,
      });
      navigate(`/canvas/${newCanvas.id}`);
      setTimeout(() => applyTemplate(tpl), 300);
    } catch (e) {
      console.error('Create from template failed', e);
      applyTemplate(tpl);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const trimmed = name.trim();
    if (trimmed.length <= 2) return trimmed.toUpperCase();
    const parts = trimmed.split(/[\s_]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
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
      return date.toLocaleDateString('zh-CN');
    } catch { return d; }
  };

  const usersList = [...onlineUsers.values()];

  return (
    <div className="w-72 h-full bg-white border-r border-slate-200 flex flex-col">
      <div className="flex border-b border-slate-200">
        {([
          { key: 'users' as const, label: '协作者', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
          { key: 'templates' as const, label: '模板', icon: 'M4 4h16v4H4zM4 12h16v8H4z' },
          { key: 'versions' as const, label: '版本', icon: 'M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors flex flex-col items-center gap-0.5 ${
              activeTab === tab.key
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar">
        {activeTab === 'users' && (
          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-xs font-semibold text-slate-500">
                在线用户 ({usersList.length})
              </span>
            </div>
            {usersList.length === 0 ? (
              <div className="text-center text-slate-400 py-8 text-sm">
                <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0z" />
                </svg>
                暂无协作者
              </div>
            ) : (
              usersList.map(user => (
                <div
                  key={user.userId}
                  className="list-item cursor-pointer group"
                  onClick={() => jumpToUser(user.userId)}
                  title="点击跳转至该用户位置"
                >
                  <div
                    className="avatar relative"
                    style={{ background: user.color || '#6366F1' }}
                  >
                    {getInitials(user.username)}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {user.username}
                      {user.userId === useCanvasStore.getState().currentUser?.id && (
                        <span className="ml-1 text-xs text-slate-400">(我)</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatDate(new Date(user.lastActive).toISOString())}
                    </div>
                  </div>
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-slate-300 group-hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7" />
                  </svg>
                </div>
              ))
            )}

            <div className="border-t border-slate-100 my-4 pt-3">
              <div className="px-2 py-2">
                <span className="text-xs font-semibold text-slate-500">角色权限</span>
              </div>
              <div className="px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-600">
                {(() => {
                  const role = useCanvasStore.getState().canvasRole;
                  const roleMap: Record<string, string> = {
                    OWNER: '👑 所有者 - 完全控制',
                    EDITOR: '✏️ 编辑者 - 可编辑内容',
                    COMMENTER: '💬 评论者 - 仅查看和评论',
                    VIEWER: '👁️ 查看者 - 仅查看',
                    PUBLIC: '🌐 公开 - 仅查看',
                  };
                  return roleMap[role || 'VIEWER'] || '👁️ 查看者';
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="p-3">
            <div className="flex items-center justify-between px-2 py-2 mb-2">
              <span className="text-xs font-semibold text-slate-500">模板库</span>
              <button
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                onClick={loadTemplates}
              >
                刷新
              </button>
            </div>
            {loadingTemplates ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-24 bg-slate-100 rounded-lg mb-2" />
                    <div className="h-4 bg-slate-100 rounded w-3/4 mb-1" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {displayTemplates.slice(0, 12).map(tpl => (
                  <div
                    key={tpl.id}
                    className="border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => canvasId ? applyTemplate(tpl) : createFromTemplate(tpl)}
                  >
                    <div
                      className="h-24 relative overflow-hidden"
                      style={{ background: tpl.data.backgroundColor || '#F8FAFC' }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        {tpl.data.elements?.slice(0, 5).map((el: any, i: number) => (
                          <div
                            key={i}
                            className="absolute"
                            style={{
                              left: `${50 + (el.x || 0) / 15}%`,
                              top: `${50 + (el.y || 0) / 12}%`,
                              width: `${Math.max(12, (el.width || 100) / 15)}px`,
                              height: `${Math.max(8, (el.height || 60) / 12)}px`,
                              background: el.data?.noteColor || el.data?.fillColor || '#E0E7FF',
                              borderRadius: el.type === 'circle' || el.type === 'ellipse' ? '50%' : 2,
                              border: `1px solid ${el.data?.strokeColor || '#C7D2FE'}`,
                            }}
                          />
                        ))}
                      </div>
                      {tpl.isBuiltin && (
                        <span className="absolute top-2 left-2 text-[10px] font-medium bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                          内置
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-indigo-500/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="bg-white/95 text-indigo-600 text-xs font-medium px-3 py-1 rounded-full shadow-sm">
                          {canvasId ? '应用到当前画布' : '使用此模板'}
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-slate-800 truncate">{tpl.name}</h4>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{tpl.description}</p>
                        </div>
                        {tpl.category && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex-shrink-0">
                            {tpl.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="p-3">
            <div className="flex items-center justify-between px-2 py-2 mb-2">
              <span className="text-xs font-semibold text-slate-500">版本历史</span>
              <button
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                onClick={loadVersions}
              >
                刷新
              </button>
            </div>

            {!canvasId ? (
              <div className="text-center text-slate-400 py-12 text-sm">
                请在画布中查看版本
              </div>
            ) : loadingVersions ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse p-3 bg-slate-50 rounded-lg">
                    <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-slate-200 rounded w-2/3 mb-1" />
                    <div className="h-3 bg-slate-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : versions.length === 0 ? (
              <div className="space-y-3">
                <div className="text-center text-slate-400 py-8 text-sm">
                  <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  </svg>
                  暂无历史版本
                </div>
                <button
                  className="w-full btn btn-primary btn-sm"
                  onClick={async () => {
                    if (!canvasId) return;
                    try {
                      await versionApi.create(canvasId, '手动保存的版本');
                      await loadVersions();
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1" strokeLinecap="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8M12 12v6M9 15h6" />
                  </svg>
                  创建当前版本
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  if (!isPlaying) return null;
                  const totalSteps = Math.max(1, versions.length - 1);
                  const step = playbackIndex + 1;
                  const pct = Math.max(5, Math.min(100, Math.round(100 * step / totalSteps))) + '%';
                  return (
                    <div className="mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="6" />
                          </svg>
                          回放中...版本 {step} / {totalSteps}
                        </div>
                        <button
                          onClick={stopPlayback}
                          className="text-xs hover:underline text-amber-900 font-medium"
                        >
                          停止
                        </button>
                      </div>
                      <div className="w-full h-1.5 bg-amber-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-600 rounded-full transition-all"
                          style={{ width: pct }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {!isPlaying && versions.length >= 2 && (
              <div className="mb-3 flex items-center gap-2 text-xs">
                <span className="text-slate-500 whitespace-nowrap">回放速度：</span>
                <div className="flex gap-1 flex-1">
                  {(['slow', 'normal', 'fast'] as PlaybackSpeed[]).map(sp => (
                    <button
                      key={sp}
                      onClick={() => setPlaybackSpeed(sp)}
                      className={`flex-1 py-1 rounded transition-colors ${
                        playbackSpeed === sp
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {sp === 'slow' ? '慢速' : sp === 'normal' ? '正常' : '快速'}
                    </button>
                  ))}
                </div>
              </div>
            )}

                <button
                  className="w-full btn btn-primary btn-sm mb-3"
                  onClick={async () => {
                    if (!canvasId) return;
                    try {
                      await versionApi.create(canvasId, '手动保存的版本');
                      await loadVersions();
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  保存新版本
                </button>
                <div className="relative pl-4">
                  <div className="absolute left-1.5 top-1 bottom-1 w-0.5 bg-slate-200" />
                  {versions.map((v, i) => (
                    <div key={v.id} className="relative mb-3 last:mb-0">
                      <div className={`absolute -left-2.5 top-2 w-3 h-3 rounded-full border-2 border-white ${i === 0 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                      <div className={`border border-slate-200 rounded-lg p-3 hover:shadow-sm hover:border-indigo-200 transition-all ${
                        isPlaying && playbackIndex === i ? 'bg-indigo-50 border-indigo-400' : 'bg-white'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            v{v.versionNumber}
                          </span>
                          <span className="text-xs text-slate-400">{formatDate(v.createdAt)}</span>
                        </div>
                        <div className="text-sm text-slate-700 mb-2 line-clamp-2">
                          {v.summary || '未命名版本'}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">
                            {v.createdByName && <span>👤 {v.createdByName}</span>}
                            {v.branchName !== 'main' && <span className="ml-2">🌿 {v.branchName}</span>}
                          </span>
                          <div className="flex items-center gap-3 text-xs">
                            {i < versions.length - 1 && !isPlaying && (
                              <button
                                className="text-slate-600 hover:text-slate-800 font-medium hover:underline flex items-center gap-0.5"
                                onClick={() => startPlayback(v)}
                                title="从该版本回放到最新"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                                回放
                              </button>
                            )}
                            <button
                              className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                              onClick={() => {
                                if (confirm(`确定恢复到版本 v${v.versionNumber}？此操作会覆盖当前内容。`)) {
                                  restoreVersion(v);
                                }
                              }}
                            >
                              恢复
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftPanel;
