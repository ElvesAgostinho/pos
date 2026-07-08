import axios from 'axios';

const baseURL = 'http://localhost:8000/api/'; // URL do Backend Django

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Opcional: Adicionar interceptors para tratar tokens de autenticação (JWT) no futuro
apiClient.interceptors.request.use((config) => {
  // const token = localStorage.getItem('token');
  // if (token) {
  //   config.headers.Authorization = `Bearer ${token}`;
  // }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Tratamento global de erros HTTP
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);
