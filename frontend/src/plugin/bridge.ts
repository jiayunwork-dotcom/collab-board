import type {
  PluginManifest,
  BridgeRequest,
  BridgeResponse,
  BridgeMethod,
  PluginPermission,
  CanvasEventType,
} from '@/types/plugin';
import { PERMISSION_MAP } from '@/types/plugin';
import { securityLogger } from './securityLogger';
import { pluginStorage } from './PluginStorage';
import { pluginEventBus } from './eventBus';
import { useCanvasStore } from '@/store/canvasStore';
import { uid } from '@/utils';
import type { CanvasElement, ElementType } from '@/types';
import { elementApi } from '@/api/client';

const CREATE_ELEMENT_RATE_LIMIT = 5;

interface RateLimitTracker {
  timestamps: number[];
}

export class PluginBridge {
  private manifest: PluginManifest;
  private pluginName: string;
  private worker: Worker;
  private pendingRequests: Map<string, { resolve: (r: any) => void; reject: (e: Error) => void }> = new Map();
  private rateLimitTrackers: Map<string, RateLimitTracker> = new Map();
  private destroyCallback?: () => void;

  constructor(manifest: PluginManifest, worker: Worker, onDestroy?: () => void) {
    this.manifest = manifest;
    this.pluginName = manifest.name;
    this.worker = worker;
    this.destroyCallback = onDestroy;

    this.worker.onmessage = (e: MessageEvent) => this.handleMessage(e.data);
    this.worker.onerror = (e) => {
      console.error(`[PluginBridge] Worker error for '${this.pluginName}':`, e);
      securityLogger.loadError(this.pluginName, e.message);
    };
  }

  sendEvent(event: CanvasEventType, payload: any): void {
    try {
      this.worker.postMessage({
        type: 'event',
        event,
        payload,
      });
    } catch (e) {
      console.error(`[PluginBridge] Failed to send event to '${this.pluginName}':`, e);
    }
  }

  destroy(): void {
    try {
      pluginEventBus.unsubscribeAll(this.pluginName);
      this.worker.terminate();
      this.pendingRequests.clear();
      this.rateLimitTrackers.clear();
      if (this.destroyCallback) {
        this.destroyCallback();
      }
    } catch (e) {
      console.error(`[PluginBridge] Error destroying '${this.pluginName}':`, e);
    }
  }

  private async handleMessage(data: any): Promise<void> {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'bridge:request') {
      await this.handleBridgeRequest(data as BridgeRequest);
    }
  }

  private async handleBridgeRequest(req: BridgeRequest): Promise<void> {
    const { id, method, params = [] } = req;

    const sendResponse = (response: Partial<BridgeResponse>) => {
      this.worker.postMessage({
        type: 'bridge:response',
        id,
        success: response.success ?? true,
        result: response.result,
        error: response.error,
        errorCode: response.errorCode,
      });
    };

    const requiredPermission = PERMISSION_MAP[method];
    if (requiredPermission !== null) {
      if (!this.checkPermission(requiredPermission)) {
        securityLogger.permissionDenied(this.pluginName, method, requiredPermission);
        sendResponse({
          success: false,
          error: `Permission denied: requires '${requiredPermission}'`,
          errorCode: 'permission_denied',
        });
        return;
      }
    }

    if (method === 'canvas.createElement') {
      if (!this.checkRateLimit('canvas.createElement', CREATE_ELEMENT_RATE_LIMIT)) {
        securityLogger.rateLimited(this.pluginName, method);
        sendResponse({
          success: false,
          error: 'Rate limit exceeded: max 5 elements per second',
          errorCode: 'rate_limited',
        });
        return;
      }
    }

    try {
      const result = await this.executeMethod(method, params);
      sendResponse({ success: true, result });
    } catch (e: any) {
      sendResponse({
        success: false,
        error: e?.message || 'Unknown error',
        errorCode: e?.code || 'execution_error',
      });
    }
  }

  private checkPermission(permission: PluginPermission): boolean {
    return this.manifest.permissions.includes(permission);
  }

  private checkRateLimit(key: string, maxPerSecond: number): boolean {
    let tracker = this.rateLimitTrackers.get(key);
    if (!tracker) {
      tracker = { timestamps: [] };
      this.rateLimitTrackers.set(key, tracker);
    }

    const now = Date.now();
    tracker.timestamps = tracker.timestamps.filter(t => now - t < 1000);

    if (tracker.timestamps.length >= maxPerSecond) {
      return false;
    }

    tracker.timestamps.push(now);
    return true;
  }

  private async executeMethod(method: BridgeMethod, params: any[]): Promise<any> {
    const store = useCanvasStore.getState();
    const canvasId = store.currentCanvas?.canvas.id;

    switch (method) {
      case 'canvas.getElements': {
        const filter = params[0];
        let elements = [...store.elements.values()];
        if (filter && typeof filter === 'object') {
          if (filter.type) {
            elements = elements.filter(e => e.type === filter.type);
          }
          if (filter.ids && Array.isArray(filter.ids)) {
            const idSet = new Set(filter.ids);
            elements = elements.filter(e => idSet.has(e.id));
          }
        }
        return elements.map(e => this.sanitizeElement(e));
      }

      case 'canvas.createElement': {
        const [type, props] = params;
        if (!type) throw new Error('Element type is required');

        const baseProps = props || {};
        const maxZ = this.getMaxZIndex();
        const element: Partial<CanvasElement> = {
          id: uid(),
          type: type as ElementType,
          x: baseProps.x ?? 0,
          y: baseProps.y ?? 0,
          width: baseProps.width ?? 100,
          height: baseProps.height ?? 100,
          rotation: baseProps.rotation ?? 0,
          zIndex: maxZ,
          opacity: baseProps.opacity ?? 1,
          locked: baseProps.locked ?? false,
          visible: baseProps.visible ?? true,
          data: baseProps.data || {},
        };

        store.addElement(element as CanvasElement);

        if (canvasId) {
          try {
            await elementApi.create(canvasId, element);
          } catch (e) {
            console.warn('[PluginBridge] Failed to persist element:', e);
          }
        }

        return this.sanitizeElement(element as CanvasElement);
      }

      case 'canvas.updateElement': {
        const [id, props] = params;
        if (!id) throw new Error('Element id is required');
        if (!store.elements.has(id)) {
          throw new Error(`Element not found: ${id}`);
        }

        store.updateElement(id, props);

        if (canvasId) {
          try {
            await elementApi.update(canvasId, id, props);
          } catch (e) {
            console.warn('[PluginBridge] Failed to persist element update:', e);
          }
        }

        const updated = store.elements.get(id);
        return updated ? this.sanitizeElement(updated) : null;
      }

      case 'canvas.onElementChange': {
        const callbackId = params[0];
        pluginEventBus.subscribe(this.pluginName, 'element:created', (payload) => {
          this.worker.postMessage({
            type: 'plugin:callback',
            callbackId,
            payload: { type: 'created', element: payload },
          });
        });
        pluginEventBus.subscribe(this.pluginName, 'element:updated', (payload) => {
          this.worker.postMessage({
            type: 'plugin:callback',
            callbackId,
            payload: { type: 'updated', element: payload },
          });
        });
        pluginEventBus.subscribe(this.pluginName, 'element:deleted', (payload) => {
          this.worker.postMessage({
            type: 'plugin:callback',
            callbackId,
            payload: { type: 'deleted', id: payload },
          });
        });
        return true;
      }

      case 'canvas.getViewport': {
        return { ...store.viewport };
      }

      case 'user.getCurrentUser': {
        return store.currentUser ? { ...store.currentUser } : null;
      }

      case 'user.getOnlineUsers': {
        return [...store.onlineUsers.values()].map(u => ({ ...u }));
      }

      case 'notification.show': {
        const [title, body] = params;
        if (typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            new Notification(title || 'Collab Board', { body: body || '' });
          } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              new Notification(title || 'Collab Board', { body: body || '' });
            }
          }
        }
        return true;
      }

      case 'storage.get': {
        const [key] = params;
        if (typeof key !== 'string') throw new Error('Key must be a string');
        return await pluginStorage.get(this.pluginName, key);
      }

      case 'storage.set': {
        const [key, value] = params;
        if (typeof key !== 'string') throw new Error('Key must be a string');
        await pluginStorage.set(this.pluginName, key, value);
        return true;
      }

      case 'plugin.getManifest': {
        return { ...this.manifest };
      }

      case 'event.subscribe': {
        const [event] = params;
        pluginEventBus.subscribe(this.pluginName, event as CanvasEventType, (payload) => {
          this.worker.postMessage({
            type: 'event',
            event,
            payload,
          });
        });
        return true;
      }

      case 'event.unsubscribe': {
        const [event] = params;
        return pluginEventBus.unsubscribe(this.pluginName, event as CanvasEventType);
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private sanitizeElement(el: CanvasElement): any {
    return {
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
      zIndex: el.zIndex,
      opacity: el.opacity,
      locked: el.locked,
      visible: el.visible,
      data: el.data ? { ...el.data } : {},
      groupId: el.groupId,
      createdAt: el.createdAt,
      lastModifiedAt: el.lastModifiedAt,
    };
  }

  private getMaxZIndex(): number {
    const store = useCanvasStore.getState();
    let max = 0;
    store.elements.forEach(el => {
      if (el.zIndex > max) max = el.zIndex;
    });
    return max + 1;
  }
}
