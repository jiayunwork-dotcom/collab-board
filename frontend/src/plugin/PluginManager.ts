import type {
  PluginManifest,
  PluginStatus,
  PluginRuntimeInfo,
  PluginInstallation,
  PluginPermission,
  CanvasEventType,
  BuiltinPluginInfo,
  PluginConfigField,
} from '@/types/plugin';
import { VALID_PERMISSIONS } from '@/types/plugin';
import { PluginBridge } from './bridge';
import { buildWorkerCode } from './workerTemplate';
import { securityLogger } from './securityLogger';
import { pluginEventBus } from './eventBus';
import { channelManager } from './channelManager';
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
    channels: ['ruler-sync'],
    config: [
      { key: 'unit', label: '单位', type: 'select', default: 'px', options: ['px', 'rem', 'em'] },
      { key: 'color', label: '标注颜色', type: 'string', default: '#FF6B6B' },
    ],
    dependencies: [],
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
    channels: ['timer-notify'],
    config: [
      { key: 'duration', label: '时长(分钟)', type: 'number', default: 25 },
      { key: 'autoRestart', label: '自动重启', type: 'boolean', default: false },
    ],
    dependencies: [],
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
    config: [
      { key: 'maxWords', label: '最大词数', type: 'number', default: 50 },
    ],
    dependencies: ['auto-ruler'],
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
  private pluginConfigs: Map<string, Record<string, any>> = new Map();

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

  getPluginConfig(pluginName: string): Record<string, any> {
    return this.pluginConfigs.get(pluginName) || {};
  }

  async loadPluginConfig(pluginName: string): Promise<Record<string, any>> {
    if (!this.canvasId) return {};
    try {
      const configs = await pluginApi.getConfig(this.canvasId, pluginName);
      const configMap: Record<string, any> = {};
      for (const c of configs) {
        configMap[c.configKey] = c.configValue;
      }
      this.pluginConfigs.set(pluginName, configMap);
      return configMap;
    } catch (e) {
      console.warn('[PluginManager] Failed to load config for', pluginName, e);
      return {};
    }
  }

  async savePluginConfig(pluginName: string, configs: Record<string, any>): Promise<void> {
    if (!this.canvasId) return;
    try {
      const entries = Object.entries(configs).map(([configKey, configValue]) => ({
        configKey,
        configValue,
      }));
      await pluginApi.updateConfig(this.canvasId, pluginName, entries);
      this.pluginConfigs.set(pluginName, { ...configs });
      this.notify();
    } catch (e: any) {
      console.error('[PluginManager] Failed to save config for', pluginName, e);
      throw e;
    }
  }

  getConfigGetter(pluginName: string): (key: string) => any {
    return (key: string) => {
      const configs = this.pluginConfigs.get(pluginName) || {};
      if (key in configs) return configs[key];
      const builtin = BUILTIN_PLUGINS.find(p => p.name === pluginName);
      const field = builtin?.config?.find(f => f.key === key);
      return field ? field.default : null;
    };
  }

  getMissingDependencies(pluginName: string): string[] {
    const builtin = BUILTIN_PLUGINS.find(p => p.name === pluginName);
    if (!builtin?.dependencies || builtin.dependencies.length === 0) return [];
    return builtin.dependencies.filter(dep => !this.isPluginEnabled(dep));
  }

  getDependents(pluginName: string): string[] {
    const dependents: string[] = [];
    for (const builtin of BUILTIN_PLUGINS) {
      if (builtin.dependencies?.includes(pluginName) && this.isPluginEnabled(builtin.name)) {
        dependents.push(builtin.name);
      }
    }
    return dependents;
  }

  detectCircularDependencies(pluginNames: string[]): string[] | null {
    const graph = new Map<string, string[]>();
    for (const name of pluginNames) {
      const builtin = BUILTIN_PLUGINS.find(p => p.name === name);
      graph.set(name, builtin?.dependencies?.filter(d => pluginNames.includes(d)) || []);
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    function dfs(node: string): string[] | null {
      visited.add(node);
      inStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (inStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          return path.slice(cycleStart);
        }
        if (!visited.has(neighbor)) {
          const result = dfs(neighbor);
          if (result) return result;
        }
      }

      path.pop();
      inStack.delete(node);
      return null;
    }

    for (const name of pluginNames) {
      if (!visited.has(name)) {
        const cycle = dfs(name);
        if (cycle) return cycle;
      }
    }

    return null;
  }

  topologicalSort(pluginNames: string[]): string[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const name of pluginNames) {
      graph.set(name, []);
      inDegree.set(name, 0);
    }

    for (const name of pluginNames) {
      const builtin = BUILTIN_PLUGINS.find(p => p.name === name);
      const deps = builtin?.dependencies?.filter(d => pluginNames.includes(d)) || [];
      for (const dep of deps) {
        graph.get(dep)!.push(name);
        inDegree.set(name, (inDegree.get(name) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      for (const neighbor of graph.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return result;
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

    if (manifest.channels !== undefined) {
      if (!Array.isArray(manifest.channels)) {
        throw new Error('Manifest channels must be an array');
      }
      for (const ch of manifest.channels) {
        if (typeof ch !== 'string' || !/^[a-zA-Z0-9-]{1,32}$/.test(ch)) {
          throw new Error(`Invalid channel name: ${ch}`);
        }
      }
    }

    if (manifest.config !== undefined) {
      if (!Array.isArray(manifest.config)) {
        throw new Error('Manifest config must be an array');
      }
      const validTypes = ['string', 'number', 'boolean', 'select'];
      for (const field of manifest.config) {
        if (!field.key || typeof field.key !== 'string') {
          throw new Error('Config field key is required');
        }
        if (!field.label || typeof field.label !== 'string') {
          throw new Error('Config field label is required');
        }
        if (!validTypes.includes(field.type)) {
          throw new Error(`Invalid config type: ${field.type}`);
        }
        if (field.type === 'select' && (!Array.isArray(field.options) || field.options.length === 0)) {
          throw new Error(`Config field '${field.key}' of type 'select' must have options array`);
        }
      }
    }

    if (manifest.dependencies !== undefined) {
      if (!Array.isArray(manifest.dependencies)) {
        throw new Error('Manifest dependencies must be an array');
      }
      for (const dep of manifest.dependencies) {
        if (typeof dep !== 'string' || !dep) {
          throw new Error('Dependency name must be a non-empty string');
        }
      }
    }

    return manifest as PluginManifest;
  }

  async loadInstalledPluginsFromServer(): Promise<void> {
    if (!this.canvasId) return;

    try {
      const plugins = await pluginApi.list(this.canvasId);
      this.installedPlugins = plugins;

      const enabledPlugins = plugins.filter(p => p.enabled);
      const enabledNames = enabledPlugins.map(p => p.pluginName);

      const cycle = this.detectCircularDependencies(enabledNames);
      if (cycle) {
        securityLogger.circularDependency(cycle[0], cycle);
        console.error('[PluginManager] Circular dependency detected:', cycle.join(' → '));
        this.notify();
        return;
      }

      const sortedNames = this.topologicalSort(enabledNames);

      for (const name of sortedNames) {
        try {
          await this.loadPluginConfig(name);
          await this.loadAndRunPlugin(name);
        } catch (e: any) {
          securityLogger.loadError(name, e.message);
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

    const dependents = this.getDependents(name);
    if (dependents.length > 0) {
      throw new Error(`以下插件依赖此插件: ${dependents.join(', ')}。请先禁用或卸载这些插件。`);
    }

    this.stopPlugin(name);
    channelManager.unsubscribeAll(name);

    await pluginApi.uninstall(this.canvasId, name);
    this.installedPlugins = this.installedPlugins.filter(p => p.pluginName !== name);
    this.pluginConfigs.delete(name);

    this.notify();
  }

  async togglePlugin(name: string): Promise<void> {
    if (!this.canvasId) throw new Error('Canvas not loaded');

    const installed = this.installedPlugins.find(p => p.pluginName === name);
    if (!installed) throw new Error(`Plugin not installed: ${name}`);

    if (!installed.enabled) {
      const missing = this.getMissingDependencies(name);
      if (missing.length > 0) {
        throw new Error(`缺少依赖插件: ${missing.join(', ')}。请先启用这些插件。`);
      }
    }

    await pluginApi.toggle(this.canvasId, name);

    if (installed.enabled) {
      const dependents = this.getDependents(name);
      if (dependents.length > 0) {
        throw new Error(`以下插件依赖此插件: ${dependents.join(', ')}。请先禁用这些插件。`);
      }
      this.stopPlugin(name);
      channelManager.unsubscribeAll(name);
    } else {
      try {
        await this.loadPluginConfig(name);
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
    }, this.getConfigGetter(name));

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
    channelManager.unsubscribeAll(name);

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
