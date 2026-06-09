import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/client';
import { useCanvasStore } from '@/store/canvasStore';
import type { User } from '@/types';

type Mode = 'login' | 'register';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ email: '', username: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const setCurrentUser = useCanvasStore(s => s.setCurrentUser);

  const next = searchParams.get('next');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email) e.email = '请输入邮箱';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = '邮箱格式不正确';
    if (!form.password) e.password = '请输入密码';
    else if (form.password.length < 6) e.password = '密码至少6位';
    if (mode === 'register') {
      if (!form.username) e.username = '请输入用户名';
      else if (form.username.length < 2) e.username = '用户名至少2位';
      if (!form.confirmPassword) e.confirmPassword = '请确认密码';
      else if (form.confirmPassword !== form.password) e.confirmPassword = '两次密码不一致';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setApiError(null);
    try {
      let user: User;
      if (mode === 'login') {
        user = await authApi.login({ email: form.email, password: form.password });
      } else {
        user = await authApi.register({
          email: form.email,
          username: form.username,
          password: form.password,
        });
      }
      setCurrentUser(user);
      navigate(next || '/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || (mode === 'login' ? '登录失败，请检查邮箱和密码' : '注册失败，请稍后再试');
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field: string) =>
    `input w-full py-2.5 ${errors[field] ? 'border-red-400 focus:border-red-500' : ''}`;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-200 rounded-full opacity-30 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-200 rounded-full opacity-30 blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-pink-200 rounded-full opacity-20 blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#000" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M3 9h18M9 21V9" />
              <circle cx="14" cy="5" r="1" />
              <circle cx="18" cy="14" r="1" />
              <path d="M12 14l3 3 4-5" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            Collab Board
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            多人实时协作的在线白板
          </p>
        </div>

        <div className="card shadow-xl shadow-indigo-500/5">
          <div className="flex mb-6 bg-slate-100 rounded-xl p-1">
            {(['login', 'register'] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  mode === m
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => {
                  setMode(m);
                  setErrors({});
                  setApiError(null);
                }}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          {apiError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  用户名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={inputClass('username')}
                  placeholder="请输入用户名"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  disabled={loading}
                  autoComplete="username"
                />
                {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                邮箱 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className={inputClass('email')}
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={loading}
                autoComplete="email"
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                密码 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                className={inputClass('password')}
                placeholder="至少6位字符"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                disabled={loading}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  确认密码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  className={inputClass('confirmPassword')}
                  placeholder="再次输入密码"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  disabled={loading}
                  autoComplete="new-password"
                />
                {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <button type="button" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  忘记密码？
                </button>
              </div>
            )}

            <button
              type="submit"
              className="w-full btn btn-primary py-3 text-base font-semibold shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  {mode === 'login' ? '登录中...' : '注册中...'}
                </span>
              ) : (
                mode === 'login' ? '登录' : '创建账户'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-center text-sm text-slate-500">
              {mode === 'login' ? '还没有账户？' : '已有账户？'}
              <button
                type="button"
                className="ml-1 text-indigo-600 hover:text-indigo-700 font-semibold"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setErrors({});
                  setApiError(null);
                }}
              >
                {mode === 'login' ? '立即注册' : '去登录'}
              </button>
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-white/60 backdrop-blur rounded-xl border border-slate-200">
          <p className="text-xs text-slate-500 text-center">
            💡 想快速体验？点击下方按钮以访客身份进入
          </p>
          <button
            type="button"
            className="mt-3 w-full btn text-sm py-2 hover:bg-slate-50"
            onClick={() => navigate('/dashboard')}
          >
            访客模式浏览 →
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © 2024 Collab Board. 让协作更高效。
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
