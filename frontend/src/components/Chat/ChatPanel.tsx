import React, { useState, useRef, useEffect } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import { uid } from '@/utils';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  color: string;
  content: string;
  timestamp: number;
}

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    userId: 'u1',
    username: '张三',
    color: '#6366F1',
    content: '大家好，我们今天来讨论一下新功能的设计方案',
    timestamp: Date.now() - 3600000 * 2,
  },
  {
    id: 'msg-2',
    userId: 'u2',
    username: '李四',
    color: '#10B981',
    content: '好的，我已经把原型图放在画布上了，大家可以看看',
    timestamp: Date.now() - 3600000,
  },
  {
    id: 'msg-3',
    userId: 'u3',
    username: '王五',
    color: '#F59E0B',
    content: '我觉得整体流程是OK的，不过在第二步可以加一个确认弹窗',
    timestamp: Date.now() - 1800000,
  },
];

const ChatPanel: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { currentUser } = useCanvasStore();
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open, expanded]);

  const sendMessage = () => {
    const content = input.trim();
    if (!content) return;
    const msg: ChatMessage = {
      id: uid(),
      userId: currentUser?.id || 'local',
      username: currentUser?.username || '我',
      avatarUrl: currentUser?.avatarUrl,
      color: currentUser?.color || '#6366F1',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, msg]);
    setInput('');

    if (content.includes('你好') || content.includes('hi') || content.includes('Hi')) {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: uid(),
          userId: 'bot',
          username: '助手',
          color: '#8B5CF6',
          content: '你好！有什么我可以帮助你的吗？你可以使用画布左侧的工具栏选择绘图工具。',
          timestamp: Date.now(),
        }]);
      }, 800);
    }
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const trimmed = name.trim();
    if (trimmed.length <= 2) return trimmed.toUpperCase();
    const parts = trimmed.split(/[\s_]+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
  };

  if (!open) return null;

  return (
    <div
      className="absolute bottom-4 left-80 z-30 flex flex-col"
      style={{
        width: 340,
        height: expanded ? 440 : 48,
        transition: 'height 0.2s',
      }}
    >
      <div
        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-xl px-4 py-2.5 flex items-center justify-between cursor-pointer shadow-lg"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="font-semibold text-sm">画布聊天</span>
          {messages.length > 0 && (
            <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">
              {messages.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            className="w-6 h-6 rounded hover:bg-white/15 flex items-center justify-center transition-colors"
            onClick={() => setExpanded(e => !e)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button
            className="w-6 h-6 rounded hover:bg-white/15 flex items-center justify-center transition-colors"
            onClick={onClose}
            title="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex-1 bg-white rounded-b-xl border border-t-0 border-slate-200 shadow-xl flex flex-col overflow-hidden">
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto scrollbar p-3 space-y-3 bg-slate-50/50"
          >
            {messages.map(msg => {
              const isMine = msg.userId === currentUser?.id || msg.userId === 'local';
              return (
                <div key={msg.id} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="avatar w-8 h-8 flex-shrink-0"
                    style={{ background: msg.color, fontSize: 11 }}
                  >
                    {getInitials(msg.username)}
                  </div>
                  <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className={`text-[11px] text-slate-400 mb-1 flex items-center gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                      <span className="font-medium text-slate-600">{msg.username}</span>
                      <span>{formatTime(msg.timestamp)}</span>
                    </div>
                    <div
                      className={`px-3 py-2 text-sm rounded-2xl ${
                        isMine
                          ? 'bg-indigo-600 text-white rounded-tr-md'
                          : 'bg-white border border-slate-200 text-slate-700 rounded-tl-md shadow-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-100 p-3 bg-white">
            <div className="flex gap-2">
              <button
                className="btn btn-icon btn-sm flex-shrink-0"
                title="表情"
                onClick={() => setInput(prev => prev + '😊')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                </svg>
              </button>
              <input
                className="input flex-1 text-sm py-1.5 bg-slate-50"
                placeholder="输入消息... (Enter发送)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                className="btn btn-primary btn-sm flex-shrink-0 disabled:opacity-50"
                onClick={sendMessage}
                disabled={!input.trim()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ChatButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-80 z-20 w-11 h-11 rounded-full bg-white shadow-lg shadow-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-indigo-600 hover:shadow-xl hover:border-indigo-200 transition-all"
      title="打开聊天"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-semibold border-2 border-white">
        3
      </span>
    </button>
  );
};

export default ChatPanel;
