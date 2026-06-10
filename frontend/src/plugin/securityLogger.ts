import type { SecurityLogEntry } from '@/types/plugin';
import { uid } from '@/utils';

const MAX_LOG_ENTRIES = 200;

class SecurityLogger {
  private logs: SecurityLogEntry[] = [];
  private listeners: Set<(logs: SecurityLogEntry[]) => void> = new Set();

  addEntry(entry: Omit<SecurityLogEntry, 'id' | 'timestamp'>): void {
    const fullEntry: SecurityLogEntry = {
      ...entry,
      id: uid(),
      timestamp: Date.now(),
    };
    this.logs.unshift(fullEntry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(0, MAX_LOG_ENTRIES);
    }
    this.notifyListeners();
  }

  permissionDenied(pluginName: string, method: string, permission: string): void {
    this.addEntry({
      pluginName,
      type: 'permission_denied',
      message: `Plugin '${pluginName}' attempted to call '${method}' without required permission '${permission}'`,
      details: { method, requiredPermission: permission },
    });
  }

  rateLimited(pluginName: string, method: string): void {
    this.addEntry({
      pluginName,
      type: 'rate_limited',
      message: `Plugin '${pluginName}' exceeded rate limit for '${method}'`,
      details: { method },
    });
  }

  unsafeApi(pluginName: string, api: string): void {
    this.addEntry({
      pluginName,
      type: 'unsafe_api',
      message: `Plugin '${pluginName}' attempted to use unsafe API '${api}'`,
      details: { api },
    });
  }

  loadError(pluginName: string, error: string): void {
    this.addEntry({
      pluginName,
      type: 'load_error',
      message: `Failed to load plugin '${pluginName}': ${error}`,
      details: { error },
    });
  }

  getLogs(): SecurityLogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
    this.notifyListeners();
  }

  subscribe(callback: (logs: SecurityLogEntry[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const snapshot = this.getLogs();
    this.listeners.forEach(cb => {
      try {
        cb(snapshot);
      } catch (e) {
        console.error('[SecurityLogger] Listener error:', e);
      }
    });
  }
}

export const securityLogger = new SecurityLogger();
