import type {
  PluginManifest,
  PluginStatus,
  PluginRuntimeInfo,
  PluginInstallation,
  PluginPermission,
  CanvasEventType,
  BuiltinPluginInfo,
} from '@/types/plugin';
import { VALID_PERMISSIONS } from '@/types/plugin';
import { PluginBridge } from './bridge';
import { buildWorkerCode } from './workerTemplate';
import { securityLogger } from './securityLogger';
import { pluginEventBus } from './eventBus';
import { pluginApi, type PluginInstallRequest } from '@/api/client';
import { uid } from '@/utils';

export const BUILTIN_PLUGINS: BuiltinPluginInfo[] = [
  {
    name: 'auto-ruler',
    version: '1.0.0',
    author: 'Collab Board Team',
    description: '自动显示选中元素之间的水平/垂直距离标注线',
    icon: '📏',
    permissions: ['canvas:read', 'canvas:write'],
    entry: '/plugins/auto-ruler/index.js',
    category: '工具',
  },
  {
    name: 'pomodoro',
    version: '1.0.0',
    author: 'Collab Board Team',
    description: '在画布右上角显示25分钟倒计时器，计时结束发送通知',
    icon: '🍅',
    permissions: ['notification:send', 'canvas:read'],
    entry: '/plugins/pomodoro/index.js',
    category: '效率',
  },
  {
    name: 'word-cloud',
    version: '1.0.0',
    author: 'Collab Board Team',
    description: '读取画布所有文本元素，生成词云并创建新画布元素',
    icon: '☁️',
    permissions: ['canvas:read', 'canvas:write'],
    entry: '/plugins/word-cloud/index.js',
    category: '分析',
  },
];

class PluginManager {
  private plugins: Map<string, PluginRuntimeInfo> = new Map();
  private bridges: Map<string, PluginBridge> = new Map();
  private canvasId: string | null = null;
  private listeners: Set<() => void> = new Set();
  private installedPlugins: PluginInstallation[] = [];
  private cachedRunningNames: string[] = [];
  private runningNamesDirty = true;

  setCanvasId(canvasId: string | null): void {
    this.canvasId = canvasId;
  }

  getInstalledPlugins(): PluginInstallation[] {
    return this.installedPlugins;
  }

  getRuntimePlugins(): PluginRuntimeInfo[] {
    return [...this.plugins.values()];
  }

  getRunningPluginNames(): string[] {
    if (this.runningNamesDirty) {
      const names: string[] = [];
      this.plugins.forEach(p => {
        if (p.status === 'running') names.push(p.name);
      });
      names.sort();
      this.cachedRunningNames = names;
      this.runningNamesDirty = false;
    }
    return this.cachedRunningNames;
  }

  getPlugin(name: string): PluginRuntimeInfo | undefined {
    return this.plugins.get(name);
  }

  getBuiltinPlugins(): BuiltinPluginInfo[] {
    return [...BUILTIN_PLUGINS];
  }

  isPluginInstalled(name: string): boolean {
    return this.installedPlugins.some(p => p.pluginName === name);
  }

  isPluginEnabled(name: string): boolean {
    return this.plugins.get(name)?.status === 'running' || this.plugins.get(name)?.status === 'enabled';
  }

  isPluginRunning(name: string): boolean {
    return this.plugins.get(name)?.status === 'running';
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    this.runningNamesDirty = true;
    this.listeners.forEach(cb => {
      try { cb(); } catch (e) { console.error('[PluginManager] Listener error:', e); }
    });
  }

  validateManifest(manifest: any): PluginManifest {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Manifest must be an object');
    }

    if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
      throw new Error('Manifest name is required');
    }
    if (!/^[a-z0-9-]+$/.test(manifest.name)) {
      throw new Error('Manifest name must contain only lowercase letters, numbers, and hyphens');
    }

    if (typeof manifest.version !== 'string' || !manifest.version) {
      throw new Error('Manifest version is required');
    }

    if (!Array.isArray(manifest.permissions)) {
      throw new Error('Manifest permissions must be an array');
    }

    for (const perm of manifest.permissions) {
      if (!VALID_PERMISSIONS.includes(perm as PluginPermission)) {
        throw new Error(`Invalid permission: ${perm}`);
      }
    }

    if (typeof manifest.entry !== 'string' || !manifest.entry) {
      throw new Error('Manifest entry is required');
    }

    return manifest as PluginManifest;
  }

  async loadInstalledPluginsFromServer(): Promise<void> {
    if (!this.canvasId) return;

    try {
      const plugins = await pluginApi.list(this.canvasId);
      this.installedPlugins = plugins;

      for (const p of plugins) {
        if (p.enabled) {
          try {
            await this.loadAndRunPlugin(p.pluginName);
          } catch (e: any) {
            securityLogger.loadError(p.pluginName, e.message);
          }
        }
      }
      this.notify();
    } catch (e: any) {
      console.error('[PluginManager] Failed to load installed plugins:', e);
    }
  }

  async installPlugin(name: string): Promise<PluginInstallation> {
    if (!this.canvasId) {
      throw new Error('Canvas not loaded');
    }

    const builtin = BUILTIN_PLUGINS.find(p => p.name === name);
    if (!builtin) {
      throw new Error(`Plugin not found: ${name}`);
    }

    const manifest = this.validateManifest(builtin);

    const req: PluginInstallRequest = {
      pluginName: manifest.name,
      pluginVersion: manifest.version,
      permissions: manifest.permissions,
    };

    const installed = await pluginApi.install(this.canvasId, req);
    this.installedPlugins = [...this.installedPlugins, installed];

    try {
      await this.loadAndRunPlugin(name);
    } catch (e: any) {
      securityLogger.loadError(name, e.message);
    }

    this.notify();
    return installed;
  }

  async uninstallPlugin(name: string): Promise<void> {
    if (!this.canvasId) throw new Error('Canvas not loaded');

    this.stopPlugin(name);

    await pluginApi.uninstall(this.canvasId, name);
    this.installedPlugins = this.installedPlugins.filter(p => p.pluginName !== name);

    this.notify();
  }

  async togglePlugin(name: string): Promise<void> {
    if (!this.canvasId) throw new Error('Canvas not loaded');

    const installed = this.installedPlugins.find(p => p.pluginName === name);
    if (!installed) throw new Error(`Plugin not installed: ${name}`);

    await pluginApi.toggle(this.canvasId, name);

    if (installed.enabled) {
      this.stopPlugin(name);
    } else {
      try {
        await this.loadAndRunPlugin(name);
      } catch (e: any) {
        securityLogger.loadError(name, e.message);
        throw e;
      }
    }

    const idx = this.installedPlugins.findIndex(p => p.pluginName === name);
    if (idx >= 0) {
      const newPlugins = [...this.installedPlugins];
      newPlugins[idx] = { ...newPlugins[idx], enabled: !newPlugins[idx].enabled };
      this.installedPlugins = newPlugins;
    }

    this.notify();
  }

  private async loadAndRunPlugin(name: string): Promise<void> {
    if (this.plugins.has(name)) {
      const existing = this.plugins.get(name)!;
      if (existing.status === 'running') return;
    }

    const builtin = BUILTIN_PLUGINS.find(p => p.name === name);
    if (!builtin) {
      throw new Error(`Plugin definition not found: ${name}`);
    }

    const manifest = this.validateManifest(builtin);

    let entryCode: string;
    try {
      const resp = await fetch(manifest.entry, { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      entryCode = await resp.text();
    } catch (e: any) {
      throw new Error(`Failed to load entry script: ${e.message}`);
    }

    this.stopPlugin(name);

    let worker: Worker;
    let workerUrl: string;
    try {
      const hostOrigin = window.location.origin;
      const entryUrl = new URL(manifest.entry, window.location.href);
      const pluginBaseUrl = entryUrl.href.substring(0, entryUrl.href.lastIndexOf('/') + 1);
      const workerCode = buildWorkerCode(entryCode, JSON.stringify(manifest), hostOrigin, pluginBaseUrl);
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
    } catch (e: any) {
      throw new Error(`Failed to create Worker: ${e.message}`);
    }

    let isLoaded = false;
    const revokeWhenReady = () => {
      if (!isLoaded) {
        isLoaded = true;
        setTimeout(() => {
          try { URL.revokeObjectURL(workerUrl); } catch (e) {}
        }, 100);
      }
    };

    worker.onmessage = (e) => {
      revokeWhenReady();
      if (e.data?.type === '__security_violation__') {
        securityLogger.unsafeApi(name, e.data.api);
      }
    };

    worker.onerror = (e) => {
      revokeWhenReady();
      console.error(`[PluginManager] Worker error for '${name}':`, e);
      securityLogger.loadError(name, e.message || 'Worker error');
    };

    const bridge = new PluginBridge(manifest, worker, () => {
      this.bridges.delete(name);
    });

    this.bridges.set(name, bridge);

    const runtimeInfo: PluginRuntimeInfo = {
      name,
      manifest,
      status: 'running',
      installation: this.installedPlugins.find(p => p.pluginName === name),
      worker,
      startTime: Date.now(),
    };

    this.plugins.set(name, runtimeInfo);
  }

  private stopPlugin(name: string): void {
    const bridge = this.bridges.get(name);
    if (bridge) {
      bridge.destroy();
    }
    this.bridges.delete(name);
    pluginEventBus.unsubscribeAll(name);

    const runtime = this.plugins.get(name);
    if (runtime) {
      if (runtime.worker) {
        try { runtime.worker.terminate(); } catch (e) { /* ignore */ }
      }
      this.plugins.set(name, {
        ...runtime,
        status: 'disabled',
        worker: undefined,
        startTime: undefined,
      });
    }
  }

  broadcastEvent(event: CanvasEventType, payload: any): void {
    pluginEventBus.broadcast(event, payload);

    for (const [name, bridge] of this.bridges) {
      const subs = pluginEventBus.getPluginSubscriptions(name);
      if (subs.includes(event) || event === 'element:created' || event === 'element:updated' || event === 'element:deleted') {
        try {
          bridge.sendEvent(event, payload);
        } catch (e) {
          console.error(`[PluginManager] Failed to broadcast to plugin '${name}':`, e);
        }
      }
    }
  }

  destroyAll(): void {
    for (const name of [...this.plugins.keys()]) {
      this.stopPlugin(name);
    }
    this.plugins.clear();
    this.bridges.clear();
    this.installedPlugins = [];
    this.canvasId = null;
    this.notify();
  }
}

export const pluginManager = new PluginManager();
