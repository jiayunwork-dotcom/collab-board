import { create } from 'zustand';
import type {
  User, Canvas, CanvasElement, CanvasConnection, Tool, Viewport,
  OnlineUser, CollabMessage, FullCanvas, Role, Comment, CommentReply,
  CommentWithReplies, Notification
} from '@/types';
import { uid } from '@/utils';

interface CanvasState {
  currentUser: User | null;
  setCurrentUser: (u: User | null) => void;

  currentCanvas: FullCanvas | null;
  canvasRole: Role | 'PUBLIC' | null;
  setCurrentCanvas: (c: FullCanvas | null) => void;
  setCanvasRole: (r: Role | 'PUBLIC' | null) => void;
  updateCanvasMeta: (updates: Partial<Canvas>) => void;

  elements: Map<string, CanvasElement>;
  connections: Map<string, CanvasConnection>;
  setElements: (els: CanvasElement[]) => void;
  setConnections: (conns: CanvasConnection[]) => void;
  addElement: (el: CanvasElement) => void;
  addElements: (els: CanvasElement[]) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
  addConnection: (conn: CanvasConnection) => void;
  updateConnection: (id: string, updates: Partial<CanvasConnection>) => void;
  deleteConnection: (id: string) => void;

  viewport: Viewport;
  setViewport: (v: Partial<Viewport>) => void;

  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string> | string[]) => void;
  toggleSelected: (id: string, additive?: boolean) => void;
  clearSelection: () => void;

  modifyingIds: Set<string>;
  setModifyingIds: (ids: Set<string> | string[]) => void;

  currentTool: Tool;
  setCurrentTool: (t: Tool) => void;

  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  setStrokeColor: (c: string) => void;
  setFillColor: (c: string) => void;
  setStrokeWidth: (w: number) => void;
  setFontSize: (s: number) => void;

  onlineUsers: Map<string, OnlineUser>;
  remoteCursors: Map<string, { x: number; y: number; ts: number }>;
  remoteSelections: Map<string, string[]>;
  setOnlineUsers: (users: OnlineUser[]) => void;
  addOnlineUser: (u: OnlineUser) => void;
  removeOnlineUser: (userId: string) => void;
  setRemoteCursor: (userId: string, x: number, y: number) => void;
  setRemoteSelection: (userId: string, selection: string[]) => void;

  pendingOps: Map<string, CollabMessage>;
  addPendingOp: (opId: string, msg: CollabMessage) => void;
  removePendingOp: (opId: string) => void;
  applyRemoteOp: (msg: CollabMessage) => void;

  previewElement: Partial<CanvasElement> | null;
  previewConnection: {
    fromId: string;
    fromPoint: string;
    toX: number;
    toY: number;
  } | null;
  setPreviewElement: (el: Partial<CanvasElement> | null) => void;
  setPreviewConnection: (p: any) => void;

  historyIndex: number;
  historyStack: Array<{ type: string; snapshot: any }>;

  mindMapMode: boolean;
  setMindMapMode: (m: boolean) => void;
  layoutMode: 'tree' | 'radial' | 'fishbone';
  setLayoutMode: (m: 'tree' | 'radial' | 'fishbone') => void;

  isDragging: boolean;
  isDrawing: boolean;
  setIsDragging: (v: boolean) => void;
  setIsDrawing: (v: boolean) => void;
  dragStart: { x: number; y: number } | null;
  setDragStart: (p: { x: number; y: number } | null) => void;
  selectionBox: { x: number; y: number; w: number; h: number } | null;
  setSelectionBox: (b: any) => void;

  groups: Map<string, string[]>;
  groupElements: (ids: string[]) => string;
  ungroupElements: (groupId: string) => void;

  comments: Map<string, Comment>;
  setComments: (comments: Comment[]) => void;
  addComment: (comment: Comment) => void;
  updateComment: (id: string, updates: Partial<Comment>) => void;
  removeComment: (id: string) => void;
  openCommentId: string | null;
  setOpenCommentId: (id: string | null) => void;
  commentReplies: Map<string, CommentReply[]>;
  setCommentReplies: (commentId: string, replies: CommentReply[]) => void;
  addCommentReply: (commentId: string, reply: CommentReply) => void;

  notifications: Notification[];
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  unreadNotificationCount: number;
  setUnreadNotificationCount: (count: number) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  currentUser: null,
  setCurrentUser: (u) => set({ currentUser: u }),

  currentCanvas: null,
  canvasRole: null,
  setCurrentCanvas: (c) => set({
    currentCanvas: c,
    viewport: c?.viewport ? { ...c.viewport } : { x: 0, y: 0, zoom: 1 },
  }),
  setCanvasRole: (r) => set({ canvasRole: r }),
  updateCanvasMeta: (updates) => set((s) => ({
    currentCanvas: s.currentCanvas ? { ...s.currentCanvas, canvas: { ...s.currentCanvas.canvas, ...updates } } : null,
  })),

  elements: new Map(),
  connections: new Map(),
  setElements: (els) => set({ elements: new Map(els.map(e => [e.id, e])) }),
  setConnections: (conns) => set({ connections: new Map(conns.map(c => [c.id, c])) }),
  addElement: (el) => set((s) => {
    const m = new Map(s.elements);
    m.set(el.id, el);
    return { elements: m };
  }),
  addElements: (els) => set((s) => {
    const m = new Map(s.elements);
    els.forEach(e => m.set(e.id, e));
    return { elements: m };
  }),
  updateElement: (id, updates) => set((s) => {
    const m = new Map(s.elements);
    const existing = m.get(id);
    if (existing) {
      const newData = updates.data ? { ...existing.data, ...updates.data } : existing.data;
      m.set(id, { ...existing, ...updates, data: newData });
    }
    return { elements: m };
  }),
  deleteElement: (id) => set((s) => {
    const m = new Map(s.elements);
    m.delete(id);
    const cm = new Map(s.connections);
    for (const [cid, conn] of cm) {
      if (conn.fromElementId === id || conn.toElementId === id) {
        cm.delete(cid);
      }
    }
    const sel = new Set(s.selectedIds);
    sel.delete(id);
    return { elements: m, connections: cm, selectedIds: sel };
  }),
  addConnection: (conn) => set((s) => {
    const m = new Map(s.connections);
    m.set(conn.id, conn);
    return { connections: m };
  }),
  updateConnection: (id, updates) => set((s) => {
    const m = new Map(s.connections);
    const existing = m.get(id);
    if (existing) {
      m.set(id, { ...existing, ...updates });
    }
    return { connections: m };
  }),
  deleteConnection: (id) => set((s) => {
    const m = new Map(s.connections);
    m.delete(id);
    return { connections: m };
  }),

  viewport: { x: 0, y: 0, zoom: 1 },
  setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),

  selectedIds: new Set(),
  setSelectedIds: (ids) => set({ selectedIds: ids instanceof Set ? new Set(ids) : new Set(ids) }),
  toggleSelected: (id, additive) => set((s) => {
    const sel: Set<string> = additive ? new Set(s.selectedIds) : new Set<string>();
    if (additive && sel.has(id)) {
      sel.delete(id);
    } else {
      sel.add(id);
    }
    return { selectedIds: sel };
  }),
  clearSelection: () => set({ selectedIds: new Set() }),

  modifyingIds: new Set(),
  setModifyingIds: (ids) => set({ modifyingIds: ids instanceof Set ? new Set(ids) : new Set(ids) }),

  currentTool: 'select',
  setCurrentTool: (t) => set({ currentTool: t }),

  strokeColor: '#0F172A',
  fillColor: 'transparent',
  strokeWidth: 2,
  fontSize: 16,
  setStrokeColor: (c) => set({ strokeColor: c }),
  setFillColor: (c) => set({ fillColor: c }),
  setStrokeWidth: (w) => set({ strokeWidth: w }),
  setFontSize: (s) => set({ fontSize: s }),

  onlineUsers: new Map(),
  remoteCursors: new Map(),
  remoteSelections: new Map(),
  setOnlineUsers: (users) => set({
    onlineUsers: new Map(users.map(u => [u.userId, u])),
  }),
  addOnlineUser: (u) => set((s) => {
    const m = new Map(s.onlineUsers);
    m.set(u.userId, u);
    return { onlineUsers: m };
  }),
  removeOnlineUser: (userId) => set((s) => {
    const m = new Map(s.onlineUsers);
    m.delete(userId);
    const cm = new Map(s.remoteCursors);
    cm.delete(userId);
    const sm = new Map(s.remoteSelections);
    sm.delete(userId);
    return { onlineUsers: m, remoteCursors: cm, remoteSelections: sm };
  }),
  setRemoteCursor: (userId, x, y) => set((s) => {
    const m = new Map(s.remoteCursors);
    m.set(userId, { x, y, ts: Date.now() });
    return { remoteCursors: m };
  }),
  setRemoteSelection: (userId, selection) => set((s) => {
    const m = new Map(s.remoteSelections);
    m.set(userId, selection);
    return { remoteSelections: m };
  }),

  pendingOps: new Map(),
  addPendingOp: (opId, msg) => set((s) => {
    const m = new Map(s.pendingOps);
    m.set(opId, msg);
    return { pendingOps: m };
  }),
  removePendingOp: (opId) => set((s) => {
    const m = new Map(s.pendingOps);
    m.delete(opId);
    return { pendingOps: m };
  }),
  applyRemoteOp: (msg) => {
    const { type, payload } = msg;
    const s = get();
    const { addElement, addElements, updateElement, deleteElement, setElements, setConnections,
      addConnection, updateConnection, deleteConnection } = s;
    switch (type) {
      case 'CREATE_ELEMENT':
        if (payload && payload.id) {
          if (!s.elements.has(payload.id)) {
            addElement(payload as CanvasElement);
          } else {
            updateElement(payload.id, payload as Partial<CanvasElement>);
          }
        }
        break;
      case 'BATCH_CREATE_ELEMENTS':
        if (Array.isArray(payload?.elements)) {
          const newEls = (payload.elements as CanvasElement[]).filter(e => !s.elements.has(e.id));
          const updateEls = (payload.elements as CanvasElement[]).filter(e => s.elements.has(e.id));
          if (newEls.length) addElements(newEls);
          updateEls.forEach(e => updateElement(e.id, e));
        }
        break;
      case 'UPDATE_ELEMENT':
        if (payload && payload.id) {
          if (s.modifyingIds.has(payload.id)) {
            console.debug('[CRDT] skipping update for locally-modifying element', payload.id);
          } else {
            updateElement(payload.id, payload as Partial<CanvasElement>);
          }
        }
        break;
      case 'DELETE_ELEMENT':
        if (payload?.id) deleteElement(payload.id);
        break;
      case 'BATCH_DELETE_ELEMENTS':
        if (Array.isArray(payload?.ids)) {
          payload.ids.forEach((id: string) => deleteElement(id));
        }
        break;
      case 'CREATE_CONNECTION':
        if (payload && payload.id) {
          if (!s.connections.has(payload.id)) addConnection(payload as CanvasConnection);
          else updateConnection(payload.id, payload as Partial<CanvasConnection>);
        }
        break;
      case 'UPDATE_CONNECTION':
        if (payload && payload.id) updateConnection(payload.id, payload as Partial<CanvasConnection>);
        break;
      case 'DELETE_CONNECTION':
        if (payload?.id) deleteConnection(payload.id);
        break;
      case 'RESET_CANVAS': {
        const snap = payload?.snapshot;
        if (!snap) break;
        if (Array.isArray(snap.elements)) {
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
        if (Array.isArray(snap.connections)) {
          setConnections(snap.connections);
        }
        break;
      }
    }
  },

  previewElement: null,
  previewConnection: null,
  setPreviewElement: (el) => set({ previewElement: el }),
  setPreviewConnection: (p) => set({ previewConnection: p }),

  historyIndex: -1,
  historyStack: [],

  mindMapMode: false,
  setMindMapMode: (m) => set({ mindMapMode: m }),
  layoutMode: 'tree',
  setLayoutMode: (m) => set({ layoutMode: m }),

  isDragging: false,
  isDrawing: false,
  setIsDragging: (v) => set({ isDragging: v }),
  setIsDrawing: (v) => set({ isDrawing: v }),
  dragStart: null,
  setDragStart: (p) => set({ dragStart: p }),
  selectionBox: null,
  setSelectionBox: (b) => set({ selectionBox: b }),

  groups: new Map(),
  groupElements: (ids) => {
    const groupId = uid();
    set((s) => {
      const m = new Map(s.groups);
      m.set(groupId, ids);
      const em = new Map(s.elements);
      ids.forEach(id => {
        const el = em.get(id);
        if (el) em.set(id, { ...el, groupId });
      });
      return { groups: m, elements: em };
    });
    return groupId;
  },
  ungroupElements: (groupId) => set((s) => {
    const m = new Map(s.groups);
    const ids = m.get(groupId) || [];
    m.delete(groupId);
    const em = new Map(s.elements);
    ids.forEach(id => {
      const el = em.get(id);
      if (el) {
        const { groupId: _, ...rest } = el;
        em.set(id, { ...rest, groupId: undefined } as any);
      }
    });
    return { groups: m, elements: em };
  }),

  comments: new Map(),
  setComments: (comments) => set({ comments: new Map(comments.map(c => [c.id, c])) }),
  addComment: (comment) => set((s) => {
    const m = new Map(s.comments);
    m.set(comment.id, comment);
    return { comments: m };
  }),
  updateComment: (id, updates) => set((s) => {
    const m = new Map(s.comments);
    const existing = m.get(id);
    if (existing) {
      m.set(id, { ...existing, ...updates });
    }
    return { comments: m };
  }),
  removeComment: (id) => set((s) => {
    const m = new Map(s.comments);
    m.delete(id);
    const rm = new Map(s.commentReplies);
    rm.delete(id);
    return { comments: m, commentReplies: rm };
  }),
  openCommentId: null,
  setOpenCommentId: (id) => set({ openCommentId: id }),
  commentReplies: new Map(),
  setCommentReplies: (commentId, replies) => set((s) => {
    const m = new Map(s.commentReplies);
    m.set(commentId, replies);
    return { commentReplies: m };
  }),
  addCommentReply: (commentId, reply) => set((s) => {
    const m = new Map(s.commentReplies);
    const existing = m.get(commentId) || [];
    m.set(commentId, [...existing, reply]);
    const cm = new Map(s.comments);
    const comment = cm.get(commentId);
    if (comment) {
      cm.set(commentId, { ...comment, replyCount: (comment.replyCount || 0) + 1 });
    }
    return { commentReplies: m, comments: cm };
  }),

  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) => set((s) => {
    const exists = s.notifications.find(n => n.id === notification.id);
    if (exists) return {};
    const updated = [notification, ...s.notifications];
    const unreadCount = updated.filter(n => !n.isRead).length;
    return { notifications: updated, unreadNotificationCount: unreadCount };
  }),
  markNotificationRead: (id) => set((s) => {
    const updated = s.notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
    const unreadCount = updated.filter(n => !n.isRead).length;
    return { notifications: updated, unreadNotificationCount: unreadCount };
  }),
  unreadNotificationCount: 0,
  setUnreadNotificationCount: (count) => set({ unreadNotificationCount: count }),
  notificationsOpen: false,
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),
}));
