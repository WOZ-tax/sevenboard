import { create } from 'zustand';
import type { AuthUser } from './api-types';
import { api, forgetCsrfTokenMemory } from './api';
import { clearCurrentOrgStorage } from './current-org-storage';
import { usePeriodStore } from './period-store';
import { useCopilotStore } from './copilot-store';
import { resetSessionRequests } from './session-requests';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isChecking: boolean;
  sessionVersion: number;
  initialize: () => Promise<void>;
  syncSession: () => void;
  // token 引数は呼び出し側の後方互換のため残すが、JWT は httpOnly Cookie(sb_token)で
  // 管理し localStorage には保存しない。
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  switchOrg: (token: string, user: AuthUser) => void;
}

function loadInitial(): Pick<AuthState, 'user' | 'isAuthenticated' | 'isChecking'> {
  if (typeof window === 'undefined') {
    return { user: null, isAuthenticated: false, isChecking: false };
  }
  // 認証は httpOnly Cookie(sb_token)で行う。JWT は localStorage に保存しない。
  // 旧実装が localStorage に残した 'token' を初期化時に掃除する
  // (マイグレーション。数リリース後に削除してよい)。
  window.localStorage.removeItem('token');
  const userStr = window.localStorage.getItem('user');
  if (!userStr) {
    return { user: null, isAuthenticated: false, isChecking: false };
  }
  // 保存済みの表示名だけでは画面を開かない。Cookie の本人確認後に有効化する。
  try {
    const user = JSON.parse(userStr) as AuthUser;
    if (!user?.id) throw new Error('Missing user');
    return { user, isAuthenticated: false, isChecking: true };
  } catch {
    return { user: null, isAuthenticated: false, isChecking: false };
  }
}

function resetSessionData(): void {
  resetSessionRequests();
  clearCurrentOrgStorage();
  sessionStorage.removeItem('funding-scenarios');
  usePeriodStore.getState().reset();
  useCopilotStore.getState().reset();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadInitial(),
  sessionVersion: 0,
  initialize: async () => {
    const { user, sessionVersion, isChecking } = get();
    if (!isChecking || !user) return;
    try {
      const profile = await api.getProfile();
      if (get().sessionVersion !== sessionVersion) return;
      if (profile.id !== user.id) throw new Error('Session identity changed');
      set({ user: profile, isAuthenticated: true, isChecking: false });
    } catch {
      if (get().sessionVersion !== sessionVersion) return;
      resetSessionData();
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false, isChecking: false, sessionVersion: sessionVersion + 1 });
    }
  },
  syncSession: () => {
    resetSessionData();
    forgetCsrfTokenMemory();
    set((s) => ({ ...loadInitial(), sessionVersion: s.sessionVersion + 1 }));
    void get().initialize();
  },
  login: (_token, user) => {
    resetSessionData();
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('token'); // 旧トークンの掃除 (マイグレーション)
    set((s) => ({ user, isAuthenticated: true, isChecking: false, sessionVersion: s.sessionVersion + 1 }));
  },
  logout: () => {
    resetSessionData();
    // サーバ側の httpOnly Cookie(sb_token/sb_csrf)をクリア。
    // 失敗してもローカル状態は必ず掃除する。
    void api.logout().catch(() => {});
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set((s) => ({ user: null, isAuthenticated: false, isChecking: false, sessionVersion: s.sessionVersion + 1 }));
  },
  switchOrg: (_token, user) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('token'); // 旧トークンの掃除 (マイグレーション)
    set({ user, isAuthenticated: true });
  },
}));
