export type PluginPermission =
  | 'canvas:read'
  | 'canvas:write'
  | 'user:info'
  | 'notification:send'
  | 'storage:local';

export const VALID_PERMISSIONS: PluginPermission[] = [
  'canvas:read',
  'canvas:write',
  'user:info',
  'notification:send',
  'storage:local',
];

export interface PluginManifest {
  name: string;
  version: string;
  author?: string;
  description?: string;
  icon?: string;
  permissions: PluginPermission[];
  entry: string;
  category?: string;
}

export type PluginStatus =
  | 'installed'
  | 'enabled'
  | 'running'
  | 'disabled'
  | 'error';

export interface PluginInstallation {
  id: string;
  canvasId: string;
  pluginName: string;
  pluginVersion: string;
  permissions: PluginPermission[];
  enabled: boolean;
  installedBy: string;
  installedByName?: string;
  installedAt: string;
}

export interface PluginRuntimeInfo {
  name: string;
  manifest: PluginManifest;
  status: PluginStatus;
  installation?: PluginInstallation;
  worker?: Worker;
  error?: string;
  startTime?: number;
}

export type CanvasEventType =
  | 'element:created'
  | 'element:updated'
  | 'element:deleted'
  | 'user:joined'
  | 'user:left'
  | 'viewport:changed'
  | 'selection:changed';

export interface SecurityLogEntry {
  id: string;
  timestamp: number;
  pluginName: string;
  type: 'permission_denied' | 'rate_limited' | 'unsafe_api' | 'load_error';
  message: string;
  details?: Record<string, any>;
}

export interface BuiltinPluginInfo {
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string;
  permissions: PluginPermission[];
  entry: string;
  category: string;
}

export interface RateLimitState {
  timestamps: number[];
  maxPerSecond: number;
}

export type BridgeMethod =
  | 'canvas.getElements'
  | 'canvas.createElement'
  | 'canvas.updateElement'
  | 'canvas.onElementChange'
  | 'canvas.getViewport'
  | 'user.getCurrentUser'
  | 'user.getOnlineUsers'
  | 'notification.show'
  | 'storage.get'
  | 'storage.set'
  | 'plugin.getManifest'
  | 'event.subscribe'
  | 'event.unsubscribe';

export const PERMISSION_MAP: Record<BridgeMethod, PluginPermission | null> = {
  'canvas.getElements': 'canvas:read',
  'canvas.createElement': 'canvas:write',
  'canvas.updateElement': 'canvas:write',
  'canvas.onElementChange': 'canvas:read',
  'canvas.getViewport': 'canvas:read',
  'user.getCurrentUser': 'user:info',
  'user.getOnlineUsers': 'user:info',
  'notification.show': 'notification:send',
  'storage.get': 'storage:local',
  'storage.set': 'storage:local',
  'plugin.getManifest': null,
  'event.subscribe': null,
  'event.unsubscribe': null,
};

export interface BridgeRequest {
  id: string;
  method: BridgeMethod;
  params?: any[];
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  errorCode?: string;
}

export interface EventBroadcast {
  type: 'event';
  event: CanvasEventType;
  payload: any;
}
