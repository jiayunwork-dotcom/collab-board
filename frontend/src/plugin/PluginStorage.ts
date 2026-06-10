const DB_NAME = 'collab_board_plugins';
const DB_VERSION = 1;
const STORE_NAME = 'plugin_storage';
const MAX_TOTAL_SIZE = 1024 * 1024; // 1MB per plugin
const MAX_VALUE_SIZE = 100 * 1024; // 100KB per value

interface StorageRecord {
  pluginId: string;
  key: string;
  value: any;
  size: number;
  updatedAt: number;
}

class PluginStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private sizeCache: Map<string, number> = new Map();

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: ['pluginId', 'key'],
          });
          store.createIndex('pluginId', 'pluginId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });

    return this.initPromise;
  }

  private getValueSize(value: any): number {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      return 0;
    }
  }

  private async getPluginTotalSize(pluginId: string): Promise<number> {
    if (this.sizeCache.has(pluginId)) {
      return this.sizeCache.get(pluginId)!;
    }
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('pluginId');
      const request = index.openCursor(IDBKeyRange.only(pluginId));
      let total = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          total += cursor.value.size || 0;
          cursor.continue();
        } else {
          this.sizeCache.set(pluginId, total);
          resolve(total);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async get(pluginId: string, key: string): Promise<any> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get([pluginId, key]);

      request.onsuccess = () => {
        const result = request.result as StorageRecord | undefined;
        resolve(result ? result.value : null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async set(pluginId: string, key: string, value: any): Promise<void> {
    await this.init();

    const valueSize = this.getValueSize(value);
    if (valueSize > MAX_VALUE_SIZE) {
      throw new Error(`Value too large: ${valueSize} bytes exceeds ${MAX_VALUE_SIZE} bytes limit`);
    }

    const currentTotal = await this.getPluginTotalSize(pluginId);
    let existingSize = 0;

    try {
      const existing = await this.get(pluginId, key);
      if (existing !== null) {
        existingSize = this.getValueSize(existing);
      }
    } catch { /* ignore */ }

    const newTotal = currentTotal - existingSize + valueSize;
    if (newTotal > MAX_TOTAL_SIZE) {
      throw new Error(
        `Storage quota exceeded: ${newTotal} bytes exceeds ${MAX_TOTAL_SIZE} bytes limit for plugin ${pluginId}`
      );
    }

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StorageRecord = {
        pluginId,
        key,
        value,
        size: valueSize,
        updatedAt: Date.now(),
      };
      const request = store.put(record);

      request.onsuccess = () => {
        this.sizeCache.set(pluginId, newTotal);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async delete(pluginId: string, key: string): Promise<void> {
    await this.init();
    const existing = await this.get(pluginId, key);
    const existingSize = existing !== null ? this.getValueSize(existing) : 0;

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete([pluginId, key]);

      request.onsuccess = () => {
        const current = this.sizeCache.get(pluginId) || 0;
        this.sizeCache.set(pluginId, Math.max(0, current - existingSize));
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async clearPlugin(pluginId: string): Promise<void> {
    await this.init();
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('pluginId');
      const request = index.openCursor(IDBKeyRange.only(pluginId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          this.sizeCache.delete(pluginId);
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
}

export const pluginStorage = new PluginStorage();
