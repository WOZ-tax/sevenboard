import { create } from 'zustand';
import type { AuthUser } from './api-types';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  switchOrg: (token: string, user: AuthUser) => void;
}

function loadInitial(): Pick<AuthState, 'token' | 'user' | 'isAuthenticated'> {
  if (typeof window === 'undefined') {
    return { token: null, user: null, isAuthenticated: false };
  }
  const token = window.localStorage.getItem('token');
  const userStr = window.localStorage.getItem('user');
  if (!token || !userStr) {
    return { token: null, user: null, isAuthenticated: false };
  }
  try {
    const user = JSON.parse(userStr) as AuthUser;
    return { token, user, isAuthenticated: true };
  } catch {
    return { token: null, user: null, isAuthenticated: false };
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadInitial(),
  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null, isAuthenticated: false });
  },
  switchOrg: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },
}));
