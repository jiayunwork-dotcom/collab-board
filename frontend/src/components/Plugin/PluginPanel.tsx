import React, { useState, useEffect, useCallback } from 'react';
import { pluginManager, BUILTIN_PLUGINS } from '@/plugin/PluginManager';
import { securityLogger } from '@/plugin/securityLogger';
import type { PluginInstallation, SecurityLogEntry, PluginPermission, BuiltinPluginInfo } from '@/types/plugin';

type SubTab = 'installed' | 'discover' | 'logs';

const PERMISSION_LABELS: Record<PluginPermission, { label: string; desc: string; icon: string }> = {
  'canvas:read': { label: '读取画布', desc: '读取画布元素和视口信息', icon: '👁️' },
  'canvas:write': { label: '修改画布', desc: '创建和修改画布元素', icon: '✏️' },
  'user:info': { label: '用户信息', desc: '获取当前用户和在线用户列表', icon: '👤' },
  'notification:send': { label: '发送通知', desc: '显示浏览器桌面通知', icon: '🔔' },
  'storage:local': { label: '本地存储', desc: '在本地存储最多1MB数据', icon: '💾' },
};

const PluginPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SubTab>('installed');
  const [installed, setInstalled] = useState<PluginInstallation[]>([]);
  const [runningNames, setRunningNames] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<SecurityLogEntry[]>([]);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setInstalled(pluginManager.getInstalledPlugins());
    const running = new Set<string>();
    pluginManager.getRuntimePlugins().forEach(p => {
      if (p.status === 'running') running.add(p.name);
    });
    setRunningNames(running);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = pluginManager.subscribe(refresh);
    const unsubLogs = securityLogger.subscribe(setLogs);
    return () => { unsub(); unsubLogs(); };
  }, [refresh]);

  const handleInstall = async (plugin: BuiltinPluginInfo) => {
    setInstalling(plugin.name);
    try {
      await pluginManager.installPlugin(plugin.name);
      refresh();
    } catch (e: any) {
      alert('安装失败：' + (e.message || '未知错误'));
    } finally {
      setInstalling(null);
    }
  };

  const handleToggle = async (name: string) => {
    setToggling(name);
    try {
      await pluginManager.togglePlugin(name);
      refresh();
    } catch (e: any) {
      alert('操作失败：' + (e.message || '未知错误'));
    } finally {
      setToggling(null);
    }
  };

  const handleUninstall = async (name: string) => {
    if (!confirm(`确定要卸载插件 "${name}" 吗？此操作会同时移除插件的本地存储数据。`)) {
      return;
    }
    setUninstalling(name);
    try {
      await pluginManager.uninstallPlugin(name);
      refresh();
    } catch (e: any) {
      alert('卸载失败：' + (e.message || '未知错误'));
    } finally {
      setUninstalling(null);
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch { return d; }
  };

  const formatLogTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleString('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch { return ''; }
  };

  const logTypeStyle: Record<SecurityLogEntry['type'], string> = {
    permission_denied: 'bg-rose-50 text-rose-700 border-rose-200',
    rate_limited: 'bg-amber-50 text-amber-700 border-amber-200',
    unsafe_api: 'bg-red-50 text-red-700 border-red-200',
    load_error: 'bg-orange-50 text-orange-700 border-orange-200',
  };

  const logTypeLabel: Record<SecurityLogEntry['type'], string> = {
    permission_denied: '权限拒绝',
    rate_limited: '限频触发',
    unsafe_api: '危险API',
    load_error: '加载错误',
  };

  const installedMap = new Map(installed.map(p => [p.pluginName, p]));

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-slate-200">
        {([
          { key: 'installed' as const, label: '已安装', count: installed.length },
          { key: 'discover' as const, label: '发现', count: BUILTIN_PLUGINS.length },
          { key: 'logs' as const, label: '安全日志', count: logs.length },
        ]).map(tab => (
          <button
            key={tab.key}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1 inline-flex items-center justify-center text-[10px] px-1.5 rounded-full ${
                activeTab === tab.key ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar p-3 space-y-3">
        {activeTab === 'installed' && (
          installed.length === 0 ? (
            <div className="text-center text-slate-400 py-12 text-sm">
              <div className="text-4xl mb-3 opacity-50">📦</div>
              暂无已安装插件
              <div className="mt-3">
                <button
                  onClick={() => setActiveTab('discover')}
                  className="text-indigo-600 hover:text-indigo-700 text-xs font-medium"
                >
                  → 前往发现安装
                </button>
              </div>
            </div>
          ) : (
            installed.map(inst => {
              const info = BUILTIN_PLUGINS.find(b => b.name === inst.pluginName);
              const isRunning = runningNames.has(inst.pluginName);
              const isBusy = toggling === inst.pluginName || uninstalling === inst.pluginName;
              const isExpanded = expandedPlugin === inst.pluginName;
              return (
                <div
                  key={inst.pluginName}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isRunning ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xl flex-shrink-0 shadow-sm">
                        {info?.icon || '📦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-800 truncate">
                            {info?.name || inst.pluginName}
                          </h4>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            v{inst.pluginVersion}
                          </span>
                          {isRunning && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              运行中
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {info?.description || '无描述'}
                        </p>
                        {inst.installedByName && (
                          <p className="text-[11px] text-slate-400 mt-1">
                            由 {inst.installedByName} 安装于 {formatDate(inst.installedAt)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <label className={`inline-flex items-center gap-2 cursor-pointer ${isBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                          <div className={`relative w-9 h-5 rounded-full transition-colors ${
                            inst.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}>
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              inst.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                          </div>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={inst.enabled}
                            onChange={() => handleToggle(inst.pluginName)}
                            disabled={isBusy}
                          />
                          <span className="text-xs text-slate-600">
                            {inst.enabled ? '已启用' : '已禁用'}
                          </span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedPlugin(isExpanded ? null : inst.pluginName)}
                          className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                        >
                          {isExpanded ? '收起' : '详情'}
                        </button>
                        <button
                          onClick={() => handleUninstall(inst.pluginName)}
                          disabled={isBusy}
                          className={`text-xs text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 transition-colors ${
                            isBusy ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {uninstalling === inst.pluginName ? '卸载中...' : '卸载'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 bg-slate-50/50 border-t border-slate-100">
                      <div className="pt-3">
                        <div className="text-xs font-semibold text-slate-600 mb-2">已授权权限</div>
                        <div className="flex flex-wrap gap-1.5">
                          {inst.permissions.map(p => {
                            const info = PERMISSION_LABELS[p];
                            return (
                              <div
                                key={p}
                                className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-1"
                                title={info?.desc}
                              >
                                <span className="text-xs">{info?.icon}</span>
                                <span className="text-[11px] text-slate-700">{info?.label || p}</span>
                              </div>
                            );
                          })}
                        </div>
                        {info?.author && (
                          <div className="text-[11px] text-slate-500 mt-3">
                            作者：{info.author}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )
        )}

        {activeTab === 'discover' && (
          BUILTIN_PLUGINS.map(plugin => {
            const isInstalled = installedMap.has(plugin.name);
            const installation = installedMap.get(plugin.name);
            const isBusy = installing === plugin.name;
            return (
              <div
                key={plugin.name}
                className={`border rounded-xl overflow-hidden transition-all hover:shadow-md ${
                  isInstalled ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 flex items-center justify-center text-xl flex-shrink-0">
                      {plugin.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-800 truncate">
                          {plugin.name}
                        </h4>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          v{plugin.version}
                        </span>
                        {plugin.category && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                            {plugin.category}
                          </span>
                        )}
                        {isInstalled && installation?.enabled && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                            ✓ 已安装
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {plugin.description}
                      </p>
                      {plugin.author && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          作者：{plugin.author}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-[11px] font-semibold text-slate-500 mb-2">所需权限</div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {plugin.permissions.map(p => {
                        const info = PERMISSION_LABELS[p];
                        return (
                          <div
                            key={p}
                            className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
                            title={info?.desc}
                          >
                            <span className="text-xs">{info?.icon}</span>
                            <span className="text-[11px] text-slate-600">{info?.label || p}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-end">
                      {isInstalled ? (
                        <button
                          onClick={() => handleToggle(plugin.name)}
                          disabled={isBusy || toggling === plugin.name}
                          className={`btn btn-sm ${installation?.enabled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'btn-primary'}`}
                        >
                          {installation?.enabled ? '禁用' : '启用'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleInstall(plugin)}
                          disabled={isBusy}
                          className="btn btn-primary btn-sm"
                        >
                          {isBusy ? (
                            <span className="flex items-center gap-1">
                              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              安装中
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                              </svg>
                              安装
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {activeTab === 'logs' && (
          <div className="space-y-2">
            {logs.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-slate-500">最近 {logs.length} 条记录</span>
                <button
                  onClick={() => securityLogger.clear()}
                  className="text-xs text-slate-500 hover:text-rose-600"
                >
                  清空日志
                </button>
              </div>
            )}
            {logs.length === 0 ? (
              <div className="text-center text-slate-400 py-12 text-sm">
                <div className="text-4xl mb-3 opacity-50">🛡️</div>
                暂无安全事件
                <div className="text-xs mt-2 text-slate-400/80">
                  权限拒绝和限频事件将在此记录
                </div>
              </div>
            ) : (
              logs.map(log => (
                <div
                  key={log.id}
                  className={`border rounded-lg p-2.5 text-xs ${logTypeStyle[log.type]}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`font-semibold text-[10px] px-1.5 py-0.5 rounded bg-white/60`}>
                        {logTypeLabel[log.type]}
                      </span>
                      <span className="font-medium truncate">{log.pluginName}</span>
                    </div>
                    <span className="text-[10px] opacity-70 flex-shrink-0">
                      {formatLogTime(log.timestamp)}
                    </span>
                  </div>
                  <div className="mt-1.5 opacity-90 leading-relaxed">
                    {log.message}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginPanel;
