import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type {
  User, Canvas, CanvasElement, CanvasConnection, FullCanvas,
  Version, Template, Permission, Role, Comment, CommentReply,
  CommentWithReplies, Notification
} from '@/types';
import type { PluginInstallation, PluginPermission } from '@/types/plugin';

const API_BASE = '/api';

const client: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('collab_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('collab_token');
      localStorage.removeItem('collab_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data: { email: string; username: string; password: string }): Promise<User> =>
    client.post('/auth/register', data).then(r => {
      if (r.data.token) {
        localStorage.setItem('collab_token', r.data.token);
        localStorage.setItem('collab_user', JSON.stringify(r.data));
      }
      return r.data;
    }),
  login: (data: { email: string; password: string }): Promise<User> =>
    client.post('/auth/login', data).then(r => {
      if (r.data.token) {
        localStorage.setItem('collab_token', r.data.token);
        localStorage.setItem('collab_user', JSON.stringify(r.data));
      }
      return r.data;
    }),
  me: (): Promise<User> => client.get('/auth/me').then(r => r.data),
  updateMe: (data: Partial<User>): Promise<User> =>
    client.put('/auth/me', data).then(r => r.data),
  logout: () => {
    localStorage.removeItem('collab_token');
    localStorage.removeItem('collab_user');
  },
  getCurrentUser: (): User | null => {
    const raw = localStorage.getItem('collab_user');
    return raw ? JSON.parse(raw) : null;
  },
};

export const canvasApi = {
  list: (): Promise<Canvas[]> => client.get('/canvases').then(r => r.data),
  listPublic: (): Promise<Canvas[]> => client.get('/canvases/public').then(r => r.data),
  get: (id: string, isPublic = false): Promise<FullCanvas> =>
    client.get(isPublic ? `/canvases/${id}/public` : `/canvases/${id}`).then(r => r.data),
  create: (data: Partial<Canvas>): Promise<Canvas> =>
    client.post('/canvases', data).then(r => r.data),
  update: (id: string, data: Partial<Canvas>): Promise<Canvas> =>
    client.put(`/canvases/${id}`, data).then(r => r.data),
  delete: (id: string): Promise<void> => client.delete(`/canvases/${id}`),
  getRole: (id: string): Promise<{ role: Role; userId: string }> =>
    client.get(`/canvases/${id}/role`).then(r => r.data),
  autoSave: (id: string): Promise<void> => client.post(`/canvases/${id}/autosave`),
  exportJson: (id: string): Promise<void> => {
    return client.get(`/canvases/${id}/export/json`, { responseType: 'blob' }).then(r => {
      const blob = new Blob([r.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  },
};

export const elementApi = {
  create: (canvasId: string, el: Partial<CanvasElement>): Promise<CanvasElement> =>
    client.post(`/canvases/${canvasId}/elements`, el).then(r => r.data),
  batchCreate: (canvasId: string, els: Partial<CanvasElement>[]): Promise<CanvasElement[]> =>
    client.post(`/canvases/${canvasId}/elements/batch`, els).then(r => r.data),
  update: (canvasId: string, id: string, el: Partial<CanvasElement>): Promise<CanvasElement> =>
    client.put(`/canvases/${canvasId}/elements/${id}`, el).then(r => r.data),
  delete: (canvasId: string, id: string): Promise<void> =>
    client.delete(`/canvases/${canvasId}/elements/${id}`),
  batchDelete: (canvasId: string, ids: string[]): Promise<void> =>
    client.post(`/canvases/${canvasId}/elements/batch-delete`, { ids }),
  createConnection: (canvasId: string, conn: Partial<CanvasConnection>): Promise<CanvasConnection> =>
    client.post(`/canvases/${canvasId}/connections`, conn).then(r => r.data),
  updateConnection: (canvasId: string, id: string, conn: Partial<CanvasConnection>): Promise<CanvasConnection> =>
    client.put(`/canvases/${canvasId}/connections/${id}`, conn).then(r => r.data),
  deleteConnection: (canvasId: string, id: string): Promise<void> =>
    client.delete(`/canvases/${canvasId}/connections/${id}`),
};

export const versionApi = {
  list: (canvasId: string, branch?: string): Promise<Version[]> =>
    client.get(`/canvases/${canvasId}/versions`, { params: { branch } }).then(r => r.data),
  get: (canvasId: string, id: string): Promise<Version> =>
    client.get(`/canvases/${canvasId}/versions/${id}`).then(r => r.data),
  getSnapshot: (canvasId: string, id: string): Promise<{ elements: any[]; connections: any[] }> =>
    client.get(`/canvases/${canvasId}/versions/${id}/snapshot`).then(r => r.data),
  create: (canvasId: string, summary?: string): Promise<Version> =>
    client.post(`/canvases/${canvasId}/versions`, { summary }).then(r => r.data),
  restore: (canvasId: string, id: string): Promise<Version> =>
    client.post(`/canvases/${canvasId}/versions/${id}/restore`).then(r => r.data),
  createBranch: (canvasId: string, id: string, branchName: string): Promise<Version> =>
    client.post(`/canvases/${canvasId}/versions/${id}/branch`, { branchName }).then(r => r.data),
};

export const templateApi = {
  list: (): Promise<Template[]> => client.get('/templates').then(r => r.data),
  listPublic: (): Promise<Template[]> => client.get('/templates/public').then(r => r.data),
  get: (id: string): Promise<Template> => client.get(`/templates/${id}`).then(r => r.data),
  createFromCanvas: (data: { canvasId: string; name: string; description?: string; category?: string }): Promise<Template> =>
    client.post('/templates', data).then(r => r.data),
  delete: (id: string): Promise<void> => client.delete(`/templates/${id}`),
};

export const permissionApi = {
  list: (canvasId: string): Promise<Permission[]> =>
    client.get(`/canvases/${canvasId}/permissions`).then(r => r.data),
  add: (canvasId: string, data: Partial<Permission>): Promise<Permission> =>
    client.post(`/canvases/${canvasId}/permissions`, data).then(r => r.data),
  updateRole: (canvasId: string, id: string, role: Role): Promise<Permission> =>
    client.put(`/canvases/${canvasId}/permissions/${id}/role`, { role }).then(r => r.data),
  remove: (canvasId: string, id: string): Promise<void> =>
    client.delete(`/canvases/${canvasId}/permissions/${id}`),
  acceptInvite: (token: string): Promise<Permission> =>
    client.post(`/invitations/accept/${token}`).then(r => r.data),
};

export const commentApi = {
  list: (canvasId: string): Promise<Comment[]> =>
    client.get(`/canvases/${canvasId}/comments`).then(r => r.data),
  create: (canvasId: string, data: {
    anchorX: number;
    anchorY: number;
    attachedElementId?: string;
    content?: string;
  }): Promise<CommentWithReplies> =>
    client.post(`/canvases/${canvasId}/comments`, data).then(r => r.data),
  getWithReplies: (id: string): Promise<CommentWithReplies> =>
    client.get(`/comments/${id}`).then(r => r.data),
  addReply: (commentId: string, content: string): Promise<CommentReply> =>
    client.post(`/comments/${commentId}/replies`, { content }).then(r => r.data),
};

export const notificationApi = {
  list: (): Promise<Notification[]> =>
    client.get('/notifications').then(r => r.data),
  unreadCount: (): Promise<{ count: number }> =>
    client.get('/notifications/unread-count').then(r => r.data),
  markRead: (id: string): Promise<Notification> =>
    client.put(`/notifications/${id}/read`).then(r => r.data),
  markAllRead: (): Promise<void> =>
    client.put('/notifications/read-all'),
};

export interface PluginInstallRequest {
  pluginName: string;
  pluginVersion: string;
  permissions: PluginPermission[];
}

export const pluginApi = {
  list: (canvasId: string): Promise<PluginInstallation[]> =>
    client.get(`/canvases/${canvasId}/plugins`).then(r => r.data),
  install: (canvasId: string, data: PluginInstallRequest): Promise<PluginInstallation> =>
    client.post(`/canvases/${canvasId}/plugins`, data).then(r => r.data),
  toggle: (canvasId: string, name: string): Promise<PluginInstallation> =>
    client.put(`/canvases/${canvasId}/plugins/${name}/toggle`).then(r => r.data),
  uninstall: (canvasId: string, name: string): Promise<void> =>
    client.delete(`/canvases/${canvasId}/plugins/${name}`),
  getConfig: (canvasId: string, pluginName: string): Promise<Array<{configKey: string; configValue: any}>> =>
    client.get(`/canvases/${canvasId}/plugins/${pluginName}/config`).then(r => r.data),
  updateConfig: (canvasId: string, pluginName: string, configs: Array<{configKey: string; configValue: any}>): Promise<Array<{configKey: string; configValue: any}>> =>
    client.put(`/canvases/${canvasId}/plugins/${pluginName}/config`, configs).then(r => r.data),
};

export default client;
