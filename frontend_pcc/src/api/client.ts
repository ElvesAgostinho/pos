import axios from 'axios';

// Cliente HTTP do PCC. Anexa o JWT do administrador e trata sessões expiradas.
export const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api/',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('pcc_access');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url || '';
    if ((status === 401 || status === 403) && !url.includes('auth/')) {
      localStorage.removeItem('pcc_access');
      localStorage.removeItem('pcc_refresh');
      localStorage.removeItem('pcc_user');
      if (window.location.pathname !== '/') window.location.href = '/';
      else window.location.reload();
    }
    return Promise.reject(error);
  }
);
