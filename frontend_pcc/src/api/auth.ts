import { apiClient } from './client';

export interface PccUser {
  id: number;
  username: string;
  name: string;
  email: string;
  is_superuser: boolean;
  is_staff: boolean;
}

const ACCESS = 'pcc_access';
const REFRESH = 'pcc_refresh';
const USER = 'pcc_user';

export const pccAuth = {
  getUser: (): PccUser | null => {
    const raw = localStorage.getItem(USER);
    return raw ? JSON.parse(raw) : null;
  },
  isAuthenticated: () => !!localStorage.getItem(ACCESS) && !!pccAuth.getUser()?.is_staff,

  login: async (username: string, password: string): Promise<PccUser> => {
    const { data } = await apiClient.post('auth/login/', { username, password });
    const user: PccUser = data.user;
    // A consola do fornecedor é restrita a administradores (staff).
    if (!user.is_staff) {
      throw new Error('Acesso restrito a administradores da plataforma.');
    }
    localStorage.setItem(ACCESS, data.access);
    localStorage.setItem(REFRESH, data.refresh);
    localStorage.setItem(USER, JSON.stringify(user));
    return user;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await apiClient.post('auth/change-password/', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return data;
  },

  logout: async () => {
    const refresh = localStorage.getItem(REFRESH);
    try {
      if (refresh) await apiClient.post('auth/logout/', { refresh });
    } finally {
      localStorage.removeItem(ACCESS);
      localStorage.removeItem(REFRESH);
      localStorage.removeItem(USER);
    }
  },
};
