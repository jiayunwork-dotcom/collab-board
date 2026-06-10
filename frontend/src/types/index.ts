export type UUID = string;

export interface User {
  id: UUID;
  email: string;
  username: string;
  avatarUrl?: string;
  color: string;
  token?: string;
}

export interface Canvas {
  id: UUID;
  ownerId: UUID;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  backgroundType: 'SOLID' | 'GRID_DOTS' | 'GRID_LINES';
  backgroundColor: string;
  gridSize: number;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
  createdAt: string;
  updatedAt: string;
}

export type ElementType =
  | 'freehand'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'diamond'
  | 'polygon'
  | 'text'
  | 'sticky_note'
  | 'image'
  | 'mindnode'
  | 'group';

export interface CanvasElement {
  id: UUID;
  canvasId?: UUID;
  parentId?: UUID;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  groupId?: UUID;
  data: ElementData;
  versionVector?: Record<string, number>;
  lastModifiedBy?: UUID;
  lastModifiedAt?: string;
  createdAt?: string;
}

export interface ElementData {
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  points?: Array<{ x: number; y: number }>;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  noteColor?: string;
  imageUrl?: string;
  imageData?: string;
  collapsed?: boolean;
  mindMapLevel?: number;
  shape?: 'rectangle' | 'rounded' | 'ellipse' | 'diamond';
  borderRadius?: number;
}

export interface CanvasConnection {
  id: UUID;
  canvasId?: UUID;
  fromElementId: UUID;
  toElementId: UUID;
  fromPoint: string;
  toPoint: string;
  style: 'line' | 'polyline' | 'curve';
  arrowStyle: 'none' | 'start' | 'end' | 'both';
  color: string;
  thickness: number;
  label?: string;
  waypoints: Array<{ x: number; y: number }>;
  zIndex: number;
  versionVector?: Record<string, number>;
  createdAt?: string;
  updatedAt?: string;
}

export type Tool =
  | 'select'
  | 'pan'
  | 'freehand'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'diamond'
  | 'polygon'
  | 'text'
  | 'sticky_note'
  | 'image'
  | 'mindnode'
  | 'connection'
  | 'comment';

export interface Comment {
  id: UUID;
  canvasId: UUID;
  anchorX: number;
  anchorY: number;
  attachedElementId?: UUID;
  createdBy: UUID;
  createdByName?: string;
  createdByAvatar?: string;
  createdByColor?: string;
  createdAt: string;
  replyCount: number;
}

export interface CommentReply {
  id: UUID;
  commentId: UUID;
  userId: UUID;
  username?: string;
  userAvatar?: string;
  userColor?: string;
  content: string;
  mentions: UUID[];
  createdAt: string;
}

export interface CommentWithReplies {
  comment: Comment;
  replies: CommentReply[];
}

export interface MentionUser {
  id: UUID;
  username: string;
  avatarUrl?: string;
  color: string;
}

export type NotificationType = 'MENTION' | string;

export interface Notification {
  id: UUID;
  userId: UUID;
  type: NotificationType;
  payload: {
    commentId?: UUID;
    canvasId?: UUID;
    canvasTitle?: string;
    fromUserId?: UUID;
    fromUserName?: string;
    content?: string;
    anchorX?: number;
    anchorY?: number;
    [key: string]: any;
  };
  isRead: boolean;
  createdAt: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface OnlineUser {
  userId: UUID;
  username: string;
  avatarUrl?: string;
  color: string;
  cursorX: number;
  cursorY: number;
  canvasId?: UUID;
  selection: UUID[];
  lastActive: number;
}

export interface CollabMessage {
  opId?: string;
  type: string;
  userId?: UUID;
  timestamp: number;
  payload: Record<string, any>;
}

export interface Version {
  id: UUID;
  canvasId: UUID;
  versionNumber: number;
  branchName: string;
  parentVersionId?: UUID;
  createdBy?: UUID;
  createdByName?: string;
  summary: string;
  operations?: any[];
  createdAt: string;
}

export interface Template {
  id: UUID;
  name: string;
  description: string;
  category: string;
  thumbnailUrl?: string;
  isBuiltin: boolean;
  createdBy?: UUID;
  data: {
    elements: any[];
    connections: any[];
    backgroundType?: string;
    backgroundColor?: string;
  };
  createdAt: string;
}

export type Role = 'OWNER' | 'EDITOR' | 'COMMENTER' | 'VIEWER';

export interface Permission {
  id: UUID;
  canvasId: UUID;
  userId?: UUID;
  username?: string;
  userAvatar?: string;
  role: Role;
  inviteEmail?: string;
  inviteToken?: string;
  inviteExpiresAt?: string;
  createdAt: string;
}

export interface FullCanvas {
  canvas: Canvas;
  elements: CanvasElement[];
  connections: CanvasConnection[];
  viewport: { x: number; y: number; zoom: number };
}
