export const WORKER_SANDBOX_TEMPLATE = `
(function() {
  'use strict';

  const _eval = globalThis.eval;
  const _Function = globalThis.Function;
  const _importScripts = globalThis.importScripts;
  const __HOST_ORIGIN__ = '__HOST_ORIGIN_PLACEHOLDER__';
  const __PLUGIN_BASE__ = '__PLUGIN_BASE_PLACEHOLDER__';

  const UNSAFE_ERROR = 'This API is disabled in plugin sandbox';

  globalThis.eval = function() {
    throw new Error(UNSAFE_ERROR);
  };

  globalThis.Function = function() {
    throw new Error(UNSAFE_ERROR);
  };

  function _resolveUrl(url) {
    try {
      return new URL(url, __PLUGIN_BASE__);
    } catch (e) {
      return null;
    }
  }

  function _isAllowedUrl(url) {
    const parsed = _resolveUrl(url);
    if (!parsed) return false;
    if (parsed.origin !== __HOST_ORIGIN__) return false;
    return true;
  }

  globalThis.importScripts = function(...urls) {
    for (const url of urls) {
      if (!_isAllowedUrl(url)) {
        postMessage({
          type: '__security_violation__',
          api: 'importScripts',
          detail: 'External URL not allowed: ' + url
        });
        throw new Error('importScripts from external origin is forbidden');
      }
    }
    const resolvedUrls = urls.map(u => _resolveUrl(u).href);
    return _importScripts.apply(globalThis, resolvedUrls);
  };

  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.parent;
  delete globalThis.top;
  delete globalThis.locationbar;
  delete globalThis.menubar;
  delete globalThis.statusbar;
  delete globalThis.toolbar;
  delete globalThis.frames;
  delete globalThis.self;
  Object.defineProperty(globalThis, 'self', { value: globalThis, writable: false, configurable: false });

  const _pendingRequests = new Map();
  let _requestIdCounter = 0;
  const _callbacks = new Map();
  let _callbackIdCounter = 0;

  function _bridgeCall(method, params) {
    return new Promise((resolve, reject) => {
      const id = 'req_' + (++_requestIdCounter);
      _pendingRequests.set(id, { resolve, reject });
      postMessage({
        type: 'bridge:request',
        id,
        method,
        params
      });
    });
  }

  function _registerCallback(fn) {
    const id = 'cb_' + (++_callbackIdCounter);
    _callbacks.set(id, fn);
    return id;
  }

  addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'bridge:response') {
      const pending = _pendingRequests.get(data.id);
      if (pending) {
        _pendingRequests.delete(data.id);
        if (data.success) {
          pending.resolve(data.result);
        } else {
          const err = new Error(data.error || 'Unknown error');
          (err as any).code = data.errorCode;
          pending.reject(err);
        }
      }
    } else if (data.type === 'plugin:callback') {
      const cb = _callbacks.get(data.callbackId);
      if (cb) {
        try { cb(data.payload); } catch (e) { console.error(e); }
      }
    } else if (data.type === 'event') {
      if (typeof PluginAPI._eventHandlers !== 'undefined') {
        const handlers = PluginAPI._eventHandlers.get(data.event);
        if (handlers) {
          handlers.forEach((h: any) => {
            try { h(data.payload); } catch (e) { console.error(e); }
          });
        }
      }
    }
  });

  const PluginAPI = {
    _eventHandlers: new Map(),

    canvas: {
      getElements: (filter) => _bridgeCall('canvas.getElements', [filter]),
      createElement: (type, props) => _bridgeCall('canvas.createElement', [type, props]),
      updateElement: (id, props) => _bridgeCall('canvas.updateElement', [id, props]),
      onElementChange: (callback) => {
        const cbId = _registerCallback(callback);
        return _bridgeCall('canvas.onElementChange', [cbId]);
      },
      getViewport: () => _bridgeCall('canvas.getViewport', []),
    },

    user: {
      getCurrentUser: () => _bridgeCall('user.getCurrentUser', []),
      getOnlineUsers: () => _bridgeCall('user.getOnlineUsers', []),
    },

    notification: {
      show: (title, body) => _bridgeCall('notification.show', [title, body]),
    },

    storage: {
      get: (key) => _bridgeCall('storage.get', [key]),
      set: (key, value) => _bridgeCall('storage.set', [key, value]),
    },

    plugin: {
      getManifest: () => _bridgeCall('plugin.getManifest', []),
    },

    on: (event, handler) => {
      if (!PluginAPI._eventHandlers.has(event)) {
        PluginAPI._eventHandlers.set(event, new Set());
        _bridgeCall('event.subscribe', [event]);
      }
      PluginAPI._eventHandlers.get(event).add(handler);
      return () => {
        const handlers = PluginAPI._eventHandlers.get(event);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            PluginAPI._eventHandlers.delete(event);
            _bridgeCall('event.unsubscribe', [event]);
          }
        }
      };
    },

    off: (event, handler) => {
      const handlers = PluginAPI._eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    },
  };

  Object.freeze(PluginAPI.canvas);
  Object.freeze(PluginAPI.user);
  Object.freeze(PluginAPI.notification);
  Object.freeze(PluginAPI.storage);
  Object.freeze(PluginAPI.plugin);
  Object.freeze(PluginAPI);

  globalThis.PluginAPI = PluginAPI;

  __PLUGIN_ENTRY_CODE__
})();
`;

export function buildWorkerCode(
  entryCode: string,
  manifestJson: string,
  hostOrigin: string,
  pluginBaseUrl: string
): string {
  let code = WORKER_SANDBOX_TEMPLATE;
  code = code.replace(/'__HOST_ORIGIN_PLACEHOLDER__'/g, JSON.stringify(hostOrigin));
  code = code.replace(/'__PLUGIN_BASE_PLACEHOLDER__'/g, JSON.stringify(pluginBaseUrl));
  code = code.replace(
    '__PLUGIN_ENTRY_CODE__',
    `\nconst __MANIFEST__ = ${manifestJson};\n\n${entryCode}\n`
  );
  return code;
}
