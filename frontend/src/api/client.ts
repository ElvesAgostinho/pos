import axios from 'axios';

const baseURL = 'http://localhost:8000/api/'; // URL do Backend Django

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Anexa o token JWT: backoffice (erp_access) ou, no POS FrontOffice, o token de
// serviço do terminal (pos_access).
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_access') || localStorage.getItem('pos_access');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // PROPRIEDADE ATIVA: todos os pedidos dizem em que hotel se está a trabalhar.
  // O servidor valida (um utilizador nunca vê um hotel a que não tem acesso).
  const hotel = localStorage.getItem('erp_hotel');
  if (hotel) config.headers['X-Hotel-Id'] = hotel;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url || '';
    // Um 401 SEM token anexado não é uma sessão inválida — é uma janela de
    // arranque (a página navegou para /pos/terminal e disparou pedidos no
    // mesmíssimo instante em que o login gravava o token no localStorage).
    // Forçar logout aqui destruía um login que tinha acabado de funcionar:
    // "entra e sai" sem mais nenhum. Só se desconfia da SESSÃO quando o
    // SERVIDOR rejeitou um token que realmente foi enviado.
    const tokenEnviado = !!error.config?.headers?.Authorization;
    // Sessão expirada/ inválida: limpa credenciais e força novo login,
    // exceto nos próprios endpoints de autenticação (evita loops).
    if (status === 401 && tokenEnviado && !url.includes('auth/')) {
      const inPos = window.location.pathname.includes('/pos');
      if (inPos) {
        localStorage.removeItem('pos_operator_token');
        localStorage.removeItem('pos_access');
        if (!window.location.pathname.includes('/login')) window.location.href = '/pos/login';
      } else {
        localStorage.removeItem('erp_access');
        localStorage.removeItem('erp_refresh');
        localStorage.removeItem('erp_user');
        if (!window.location.pathname.includes('/login')) window.location.href = '/backoffice/login';
      }
    }
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);
