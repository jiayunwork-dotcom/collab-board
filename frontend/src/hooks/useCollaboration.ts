import { useEffect, useRef, useCallback, useState } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { CollabMessage, OnlineUser, Role, UUID } from '@/types';
import { collabClient } from '@/collaboration/CollabClient';
import { canvasApi, authApi } from '@/api/client';
import { throttle } from '@/utils';

export interface CollaborationState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  lastSavedAt: number | null;
  pendingOpsCount: number;
}

export function useCollaboration(canvasId: UUID | null | undefined) {
  const store = useCanvasStore;
  const currentUser = store(s => s.currentUser);
  const pendingOps = store(s => s.pendingOps);

  const [state, setState] = useState<CollaborationState>({
    connected: false,
    connecting: false,
    error: null,
    connectionQuality: 'offline',
    lastSavedAt: null,
    pendingOpsCount: 0,
  });

  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const qualityCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const lastAckTimes = useRef<number[]>([]);
  const reconnectCount = useRef(0);

  const setConnectionQuality = useCallback((quality: CollaborationState['connectionQuality']) => {
    setState(prev => prev.connectionQuality === quality ? prev : { ...prev, connectionQuality: quality });
  }, []);

  const connect = useCallback(async () => {
    if (!canvasId) return;

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      const user = currentUser || authApi.getCurrentUser();
      if (user && !store.getState().currentUser) {
        store.getState().setCurrentUser(user);
      }

      const token = localStorage.getItem('collab_token');
      await collabClient.connect(canvasId, token);

      collabClient.setHandlers({
        onAck: (opId, success, _result, error) => {
          const now = Date.now();
          lastAckTimes.current.push(now);
          if (lastAckTimes.current.length > 20) lastAckTimes.current.shift();

          if (!success && error) {
            console.warn(`[Collab] Op ${opId} failed:`, error);
          }
        },
        onPresence: (type, user, all) => {
          const onlineUsers = store.getState().onlineUsers;
          if (type === 'JOIN') {
            if (all && all.length > 0) {
              store.getState().setOnlineUsers(all);
            } else if (user) {
              store.getState().addOnlineUser(user);
            }
          } else if (type === 'LEAVE' && user) {
            store.getState().removeOnlineUser(user.userId);
          }
        },
        onRemoteOp: (msg) => {
          console.debug('[Collab] Remote op:', msg.type);
        },
      });

      reconnectCount.current = 0;
      setState(prev => ({
        ...prev,
        connected: true,
        connecting: false,
        error: null,
        connectionQuality: 'excellent',
      }));
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        connecting: false,
        error: err?.message || '连接协作服务失败',
        connectionQuality: 'offline',
      }));
      console.error('[Collab] Connect error:', err);
    }
  }, [canvasId, currentUser, store]);

  const disconnect = useCallback(() => {
    collabClient.disconnect();
    setState(prev => ({
      ...prev,
      connected: false,
      connectionQuality: 'offline',
    }));
  }, []);

  const sendElementCreate = useCallback((element: any) => {
    const opId = collabClient.sendOperation('CREATE_ELEMENT', element);
    return opId;
  }, []);

  const sendElementUpdate = useCallback((id: string, updates: any) => {
    const opId = collabClient.sendOperation('UPDATE_ELEMENT', { id, ...updates });
    return opId;
  }, []);

  const sendElementDelete = useCallback((id: string) => {
    const opId = collabClient.sendOperation('DELETE_ELEMENT', { id });
    return opId;
  }, []);

  const sendBatchDelete = useCallback((ids: string[]) => {
    const opId = collabClient.sendOperation('BATCH_DELETE_ELEMENTS', { ids });
    return opId;
  }, []);

  const sendConnectionCreate = useCallback((connection: any) => {
    const opId = collabClient.sendOperation('CREATE_CONNECTION', connection);
    return opId;
  }, []);

  const sendConnectionUpdate = useCallback((id: string, updates: any) => {
    const opId = collabClient.sendOperation('UPDATE_CONNECTION', { id, ...updates });
    return opId;
  }, []);

  const sendConnectionDelete = useCallback((id: string) => {
    const opId = collabClient.sendOperation('DELETE_CONNECTION', { id });
    return opId;
  }, []);

  const sendCursor = useCallback(throttle((x: number, y: number) => {
    collabClient.sendCursor(x, y);
  }, 32), []);

  const sendSelection = useCallback(throttle((selection: string[]) => {
    collabClient.sendSelection(selection);
  }, 100), []);

  const sendViewport = useCallback(throttle((x: number, y: number, zoom: number) => {
    collabClient.sendViewport(x, y, zoom);
  }, 250), []);

  const triggerAutoSave = useCallback(async () => {
    if (!canvasId) return;
    try {
      collabClient.sendAutoSave();
      if (!collabClient.isConnected()) {
        await canvasApi.autoSave(canvasId);
      }
      setState(prev => ({ ...prev, lastSavedAt: Date.now() }));
    } catch (err) {
      console.warn('[Collab] Auto-save failed:', err);
    }
  }, [canvasId]);

  const updateConnectionQuality = useCallback(() => {
    if (!collabClient.isConnected()) {
      setConnectionQuality('offline');
      return;
    }

    const now = Date.now();
    const recentAcks = lastAckTimes.current.filter(t => now - t < 30000);
    const pendingCount = store.getState().pendingOps.size;

    if (pendingCount > 10) {
      setConnectionQuality('poor');
    } else if (pendingCount > 3 || recentAcks.length < 3) {
      setConnectionQuality('good');
    } else {
      setConnectionQuality('excellent');
    }
  }, [setConnectionQuality, store]);

  const waitForAck = useCallback(async (opId: string, timeoutMs = 5000): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> => {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const pending = store.getState().pendingOps;
        if (!pending.has(opId)) {
          resolve({ success: true });
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve({ success: false, error: '操作确认超时' });
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  }, [store]);

  useEffect(() => {
    setState(prev => ({ ...prev, pendingOpsCount: pendingOps.size }));
  }, [pendingOps]);

  useEffect(() => {
    if (!canvasId) {
      disconnect();
      return;
    }

    connect();

    autoSaveTimer.current = setInterval(() => {
      triggerAutoSave();
    }, 30000);

    qualityCheckTimer.current = setInterval(() => {
      updateConnectionQuality();
    }, 2000);

    heartbeatTimer.current = setInterval(() => {
      if (collabClient.isConnected()) {
        collabClient.sendViewport(
          store.getState().viewport.x,
          store.getState().viewport.y,
          store.getState().viewport.zoom,
        );
      } else {
        reconnectCount.current++;
        if (reconnectCount.current < 5) {
          console.log(`[Collab] Attempting reconnect ${reconnectCount.current}`);
          connect();
        }
      }
    }, 15000);

    return () => {
      disconnect();
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (qualityCheckTimer.current) clearInterval(qualityCheckTimer.current);
    };
  }, [canvasId, connect, disconnect, triggerAutoSave, updateConnectionQuality, store]);

  return {
    ...state,
    connect,
    disconnect,
    reconnect: connect,

    sendElementCreate,
    sendElementUpdate,
    sendElementDelete,
    sendBatchDelete,
    sendConnectionCreate,
    sendConnectionUpdate,
    sendConnectionDelete,

    sendCursor,
    sendSelection,
    sendViewport,

    triggerAutoSave,
    waitForAck,

    client: collabClient,
  };
}

export const canEdit = (role: Role | 'PUBLIC' | null | undefined): boolean => {
  return role === 'OWNER' || role === 'EDITOR';
};

export const canComment = (role: Role | 'PUBLIC' | null | undefined): boolean => {
  return canEdit(role) || role === 'COMMENTER';
};

export const canView = (role: Role | 'PUBLIC' | null | undefined): boolean => {
  return canComment(role) || role === 'VIEWER' || role === 'PUBLIC';
};
