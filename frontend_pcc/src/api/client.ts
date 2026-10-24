import axios from 'axios';

// Cliente HTTP do PCC. Anexa o JWT do administrador e trata sessões expiradas.
//
// O ENDEREÇO é uma variável de ambiente de BUILD (Vite), nunca escrito à mão:
// em desenvolvimento (frontend_pcc corre em :5174, backend em :8000, sem proxy)
// usa-se o valor de fábrica; na VPS compila-se com VITE_API_URL=/api/ (relativo)
// — o nginx da VPS serve o SPA e faz proxy de /api/ para o mesmo gunicorn, seja
// qual for o domínio. Sem isto, o browser de quem visitasse a VPS tentava falar
// com o SEU PRÓPRIO computador (localhost:8000), nunca com o servidor real.
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('pcc_access');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // UM FICHEIRO NÃO VIAJA COMO JSON.
  //
  // Este cliente nasce com `Content-Type: application/json` por omissão, e essa
  // omissão aplica-se a TODOS os pedidos. Ao enviar um ficheiro (FormData), o
  // browser precisa de pôr lá o seu próprio tipo, com o separador que divide as
  // partes do formulário — e esse separador é gerado na hora, não se pode
  // escrever à mão. Com o nosso cabeçalho por cima, o separador nunca ia, o
  // servidor não conseguia encontrar o anexo, e respondia "o dado submetido não
  // é um arquivo: certifique-se do tipo de codificação no formulário".
  //
  // Apagá-lo aqui faz o axios deixar o browser preencher. Vale para qualquer
  // envio de ficheiro do PCC, não só o desta página.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete (config.headers as Record<string, unknown>)['Content-Type'];
  }
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
