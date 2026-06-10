import React, { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import { commentApi } from '@/api/client';
import { worldToScreen } from '@/canvas/geometry';
import type { Comment } from '@/types';
import CommentPanel from './CommentPanel';

const ANCHOR_SIZE = 32;

const CommentLayer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerRect, setContainerRect] = useState<{ width: number; height: number } | null>(null);

  const {
    viewport,
    comments,
    openCommentId,
    setOpenCommentId,
    elements,
    currentCanvas,
    setComments,
    setCommentReplies,
    addComment,
    currentTool,
    canvasRole,
  } = useCanvasStore();

  const canvasId = currentCanvas?.canvas.id;
  const canComment = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';

  useEffect(() => {
    if (!canvasId) return;
    commentApi.list(canvasId)
      .then(data => {
        setComments(data);
      })
      .catch(e => console.error('Failed to load comments', e));
  }, [canvasId, setComments]);

  useEffect(() => {
    const updateRect = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setContainerRect({ width: r.width, height: r.height });
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, []);

  useEffect(() => {
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length > 0) {
      canvasRef.current = canvases[0] as HTMLCanvasElement;
    }
  }, []);

  const getAnchorPosition = (comment: Comment): { x: number; y: number } => {
    let wx = comment.anchorX ?? 0;
    let wy = comment.anchorY ?? 0;
    if (comment.attachedElementId) {
      const elId = String(comment.attachedElementId);
      const el = elements.get(elId);
      if (el) {
        wx = el.x + (el.width || 0);
        wy = el.y ?? 0;
      }
    }
    const screen = worldToScreen(wx, wy, viewport);
    return { x: screen.x, y: screen.y };
  };

  const openComment = comments.get(openCommentId || '');
  const openPos = openComment ? getAnchorPosition(openComment) : null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ cursor: currentTool === 'comment' && canComment ? 'copy' : undefined }}
    >
      {[...comments.values()].map(comment => {
        const pos = getAnchorPosition(comment);
        if (!containerRect) return null;
        if (pos.x < -50 || pos.x > containerRect.width + 50) return null;
        if (pos.y < -50 || pos.y > containerRect.height + 50) return null;
        const isOpen = comment.id === openCommentId;
        const color = comment.createdByColor || '#4F46E5';
        const count = comment.replyCount || 0;

        return (
          <div
            key={comment.id}
            className="absolute pointer-events-auto comment-anchor"
            style={{
              left: pos.x - ANCHOR_SIZE / 2,
              top: pos.y - ANCHOR_SIZE / 2,
              width: ANCHOR_SIZE,
              height: ANCHOR_SIZE,
              zIndex: isOpen ? 1000 : 500,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isOpen) {
                setOpenCommentId(null);
              } else {
                setOpenCommentId(comment.id);
                if (!useCanvasStore.getState().commentReplies.has(comment.id)) {
                  commentApi.getWithReplies(comment.id)
                    .then(data => {
                      setCommentReplies(comment.id, data.replies);
                    })
                    .catch(console.error);
                }
              }
            }}
          >
            <div
              className={`w-full h-full rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg transition-all ${isOpen ? 'scale-110 ring-2 ring-white ring-offset-1' : 'hover:scale-105'}`}
              style={{
                background: color,
                boxShadow: `0 2px 8px ${color}40`,
              }}
            >
              {count > 0 ? count : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              )}
            </div>
          </div>
        );
      })}

      {openComment && openPos && (
        <CommentPanel
          comment={openComment}
          position={openPos}
          onClose={() => setOpenCommentId(null)}
        />
      )}
    </div>
  );
};

export default CommentLayer;
