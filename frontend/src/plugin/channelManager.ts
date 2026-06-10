import type { ChannelMessage } from '@/types/plugin';
import { securityLogger } from './securityLogger';

type ChannelCallback = (message: ChannelMessage) => void;

const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9-]{1,32}$/;
const MAX_MESSAGES_PER_SECOND = 10;

interface ChannelRateLimit {
  timestamps: number[];
}

class ChannelManager {
  private listeners: Map<string, Set<ChannelCallback>> = new Map();
  private pluginListeners: Map<string, Map<string, ChannelCallback>> = new Map();
  private rateLimits: Map<string, Map<string, ChannelRateLimit>> = new Map();

  validateChannelName(name: string): boolean {
    return CHANNEL_NAME_REGEX.test(name);
  }

  canSendToChannel(pluginName: string, channelName: string, declaredChannels: string[]): boolean {
    if (!this.validateChannelName(channelName)) {
      securityLogger.channelViolation(pluginName, `Invalid channel name: ${channelName}`);
      return false;
    }
    if (!declaredChannels.includes(channelName)) {
      securityLogger.channelViolation(pluginName, `Channel not declared in manifest: ${channelName}`);
      return false;
    }
    return true;
  }

  checkRateLimit(pluginName: string, channelName: string): boolean {
    let pluginRates = this.rateLimits.get(pluginName);
    if (!pluginRates) {
      pluginRates = new Map();
      this.rateLimits.set(pluginName, pluginRates);
    }

    let limit = pluginRates.get(channelName);
    if (!limit) {
      limit = { timestamps: [] };
      pluginRates.set(channelName, limit);
    }

    const now = Date.now();
    limit.timestamps = limit.timestamps.filter(t => now - t < 1000);

    if (limit.timestamps.length >= MAX_MESSAGES_PER_SECOND) {
      securityLogger.channelRateLimited(pluginName, channelName);
      return false;
    }

    limit.timestamps.push(now);
    return true;
  }

  send(pluginName: string, channelName: string, data: any, declaredChannels: string[]): boolean {
    if (!this.canSendToChannel(pluginName, channelName, declaredChannels)) {
      return false;
    }
    if (!this.checkRateLimit(pluginName, channelName)) {
      return false;
    }

    const message: ChannelMessage = {
      channelName,
      senderPlugin: pluginName,
      data,
      timestamp: Date.now(),
    };

    const listeners = this.listeners.get(channelName);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(message);
        } catch (e) {
          console.error(`[ChannelManager] Error in channel '${channelName}' listener:`, e);
        }
      }
    }

    return true;
  }

  on(pluginName: string, channelName: string, callback: ChannelCallback): boolean {
    if (!this.validateChannelName(channelName)) {
      return false;
    }

    let channelListeners = this.listeners.get(channelName);
    if (!channelListeners) {
      channelListeners = new Set();
      this.listeners.set(channelName, channelListeners);
    }
    channelListeners.add(callback);

    let pluginMap = this.pluginListeners.get(pluginName);
    if (!pluginMap) {
      pluginMap = new Map();
      this.pluginListeners.set(pluginName, pluginMap);
    }
    pluginMap.set(channelName, callback);

    return true;
  }

  off(pluginName: string, channelName: string): boolean {
    const pluginMap = this.pluginListeners.get(pluginName);
    if (!pluginMap) return false;

    const callback = pluginMap.get(channelName);
    if (callback) {
      const channelListeners = this.listeners.get(channelName);
      if (channelListeners) {
        channelListeners.delete(callback);
        if (channelListeners.size === 0) {
          this.listeners.delete(channelName);
        }
      }
      pluginMap.delete(channelName);
    }

    return true;
  }

  unsubscribeAll(pluginName: string): void {
    const pluginMap = this.pluginListeners.get(pluginName);
    if (!pluginMap) return;

    for (const [channelName, callback] of pluginMap) {
      const channelListeners = this.listeners.get(channelName);
      if (channelListeners) {
        channelListeners.delete(callback);
        if (channelListeners.size === 0) {
          this.listeners.delete(channelName);
        }
      }
    }

    this.pluginListeners.delete(pluginName);
    this.rateLimits.delete(pluginName);
  }
}

export const channelManager = new ChannelManager();
