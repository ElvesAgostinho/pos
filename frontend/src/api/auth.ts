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

/**
 * "ENTRAR AUTOMATICAMENTE" — a preferência, e a regra que a torna segura.
 *
 * A caixa existia no ecrã de login e NÃO FAZIA NADA: o valor era guardado num
 * estado de React e nunca lido por ninguém. Pior, a própria página apagava a
 * sessão ao abrir, por isso entrar sozinho era impossível por construção.
 *
 * Agora é real, e a parte que a torna segura é esta: QUEM SAI DE PROPÓSITO NÃO
 * VOLTA A ENTRAR SOZINHO. Sem isso, "Terminar sessão" devolvia a pessoa ao
 * sistema no segundo seguinte — e numa recepção partilhada isso significa que
 * ninguém consegue sair para o colega entrar com a conta dele.
 */
const AUTO = 'erp_auto_login';

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS),
  /** O dono pediu para entrar sozinho, e há uma sessão guardada para isso. */
  queremosEntrarSozinhos: () =>
    localStorage.getItem(AUTO) === '1' && !!localStorage.getItem(REFRESH),
  /** A ESCOLHA, independente de haver sessão — é o que a caixa mostra.
      Se a sessão expirou, a escolha continua a ser a dele: a caixa aparece
      ligada, ele escreve a palavra-passe uma vez, e volta a entrar sozinho. */
  entradaAutomaticaLigada: () => localStorage.getItem(AUTO) === '1',
  definirEntradaAutomatica: (ligada: boolean) => {
    if (ligada) localStorage.setItem(AUTO, '1');
    else localStorage.removeItem(AUTO);
  },
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
  /** Sair de propósito desliga a entrada automática — ver a nota acima. */
  sairDeProposito: () => {
    localStorage.removeItem(AUTO);
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
      tokenStore.sairDeProposito();
    }
  },

  /**
   * RENOVAR A SESSÃO guardada — é isto que faz a entrada automática funcionar.
   *
   * O token de acesso dura pouco (minutos); o de renovação dura o suficiente
   * para o dono fechar o portátil e voltar no dia seguinte. Se este pedido
   * falhar, a sessão expirou mesmo e mostra-se o formulário — nunca se finge
   * que se entrou.
   */
  renovarSessao: async (): Promise<boolean> => {
    const refresh = tokenStore.getRefresh();
    if (!refresh) return false;
    try {
      const { data } = await apiClient.post<{ access: string; refresh?: string }>(
        'auth/refresh/', { refresh });
      if (!data?.access) return false;
      localStorage.setItem(ACCESS, data.access);
      // O SERVIDOR RODA O TOKEN DE RENOVAÇÃO (ROTATE_REFRESH_TOKENS) e põe o
      // anterior numa lista negra. Guardar o novo não é um detalhe: sem isto, a
      // PRIMEIRA renovação funciona e a segunda falha sempre, porque se estaria
      // a apresentar um token já invalidado. O sintoma seria "a sessão cai ao
      // fim de um bocado, sem razão nenhuma".
      if (data.refresh) localStorage.setItem(REFRESH, data.refresh);
      return true;
    } catch {
      tokenStore.clearBackoffice();
      return false;
    }
  },
};
