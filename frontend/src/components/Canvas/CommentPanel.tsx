import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import { commentApi } from '@/api/client';
import type { Comment, CommentReply, OnlineUser, UUID } from '@/types';

interface CommentPanelProps {
  comment: Comment;
  position: { x: number; y: number };
  onClose: () => void;
}

const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 420;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  return d.toLocaleDateString();
};

const Avatar: React.FC<{ color?: string; name?: string; size?: number }> = ({ color = '#4F46E5', name = '?', size = 32 }) => (
  <div
    className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
    style={{
      width: size,
      height: size,
      background: color,
      fontSize: size * 0.4,
    }}
  >
    {(name || '?').charAt(0).toUpperCase()}
  </div>
);

const renderContentWithMentions = (content: string) => {
  const parts: React.ReactNode[] = [];
  const regex = /@[\w-]+/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{content.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span
        key={key++}
        className="mention-highlight"
      >
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : content;
};

const CommentPanel: React.FC<CommentPanelProps> = ({ comment, position, onClose }) => {
  const {
    commentReplies,
    setCommentReplies,
    addCommentReply,
    currentUser,
    onlineUsers,
    canvasRole,
    currentCanvas,
  } = useCanvasStore();

  const [inputValue, setInputValue] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const canComment = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
  const replies = commentReplies.get(comment.id) || [];

  const mentionUsers = useMemo(() => {
    const users = [...onlineUsers.values()]
      .filter(u => u.userId !== currentUser?.id)
      .map(u => ({
        id: u.userId,
        username: u.username,
        avatarUrl: u.avatarUrl,
        color: u.color,
      }));
    if (mentionQuery) {
      const q = mentionQuery.toLowerCase();
      return users.filter(u => u.username.toLowerCase().includes(q));
    }
    return users;
  }, [onlineUsers, currentUser, mentionQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!commentReplies.has(comment.id)) {
      setLoading(true);
      commentApi.getWithReplies(comment.id)
        .then(data => {
          setCommentReplies(comment.id, data.replies);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [comment.id, commentReplies, setCommentReplies]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInputValue(value);

    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') {
        atPos = i;
        break;
      }
      if (value[i] === ' ' || value[i] === '\n') break;
    }

    if (atPos >= 0) {
      const query = value.slice(atPos + 1, cursorPos);
      if (!query.includes(' ') && !query.includes('\n')) {
        setMentionStart(atPos);
        setMentionQuery(query);
        setShowMentionMenu(true);
        setSelectedMentionIdx(0);
        return;
      }
    }
    setShowMentionMenu(false);
  }, []);

  const insertMention = useCallback((user: { id: string; username: string }) => {
    if (mentionStart < 0) return;
    const before = inputValue.slice(0, mentionStart);
    const after = inputValue.slice(mentionStart + mentionQuery.length + 1);
    const mentionText = `@${user.username}|${user.id} `;
    const newValue = before + mentionText + after;
    setInputValue(newValue);
    setShowMentionMenu(false);
    setMentionStart(-1);
    setMentionQuery('');
    setTimeout(() => {
      if (inputRef.current) {
        const pos = before.length + mentionText.length;
        inputRef.current.setSelectionRange(pos, pos);
        inputRef.current.focus();
      }
    }, 0);
  }, [inputValue, mentionStart, mentionQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showMentionMenu && mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIdx(i => (i + 1) % mentionUsers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIdx(i => (i - 1 + mentionUsers.length) % mentionUsers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionUsers[selectedMentionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [showMentionMenu, mentionUsers, selectedMentionIdx, insertMention]);

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() || !canComment) return;
    const content = inputValue;
    setInputValue('');
    try {
      const reply = await commentApi.addReply(comment.id, content);
      addCommentReply(comment.id, reply);
    } catch (e) {
      console.error('Failed to add reply', e);
      setInputValue(content);
    }
  }, [inputValue, canComment, comment.id, addCommentReply]);

  const panelLeft = Math.max(8, Math.min(position.x - PANEL_WIDTH / 2, window.innerWidth - PANEL_WIDTH - 8));
  const panelTop = Math.max(8, position.y + 40);

  return (
    <div
      ref={panelRef}
      className="absolute comment-panel pointer-events-auto"
      style={{
        left: panelLeft,
        top: panelTop,
        width: PANEL_WIDTH,
        maxHeight: PANEL_MAX_HEIGHT,
        zIndex: 2000,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="panel p-0 flex flex-col overflow-hidden" style={{ maxHeight: PANEL_MAX_HEIGHT }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar color={comment.createdByColor} name={comment.createdByName} size={24} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">
                {comment.createdByName || '用户'}
              </div>
              <div className="text-xs text-slate-400">{formatTime(comment.createdAt)}</div>
            </div>
          </div>
          <button
            className="btn btn-icon btn-sm text-slate-400 hover:text-slate-600"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar">
          {loading && replies.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-4">加载中...</div>
          ) : replies.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-4">暂无评论</div>
          ) : (
            replies.map((reply, idx) => (
              <div key={reply.id || idx} className="flex gap-2">
                <Avatar color={reply.userColor} name={reply.username} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800">
                      {reply.username || '用户'}
                    </span>
                    <span className="text-xs text-slate-400">{formatTime(reply.createdAt)}</span>
                  </div>
                  <div className="text-sm text-slate-700 leading-relaxed break-words">
                    {renderContentWithMentions(reply.content)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {canComment && (
          <div className="border-t border-slate-100 p-3 flex-shrink-0">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="输入评论... 输入@提及用户"
                className="w-full text-sm p-2 rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                rows={2}
                style={{ fontSize: 13 }}
              />
              {showMentionMenu && mentionUsers.length > 0 && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden max-h-48 overflow-y-auto z-50"
                >
                  {mentionUsers.map((user, idx) => (
                    <button
                      key={user.id}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-indigo-50 transition-colors ${idx === selectedMentionIdx ? 'bg-indigo-50' : ''}`}
                      onClick={() => insertMention(user)}
                      onMouseEnter={() => setSelectedMentionIdx(idx)}
                    >
                      <Avatar color={user.color} name={user.username} size={24} />
                      <span className="text-sm text-slate-700">{user.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-slate-400">Ctrl+Enter 发送</div>
              <button
                className="btn btn-primary btn-sm gap-1"
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
                发送
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentPanel;
