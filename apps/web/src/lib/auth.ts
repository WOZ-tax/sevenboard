import { create } from 'zustand';
import type { AuthUser } from './api-types';
import { api, setCsrfToken } from './api';
import { clearCurrentOrgStorage } from './current-org-storage';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  // token 引数は呼び出し側の後方互換のため残すが、JWT は httpOnly Cookie(sb_token)で
  // 管理し localStorage には保存しない。
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  switchOrg: (token: string, user: AuthUser) => void;
}

function loadInitial(): Pick<AuthState, 'user' | 'isAuthenticated'> {
  if (typeof window === 'undefined') {
    return { user: null, isAuthenticated: false };
  }
  // 認証は httpOnly Cookie(sb_token)で行う。JWT は localStorage に保存しない。
  // 旧実装が localStorage に残した 'token' を初期化時に掃除する
  // (マイグレーション。数リリース後に削除してよい)。
  window.localStorage.removeItem('token');
  const userStr = window.localStorage.getItem('user');
  if (!userStr) {
    return { user: null, isAuthenticated: false };
  }
  // 'user' は表示用途のみ。実効的な認証判定は API 呼び出しの 401 で検出し、
  // apiFetch の 401 ハンドラが localStorage を掃除して /login にリダイレクトする。
  try {
    const user = JSON.parse(userStr) as AuthUser;
    return { user, isAuthenticated: true };
  } catch {
    return { user: null, isAuthenticated: false };
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadInitial(),
  login: (_token, user) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('token'); // 旧トークンの掃除 (マイグレーション)
    set({ user, isAuthenticated: true });
  },
  logout: () => {
    // サーバ側の httpOnly Cookie(sb_token/sb_csrf)をクリア。
    // 失敗してもローカル状態は必ず掃除する。
    void api.logout().catch(() => {});
    setCsrfToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    clearCurrentOrgStorage();
    set({ user: null, isAuthenticated: false });
  },
  switchOrg: (_token, user) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('token'); // 旧トークンの掃除 (マイグレーション)
    set({ user, isAuthenticated: true });
  },
}));
