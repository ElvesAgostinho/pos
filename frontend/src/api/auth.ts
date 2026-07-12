import { apiClient } from './client';

// Chaves de armazenamento local
const ACCESS = 'erp_access';
const REFRESH = 'erp_refresh';
const USER = 'erp_user';
const POS_TOKEN = 'pos_operator_token';
const POS_OP = 'pos_operator';
const POS_ACCESS = 'pos_access';

export interface BackofficeUser {
  id: number;
  username: string;
  name: string;
  email: string;
  is_superuser: boolean;
}

export interface Role {
  code: string;
  name: string;
  category?: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: BackofficeUser;
  roles: Role[];
}

export interface PosOperatorIdentity {
  id: number;
  name: string;
  collaborator: string;
  collaborator_code: string;
}

export interface PosLoginResponse {
  token: string;
  access?: string;
  operator: PosOperatorIdentity;
  allowed_workstations: { id: number; name: string }[];
}

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS),
  getRefresh: () => localStorage.getItem(REFRESH),
  getUser: (): BackofficeUser | null => {
    const raw = localStorage.getItem(USER);
    return raw ? JSON.parse(raw) : null;
  },
  setBackoffice: (data: LoginResponse) => {
    localStorage.setItem(ACCESS, data.access);
    localStorage.setItem(REFRESH, data.refresh);
    localStorage.setItem(USER, JSON.stringify(data.user));
  },
  clearBackoffice: () => {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    localStorage.removeItem(USER);
  },

  getPosToken: () => localStorage.getItem(POS_TOKEN),
  getPosOperator: (): PosOperatorIdentity | null => {
    const raw = localStorage.getItem(POS_OP);
    return raw ? JSON.parse(raw) : null;
  },
  getPosAccess: () => localStorage.getItem(POS_ACCESS),
  setPos: (data: PosLoginResponse) => {
    localStorage.setItem(POS_TOKEN, data.token);
    localStorage.setItem(POS_OP, JSON.stringify(data.operator));
    if (data.access) localStorage.setItem(POS_ACCESS, data.access);
  },
  clearPos: () => {
    localStorage.removeItem(POS_TOKEN);
    localStorage.removeItem(POS_OP);
    localStorage.removeItem(POS_ACCESS);
  },
};

export const authApi = {
  backofficeLogin: async (username: string, password: string): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('auth/login/', { username, password });
    tokenStore.setBackoffice(data);
    // Ao entrar, começa SEMPRE no Ambiente de Trabalho (workspace), nunca no clássico.
    try { localStorage.removeItem('ui_shell'); } catch { /* noop */ }
    return data;
  },
  posLogin: async (pin: string, workstationId?: number): Promise<PosLoginResponse> => {
    const { data } = await apiClient.post<PosLoginResponse>('auth/pos-login/', {
      pin, workstation_id: workstationId ?? null,
    });
    tokenStore.setPos(data);
    return data;
  },
  me: async () => {
    const { data } = await apiClient.get('auth/me/');
    return data;
  },
  logout: async () => {
    const refresh = tokenStore.getRefresh();
    try {
      if (refresh) await apiClient.post('auth/logout/', { refresh });
    } finally {
      tokenStore.clearBackoffice();
    }
  },
};
