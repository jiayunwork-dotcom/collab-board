import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { Permission, Role, OnlineUser } from '@/types';
import { permissionApi, canvasApi } from '@/api/client';
import { uid } from '@/utils';

export interface SharePanelProps {
  onClose: () => void;
}

const ROLE_LABELS: Record<Role | 'PUBLIC', { label: string; desc: string; color: string }> = {
  OWNER: { label: '所有者', desc: '完全控制权', color: '#7C3AED' },
  EDITOR: { label: '编辑者', desc: '可编辑内容', color: '#2563EB' },
  COMMENTER: { label: '评论者', desc: '可评论不可编辑', color: '#059669' },
  VIEWER: { label: '查看者', desc: '仅可读', color: '#64748B' },
  PUBLIC: { label: '公开链接', desc: '任何人均可访问', color: '#EA580C' },
};

const ROLE_OPTIONS: Role[] = ['EDITOR', 'COMMENTER', 'VIEWER'];

export const SharePanel: React.FC<SharePanelProps> = ({ onClose }) => {
  const store = useCanvasStore;
  const currentCanvas = store(s => s.currentCanvas);
  const currentUser = store(s => s.currentUser);
  const onlineUsers = store(s => s.onlineUsers);
  const canvasRole = store(s => s.canvasRole);

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('VIEWER');
  const [isPublic, setIsPublic] = useState(false);
  const [publicRole, setPublicRole] = useState<Role>('VIEWER');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  const canvasId = currentCanvas?.canvas.id;
  const isOwner = currentCanvas?.canvas.ownerId === currentUser?.id;
  const canManage = isOwner || canvasRole === 'OWNER';

  useEffect(() => {
    if (!canvasId) return;
    loadPermissions();
    if (currentCanvas?.canvas) {
      setIsPublic(currentCanvas.canvas.isPublic);
    }
  }, [canvasId, currentCanvas]);

  const loadPermissions = useCallback(async () => {
    if (!canvasId) return;
    try {
      setLoading(true);
      setError(null);
      const perms = await permissionApi.list(canvasId);
      setPermissions(perms);
    } catch (err: any) {
      setError(err?.message || '加载权限失败');
    } finally {
      setLoading(false);
    }
  }, [canvasId]);

  const handleInvite = useCallback(async () => {
    if (!canvasId || !inviteEmail) return;
    try {
      setSaving(true);
      setError(null);
      const perm = await permissionApi.add(canvasId, {
        inviteEmail,
        role: inviteRole,
      });
      setPermissions(p => [...p, perm]);
      setInviteEmail('');
      setSuccess(`已发送邀请到 ${inviteEmail}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || '邀请失败');
    } finally {
      setSaving(false);
    }
  }, [canvasId, inviteEmail, inviteRole]);

  const handleRoleChange = useCallback(async (permId: string, newRole: Role) => {
    if (!canvasId || !canManage) return;
    try {
      setSaving(true);
      await permissionApi.updateRole(canvasId, permId, newRole);
      setPermissions(p => p.map(pp => pp.id === permId ? { ...pp, role: newRole } : pp));
    } catch (err: any) {
      setError(err?.message || '更新角色失败');
      loadPermissions();
    } finally {
      setSaving(false);
    }
  }, [canvasId, canManage, loadPermissions]);

  const handleRemove = useCallback(async (permId: string) => {
    if (!canvasId || !canManage) return;
    const perm = permissions.find(p => p.id === permId);
    if (!perm) return;
    const confirmed = window.confirm(`确定要移除 ${perm.username || perm.inviteEmail || '该用户'} 吗？`);
    if (!confirmed) return;
    try {
      setSaving(true);
      await permissionApi.remove(canvasId, permId);
      setPermissions(p => p.filter(pp => pp.id !== permId));
    } catch (err: any) {
      setError(err?.message || '移除失败');
    } finally {
      setSaving(false);
    }
  }, [canvasId, canManage, permissions]);

  const handleTogglePublic = useCallback(async () => {
    if (!canvasId || !canManage) return;
    try {
      setSaving(true);
      const newPublic = !isPublic;
      await canvasApi.update(canvasId, { isPublic: newPublic });
      store.getState().updateCanvasMeta({ isPublic: newPublic });
      setIsPublic(newPublic);
      setSuccess(newPublic ? '已启用公开链接' : '已关闭公开链接');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err: any) {
      setError(err?.message || '切换失败');
    } finally {
      setSaving(false);
    }
  }, [canvasId, canManage, isPublic, store]);

  const handleCopyLink = useCallback(async () => {
    if (!canvasId) return;
    const link = `${window.location.origin}/canvas/${canvasId}${isPublic ? '' : ''}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [canvasId, isPublic]);

  const getOnlineStatus = useCallback((userId?: string) => {
    if (!userId) return null;
    return onlineUsers.get(userId) || null;
  }, [onlineUsers]);

  const DirectPerms = permissions.filter(p => p.userId && !p.inviteToken);
  const Invitations = permissions.filter(p => p.inviteToken && !p.userId);

  const RoleBadge: React.FC<{ role: Role | 'PUBLIC' }> = ({ role }) => {
    const info = ROLE_LABELS[role];
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        background: `${info.color}15`,
        color: info.color,
        border: `1px solid ${info.color}30`,
      }}>
        {info.label}
      </span>
    );
  };

  const UserAvatar: React.FC<{ name?: string; avatar?: string; color?: string; size?: number }> = ({
    name = '?', avatar, color = '#6366F1', size = 36,
  }) => {
    const initials = name
      .split(/[\s_]/)
      .map(s => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

    if (avatar) {
      return (
        <img
          src={avatar}
          alt={name}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '2px solid #FFFFFF',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        />
      );
    }
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: color,
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${size * 0.38}px`,
          fontWeight: 600,
          border: '2px solid #FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 99999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        ref={panelRef}
        style={{
          width: '520px', maxHeight: '88vh', background: '#FFFFFF',
          borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '20px 24px', borderBottom: '1px solid #F1F5F9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
              分享画布
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
              {currentCanvas?.canvas.title || '未命名画布'}
            </p>
          </div>
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              border: 'none', background: saving ? '#F1F5F9' : 'transparent',
              cursor: saving ? 'not-allowed' : 'pointer', color: '#64748B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px',
            background: '#FEF2F2', border: '1px solid #FECACA',
            color: '#B91C1C', borderRadius: '8px', fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px',
            background: '#ECFDF5', border: '1px solid #A7F3D0',
            color: '#047857', borderRadius: '8px', fontSize: '13px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            ✓ {success}
          </div>
        )}

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{
            padding: '16px', background: '#F8FAFC',
            border: '1px solid #E2E8F0', borderRadius: '12px', marginBottom: '20px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: isPublic ? '#FEF3C7' : '#DBEAFE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px',
                }}>
                  {isPublic ? '🌐' : '🔒'}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                    {isPublic ? '公开访问' : '仅限受邀人员'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {isPublic
                      ? `任何拥有链接的人都可以${publicRole === 'VIEWER' ? '查看' : publicRole === 'COMMENTER' ? '评论' : '编辑'}`
                      : '只有被邀请的用户可以访问'}
                  </div>
                </div>
              </div>
              {canManage && (
                <label style={{
                  position: 'relative', display: 'inline-block',
                  width: '44px', height: '24px', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}>
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={handleTogglePublic}
                    disabled={saving}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', inset: 0,
                    background: isPublic ? '#10B981' : '#CBD5E1',
                    borderRadius: '24px', transition: 'background 0.2s',
                  }} />
                  <span style={{
                    position: 'absolute',
                    left: isPublic ? '22px' : '2px',
                    top: '2px',
                    width: '20px', height: '20px',
                    background: '#FFFFFF', borderRadius: '50%',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </label>
              )}
            </div>

            <div style={{
              display: 'flex', gap: '8px', alignItems: 'stretch',
            }}>
              <div style={{
                flex: 1,
                padding: '10px 12px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#475569',
                fontFamily: 'Consolas, Monaco, monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {window.location.origin}/canvas/{canvasId}
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  padding: '0 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: copied ? '#10B981' : '#6366F1',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? '✓ 已复制' : '📋 复制'}
              </button>
            </div>

            {isPublic && canManage && (
              <div style={{
                marginTop: '14px', paddingTop: '14px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span style={{ fontSize: '12px', color: '#64748B', flexShrink: 0 }}>
                  公开权限：
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['VIEWER', 'COMMENTER', 'EDITOR'] as Role[]).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setPublicRole(r)}
                      style={{
                        padding: '4px 10px',
                        border: publicRole === r ? `1px solid ${ROLE_LABELS[r].color}` : '1px solid #E2E8F0',
                        borderRadius: '6px',
                        background: publicRole === r ? `${ROLE_LABELS[r].color}10` : '#FFFFFF',
                        color: publicRole === r ? ROLE_LABELS[r].color : '#64748B',
                        fontSize: '12px',
                        fontWeight: publicRole === r ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {ROLE_LABELS[r].label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {canManage && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '12px', fontWeight: 600, color: '#0F172A',
                marginBottom: '10px',
              }}>
                邀请用户
              </div>
              <div style={{
                display: 'flex', gap: '8px', alignItems: 'center',
                padding: '8px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
              }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="输入邮箱地址..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inviteEmail) handleInvite();
                  }}
                  style={{
                    flex: 1,
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#FFFFFF',
                  }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  style={{
                    height: '36px',
                    padding: '0 10px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r].label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={saving || !inviteEmail}
                  style={{
                    height: '36px',
                    padding: '0 14px',
                    border: 'none',
                    borderRadius: '6px',
                    background: saving || !inviteEmail ? '#A5B4FC' : '#6366F1',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: saving || !inviteEmail ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {saving ? '发送中...' : '邀请'}
                </button>
              </div>
            </div>
          )}

          <div>
            <div style={{
              fontSize: '12px', fontWeight: 600, color: '#0F172A',
              marginBottom: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>协作者 ({DirectPerms.length + Invitations.length + (currentUser ? 1 : 0)})</span>
              {onlineUsers.size > 0 && (
                <span style={{
                  fontSize: '11px', color: '#10B981', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: '5px',
                }}>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: '#10B981', boxShadow: '0 0 0 2px #10B98140',
                  }} />
                  {onlineUsers.size} 人在线
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {loading && permissions.length === 0 && (
                <div style={{
                  padding: '30px', textAlign: 'center',
                  fontSize: '13px', color: '#94A3B8',
                }}>
                  加载中...
                </div>
              )}

              {currentUser && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px',
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                }}>
                  <div style={{ position: 'relative' }}>
                    <UserAvatar
                      name={currentUser.username || currentUser.email}
                      avatar={currentUser.avatarUrl}
                      color={currentUser.color}
                    />
                    {getOnlineStatus(currentUser.id) && (
                      <span style={{
                        position: 'absolute', right: '-2px', bottom: '-2px',
                        width: '12px', height: '12px', borderRadius: '50%',
                        background: '#10B981',
                        border: '2px solid #FFFFFF',
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 600, color: '#0F172A',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      {currentUser.username}
                      <span style={{
                        fontSize: '10px', color: '#94A3B8', fontWeight: 400,
                      }}>(你)</span>
                    </div>
                    <div style={{
                      fontSize: '11px', color: '#64748B',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {currentUser.email}
                    </div>
                  </div>
                  <RoleBadge role="OWNER" />
                </div>
              )}

              {DirectPerms.map(p => {
                const online = getOnlineStatus(p.userId!);
                const name = p.username || p.userAvatar || '用户';
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px',
                    background: '#FFFFFF',
                    borderRadius: '10px',
                    border: '1px solid #F1F5F9',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#FAFAFA'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
                  >
                    <div style={{ position: 'relative' }}>
                      <UserAvatar
                        name={typeof name === 'string' ? name : 'U'}
                        avatar={typeof p.userAvatar === 'string' ? p.userAvatar : undefined}
                        color={'#64748B'}
                      />
                      {online && (
                        <span style={{
                          position: 'absolute', right: '-2px', bottom: '-2px',
                          width: '12px', height: '12px', borderRadius: '50%',
                          background: '#10B981',
                          border: '2px solid #FFFFFF',
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px', fontWeight: 500, color: '#0F172A',
                      }}>
                        {typeof name === 'string' ? name : '用户'}
                      </div>
                    </div>
                    {canManage && p.role !== 'OWNER' ? (
                      <select
                        value={p.role}
                        onChange={(e) => handleRoleChange(p.id, e.target.value as Role)}
                        disabled={saving}
                        style={{
                          padding: '4px 8px',
                          border: `1px solid ${ROLE_LABELS[p.role].color}40`,
                          borderRadius: '6px',
                          background: `${ROLE_LABELS[p.role].color}08`,
                          color: ROLE_LABELS[p.role].color,
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          outline: 'none',
                        }}
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r} value={r}>{ROLE_LABELS[r].label}</option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={p.role} />
                    )}
                    {canManage && p.role !== 'OWNER' && (
                      <button
                        type="button"
                        onClick={() => handleRemove(p.id)}
                        disabled={saving}
                        style={{
                          width: '28px', height: '28px',
                          border: 'none',
                          borderRadius: '6px',
                          background: 'transparent',
                          color: '#94A3B8',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!saving) {
                            e.currentTarget.style.background = '#FEF2F2';
                            e.currentTarget.style.color = '#EF4444';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#94A3B8';
                        }}
                        title="移除"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                );
              })}

              {Invitations.length > 0 && (
                <>
                  <div style={{
                    fontSize: '11px', color: '#94A3B8',
                    fontWeight: 500, textTransform: 'uppercase',
                    letterSpacing: '0.5px', margin: '16px 4px 8px',
                  }}>
                    待接受邀请 ({Invitations.length})
                  </div>
                  {Invitations.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 12px',
                      background: '#FFFEF7',
                      borderRadius: '10px',
                      border: '1px dashed #FCD34D',
                      opacity: 0.85,
                    }}>
                      <div style={{ position: 'relative' }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          background: '#FEF3C7',
                          border: '2px dashed #F59E0B',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '14px',
                        }}>
                          ✉️
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px', fontWeight: 500, color: '#92400E',
                        }}>
                          {p.inviteEmail}
                        </div>
                        <div style={{
                          fontSize: '11px', color: '#B45309',
                        }}>
                          等待接受
                          {p.inviteExpiresAt && ` · 过期于 ${new Date(p.inviteExpiresAt).toLocaleDateString()}`}
                        </div>
                      </div>
                      <RoleBadge role={p.role} />
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleRemove(p.id)}
                          disabled={saving}
                          style={{
                            width: '28px', height: '28px',
                            border: 'none',
                            borderRadius: '6px',
                            background: 'transparent',
                            color: '#D97706',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                          }}
                          title="撤回邀请"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}

              {!loading && DirectPerms.length === 0 && Invitations.length === 0 && (
                <div style={{
                  padding: '30px 20px', textAlign: 'center',
                  background: '#F8FAFC',
                  borderRadius: '12px',
                  border: '1px dashed #E2E8F0',
                }}>
                  <div style={{
                    fontSize: '36px', marginBottom: '8px',
                  }}>
                    🤝
                  </div>
                  <div style={{
                    fontSize: '13px', color: '#64748B',
                    fontWeight: 500,
                  }}>
                    暂无协作者
                  </div>
                  <div style={{
                    fontSize: '11px', color: '#94A3B8',
                    marginTop: '4px',
                  }}>
                    邀请他人一起协作吧
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{
          padding: '16px 24px 20px', display: 'flex', justifyContent: 'flex-end',
          borderTop: '1px solid #F1F5F9',
          background: '#FAFAFA',
        }}>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            style={{
              padding: '10px 24px', borderRadius: '8px',
              border: 'none', background: saving ? '#A5B4FC' : '#6366F1',
              color: '#FFFFFF', fontSize: '14px', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              boxShadow: saving ? 'none' : '0 2px 6px rgba(99,102,241,0.3)',
            }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharePanel;
