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
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url || '';
    // Sessão expirada/ inválida: limpa credenciais e força novo login,
    // exceto nos próprios endpoints de autenticação (evita loops).
    if (status === 401 && !url.includes('auth/')) {
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
