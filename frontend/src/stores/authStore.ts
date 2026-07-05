import { create } from 'zustand';

interface AuthState {
  token: string | null;
  user: { id: string; email: string; role: string } | null;
  setToken: (token: string) => void;
  setUser: (user: AuthState['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('onx_token'),
  user: null,
  setToken: (token) => {
    localStorage.setItem('onx_token', token);
    set({ token });
  },
  setUser: (user) => set({ user }),
  logout: () => {
    localStorage.removeItem('onx_token');
    set({ token: null, user: null });
  },
}));
