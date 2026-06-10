import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import type { CollabMessage, OnlineUser, UUID, CanvasElement, CanvasConnection, Comment, CommentReply, Notification } from '@/types';
import { useCanvasStore } from '@/store/canvasStore';
import { uid } from '@/utils';

export interface OpHandlers {
  onAck?: (opId: string, success: boolean, result?: any, error?: string) => void;
  onPresence?: (type: 'JOIN' | 'LEAVE', user: OnlineUser, all: OnlineUser[]) => void;
  onCursor?: (userId: string, x: number, y: number) => void;
  onSelection?: (userId: string, selection: string[]) => void;
  onRemoteOp?: (msg: CollabMessage) => void;
}

export class CollabClient {
  private client: Client | null = null;
  private canvasId: string | null = null;
  private subscriptions: StompSubscription[] = [];
  private handlers: OpHandlers = {};
  private connected = false;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnect = 10;

  setHandlers(handlers: Partial<OpHandlers>) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  private notificationSubscribed = false;
  private notificationSub: StompSubscription | null = null;

  private setupNotificationSubscription() {
    if (!this.client || !this.token || this.notificationSubscribed) return;
    try {
      this.notificationSub = this.client.subscribe(`/user/queue/notifications`, (msg: IMessage) => {
        try {
          const notification: Notification = JSON.parse(msg.body);
          console.log('[Notification] Received:', notification);
          const store = useCanvasStore.getState();
          store.addNotification(notification);
        } catch (e) {
          console.error('Notification parse error', e);
        }
      });
      this.notificationSubscribed = true;
      console.log('[Notification] Subscribed to /user/queue/notifications');
    } catch (e) {
      console.error('[Notification] Failed to subscribe:', e);
    }
  }

  connect(canvasId: string, token: string | null = null): Promise<void> {
    this.canvasId = canvasId;
    this.token = token || localStorage.getItem('collab_token');
    this.reconnectAttempts = 0;

    return new Promise((resolve, reject) => {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
      const httpUrl = `${window.location.origin}/ws`;

      const brokerURL = this.token ? `${wsUrl}?token=${encodeURIComponent(this.token)}` : wsUrl;

      this.client = new Client({
        brokerURL,
        connectHeaders: this.token ? { Authorization: `Bearer ${this.token}` } : {},
        webSocketFactory: () => {
          return new SockJS(this.token
            ? `${httpUrl}?token=${encodeURIComponent(this.token)}`
            : httpUrl);
        },
        reconnectDelay: 3000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        onConnect: () => {
          console.log('[Collab] Connected to canvas:', canvasId);
          this.connected = true;
          this.reconnectAttempts = 0;
          this.setupSubscriptions();
          this.setupNotificationSubscription();
          resolve();
        },
        onStompError: (frame) => {
          console.error('[Collab] STOMP error:', frame);
          reject(new Error(frame.headers?.message || 'STOMP error'));
        },
        onDisconnect: () => {
          console.log('[Collab] Disconnected');
          this.connected = false;
          this.reconnectAttempts++;
        },
        onWebSocketClose: () => {
          console.log('[Collab] WS close');
          this.connected = false;
        },
        onWebSocketError: (err) => {
          console.error('[Collab] WS error:', err);
        },
        debug: (str) => {
          if (str.includes('error') || str.includes('Error')) {
            console.debug('[Collab debug]', str);
          }
        },
      });

      try {
        this.client.activate();
      } catch (e) {
        reject(e);
      }
    });
  }

  private setupSubscriptions() {
    if (!this.client || !this.canvasId) return;
    this.subscriptions.forEach(s => { try { s.unsubscribe(); } catch {} });
    this.subscriptions = [];

    const cid = this.canvasId;

    this.subscriptions.push(
      this.client.subscribe(`/topic/canvas/${cid}/operations`, (msg: IMessage) => {
        try {
          const parsed: CollabMessage = JSON.parse(msg.body);
          const store = useCanvasStore.getState();
          if (parsed.userId && parsed.userId !== store.currentUser?.id) {
            store.applyRemoteOp(parsed);
            this.handlers.onRemoteOp?.(parsed);
          }
        } catch (e) {
          console.error('Parse op error', e);
        }
      })
    );

    this.subscriptions.push(
      this.client.subscribe(`/topic/canvas/${cid}/presence`, (msg: IMessage) => {
        try {
          const parsed = JSON.parse(msg.body);
          const store = useCanvasStore.getState();
          if (parsed.type === 'JOIN' && parsed.allUsers) {
            store.setOnlineUsers(parsed.allUsers);
          } else if (parsed.type === 'LEAVE' && parsed.user?.userId) {
            store.removeOnlineUser(parsed.user.userId);
          }
          this.handlers.onPresence?.(parsed.type, parsed.user, parsed.allUsers || []);
        } catch (e) {
          console.error('Parse presence error', e);
        }
      })
    );

    this.subscriptions.push(
      this.client.subscribe(`/topic/canvas/${cid}/cursors`, (msg: IMessage) => {
        try {
          const parsed = JSON.parse(msg.body);
          const store = useCanvasStore.getState();
          if (parsed.userId !== store.currentUser?.id) {
            store.setRemoteCursor(parsed.userId, parsed.x, parsed.y);
            this.handlers.onCursor?.(parsed.userId, parsed.x, parsed.y);
          }
        } catch (e) {}
      })
    );

    this.subscriptions.push(
      this.client.subscribe(`/topic/canvas/${cid}/selections`, (msg: IMessage) => {
        try {
          const parsed = JSON.parse(msg.body);
          const store = useCanvasStore.getState();
          if (parsed.userId !== store.currentUser?.id) {
            store.setRemoteSelection(parsed.userId, parsed.selection || []);
            this.handlers.onSelection?.(parsed.userId, parsed.selection || []);
          }
        } catch (e) {}
      })
    );

    if (this.token) {
      const myId = useCanvasStore.getState().currentUser?.id;
      if (myId) {
        this.subscriptions.push(
          this.client.subscribe(`/user/queue/canvas/${cid}/ack`, (msg: IMessage) => {
            try {
              const parsed = JSON.parse(msg.body);
              const store = useCanvasStore.getState();
              store.removePendingOp(parsed.opId);
              if (parsed.success && parsed.result) {
                const r = parsed.result;
                if (r && r.id) {
                  if (store.elements.has(r.id)) {
                    store.updateElement(r.id, r as Partial<CanvasElement>);
                  } else if (!store.modifyingIds.has(r.id)) {
                    store.addElement(r as CanvasElement);
                  }
                }
                if (r && r.fromElementId && r.toElementId) {
                  if (store.connections.has(r.id)) {
                    store.updateConnection(r.id, r as Partial<CanvasConnection>);
                  } else {
                    store.addConnection(r as CanvasConnection);
                  }
                }
                if (r && Array.isArray(r.elements)) {
                  const updates = (r.elements as CanvasElement[]);
                  updates.forEach(e => {
                    if (store.elements.has(e.id)) {
                      store.updateElement(e.id, e);
                    } else {
                      store.addElement(e);
                    }
                  });
                }
              }
              this.handlers.onAck?.(parsed.opId, parsed.success, parsed.result, parsed.error);
            } catch (e) {
              console.error('ACK parse error', e);
            }
          })
        );
      }
    }

    this.subscriptions.push(
      this.client.subscribe(`/topic/canvas/${cid}/comments`, (msg: IMessage) => {
        try {
          const parsed = JSON.parse(msg.body);
          const store = useCanvasStore.getState();
          const currentUserId = store.currentUser?.id;

          if (parsed.type === 'COMMENT_CREATED' && parsed.comment) {
            const comment = parsed.comment as Comment;
            if (comment.createdBy !== currentUserId) {
              store.addComment(comment);
            }
          } else if (parsed.type === 'REPLY_CREATED' && parsed.reply) {
            const reply = parsed.reply as CommentReply;
            const commentId = parsed.commentId as string;
            if (reply.userId !== currentUserId) {
              if (store.commentReplies.has(commentId)) {
                store.addCommentReply(commentId, reply);
              } else {
                store.updateComment(commentId, { replyCount: (store.comments.get(commentId)?.replyCount || 0) + 1 });
              }
            }
          }
        } catch (e) {
          console.error('Comment event parse error', e);
        }
      })
    );
  }

  disconnect() {
    this.subscriptions.forEach(s => { try { s.unsubscribe(); } catch {} });
    this.subscriptions = [];
    if (this.client) {
      try { this.client.deactivate(); } catch {}
      this.client = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.client?.connected === true;
  }

  sendOperation(type: string, payload: Record<string, any>): string {
    const opId = uid();
    const ts = Date.now();

    const stampedPayload = { ...payload };
    if ((type === 'CREATE_ELEMENT' || type === 'UPDATE_ELEMENT') && stampedPayload.id) {
      stampedPayload.operationTimestamp = ts;
    }
    if (type === 'BATCH_CREATE_ELEMENTS' && Array.isArray(stampedPayload.elements)) {
      stampedPayload.elements = stampedPayload.elements.map((e: any) => ({ ...e, operationTimestamp: ts }));
    }
    if ((type === 'CREATE_CONNECTION' || type === 'UPDATE_CONNECTION') && stampedPayload.id) {
      stampedPayload.operationTimestamp = ts;
    }

    const msg: CollabMessage = {
      opId,
      type,
      timestamp: ts,
      payload: stampedPayload,
    };

    const store = useCanvasStore.getState();
    if (store.currentUser?.id) {
      msg.userId = store.currentUser.id;
    }

    if (this.isConnected() && this.client) {
      store.addPendingOp(opId, msg);
      this.client.publish({
        destination: `/app/canvas/${this.canvasId}/op`,
        body: JSON.stringify(msg),
      });
    }
    return opId;
  }

  sendCursor(x: number, y: number) {
    if (!this.isConnected() || !this.client) return;
    this.client.publish({
      destination: `/app/canvas/${this.canvasId}/cursor`,
      body: JSON.stringify({ x, y }),
    });
  }

  sendSelection(selection: string[]) {
    if (!this.isConnected() || !this.client) return;
    this.client.publish({
      destination: `/app/canvas/${this.canvasId}/selection`,
      body: JSON.stringify({ selection }),
    });
  }

  sendViewport(x: number, y: number, zoom: number) {
    if (!this.isConnected() || !this.client) return;
    this.client.publish({
      destination: `/app/canvas/${this.canvasId}/viewport`,
      body: JSON.stringify({ x, y, zoom }),
    });
  }

  sendAutoSave() {
    this.sendOperation('AUTO_SAVE', {});
  }
}

export const collabClient = new CollabClient();
