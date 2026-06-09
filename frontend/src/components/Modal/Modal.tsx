import React, { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
  maxWidth?: string;
  closable?: boolean;
  maskClosable?: boolean;
  className?: string;
  bodyClassName?: string;
}

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
  maxWidth,
  closable = true,
  maskClosable = true,
  className = '',
  bodyClassName = '',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closable) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closable, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center p-4">
      <div
        className="modal-overlay"
        onClick={() => {
          if (maskClosable && closable) {
            onClose();
          }
        }}
        style={{ zIndex: 1000 }}
      />
      <div
        ref={dialogRef}
        className={`relative bg-white rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-80px)] ${className}`}
        style={{
          width,
          maxWidth: maxWidth || '90vw',
          animation: 'modalIn 0.2s ease-out',
          zIndex: 1001,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes modalIn {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
        {(title || closable) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="text-lg font-semibold text-slate-800 pr-8">{title}</div>
            {closable && (
              <button
                className="absolute top-3.5 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                onClick={onClose}
                title="关闭"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className={`px-6 py-5 overflow-y-auto scrollbar flex-1 ${bodyClassName}`}>
          {children}
        </div>
        {footer !== undefined && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/50 rounded-b-2xl">
            {footer || (
              <button className="btn" onClick={onClose}>关闭</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  content: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmType?: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = '确认操作',
  content,
  confirmText = '确认',
  cancelText = '取消',
  confirmType = 'primary',
  onConfirm,
  onCancel,
  loading = false,
}) => {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={confirmType === 'danger' ? '#EF4444' : '#6366F1'} strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          {title}
        </div>
      }
      width={420}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button
            className={`btn ${confirmType === 'danger' ? 'btn-danger' : 'btn-primary'} min-w-[88px]`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                处理中
              </span>
            ) : confirmText}
          </button>
        </>
      }
    >
      <div className="text-slate-600">{content}</div>
    </Modal>
  );
};

export default Modal;
