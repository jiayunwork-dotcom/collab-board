import type { CanvasEventType } from '@/types/plugin';

type EventCallback = (payload: any) => void;

const MAX_SUBSCRIPTIONS_PER_PLUGIN = 10;

class PluginEventBus {
  private globalListeners: Map<CanvasEventType, Set<string>> = new Map();
  private pluginListeners: Map<string, Map<CanvasEventType, EventCallback>> = new Map();
  private pluginSubCount: Map<string, number> = new Map();

  subscribe(
    pluginName: string,
    event: CanvasEventType,
    callback: EventCallback
  ): boolean {
    let count = this.pluginSubCount.get(pluginName) || 0;

    let pluginMap = this.pluginListeners.get(pluginName);
    if (!pluginMap) {
      pluginMap = new Map();
      this.pluginListeners.set(pluginName, pluginMap);
    }

    if (!pluginMap.has(event)) {
      if (count >= MAX_SUBSCRIPTIONS_PER_PLUGIN) {
        this.evictOldest(pluginName);
        count = this.pluginSubCount.get(pluginName) || 0;
      }
      count++;
      this.pluginSubCount.set(pluginName, count);
    }

    pluginMap.set(event, callback);

    let globalSet = this.globalListeners.get(event);
    if (!globalSet) {
      globalSet = new Set();
      this.globalListeners.set(event, globalSet);
    }
    globalSet.add(pluginName);

    return true;
  }

  unsubscribe(pluginName: string, event: CanvasEventType): boolean {
    const pluginMap = this.pluginListeners.get(pluginName);
    if (!pluginMap) return false;

    if (pluginMap.delete(event)) {
      const count = this.pluginSubCount.get(pluginName) || 0;
      this.pluginSubCount.set(pluginName, Math.max(0, count - 1));
    }

    const globalSet = this.globalListeners.get(event);
    if (globalSet) {
      globalSet.delete(pluginName);
      if (globalSet.size === 0) {
        this.globalListeners.delete(event);
      }
    }

    return true;
  }

  unsubscribeAll(pluginName: string): void {
    const pluginMap = this.pluginListeners.get(pluginName);
    if (!pluginMap) return;

    for (const event of pluginMap.keys()) {
      const globalSet = this.globalListeners.get(event);
      if (globalSet) {
        globalSet.delete(pluginName);
        if (globalSet.size === 0) {
          this.globalListeners.delete(event);
        }
      }
    }

    this.pluginListeners.delete(pluginName);
    this.pluginSubCount.delete(pluginName);
  }

  broadcast(event: CanvasEventType, payload: any): void {
    const pluginNames = this.globalListeners.get(event);
    if (!pluginNames || pluginNames.size === 0) return;

    for (const pluginName of pluginNames) {
      const pluginMap = this.pluginListeners.get(pluginName);
      const callback = pluginMap?.get(event);
      if (callback) {
        try {
          callback(payload);
        } catch (e) {
          console.error(`[EventBus] Error in plugin '${pluginName}' callback for event '${event}':`, e);
        }
      }
    }
  }

  getPluginSubscriptions(pluginName: string): CanvasEventType[] {
    const pluginMap = this.pluginListeners.get(pluginName);
    return pluginMap ? [...pluginMap.keys()] : [];
  }

  private evictOldest(pluginName: string): void {
    const pluginMap = this.pluginListeners.get(pluginName);
    if (!pluginMap || pluginMap.size === 0) return;

    const oldestEvent = pluginMap.keys().next().value;
    if (oldestEvent) {
      this.unsubscribe(pluginName, oldestEvent);
    }
  }
}

export const pluginEventBus = new PluginEventBus();
