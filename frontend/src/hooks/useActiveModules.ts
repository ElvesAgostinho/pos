import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export interface LicenseStatus { licensed: boolean; client?: string; license_number?: string; valid_until?: string; modules: string[]; }

// Estado da licença local (on-premises). Sem licença válida = sem acesso à plataforma.
export const useLicenseStatus = () =>
  useQuery({
    queryKey: ['licensing', 'status'],
    // Pedido LIMPO, fora do apiClient: a licença valida-se ANTES do login, e o
    // interceptor do apiClient cola sempre o token guardado no browser. Um token velho
    // fazia o DRF responder 401 e o ecrã lia isso como "servidor em baixo" — o servidor
    // estava de pé; o token é que estava podre.
    queryFn: async (): Promise<LicenseStatus> => {
      const base = (apiClient.defaults.baseURL || '/api/').replace(/\/?$/, '/');
      const r = await fetch(`${base}licensing/status/`);
      if (!r.ok) throw new Error(`licenca: ${r.status}`);
      return r.json();
    },
    staleTime: 60 * 1000,
    retry: false,
  });

// Funcionalidades (feature flags) ativas — licenciamento dentro do módulo.
export interface FeaturesResp { catalog: any[]; active: string[]; }
export const useFeatures = () =>
  useQuery({
    queryKey: ['licensing', 'features'],
    queryFn: async (): Promise<FeaturesResp> => (await apiClient.get('licensing/features/')).data,
    staleTime: 5 * 60 * 1000,
  });

export interface ActiveModules { active: string[]; core: string[]; catalog: any[]; }

// Módulos ativados pela licença (o dono ativa/desativa). Cai para "tudo" em caso de erro.
export const useActiveModules = () =>
  useQuery({
    queryKey: ['licensing', 'active-modules'],
    queryFn: async (): Promise<ActiveModules> => (await apiClient.get('licensing/active-modules/')).data,
    staleTime: 5 * 60 * 1000,
  });

// Acessos do utilizador ATUAL (permissões por perfil). full=true → vê tudo.
// Em erro, cai para acesso total (fail-open) para não trancar ninguém.
export interface MyAccess { full: boolean; modules: string[]; screens: string[]; is_superuser: boolean; }
export const useMyAccess = () =>
  useQuery({
    queryKey: ['auth', 'access'],
    queryFn: async (): Promise<MyAccess> => {
      try { return (await apiClient.get('auth/access/')).data; }
      catch { return { full: true, modules: [], screens: [], is_superuser: false }; }
    },
    staleTime: 5 * 60 * 1000,
  });

// Nº de certificação AGT — vem SEMPRE de fiscal.FiscalConfig (a mesma fonte que já
// assina as faturas e o SAF-T), nunca de texto fixo no código. '0000' é o valor de
// fábrica (ainda não certificado) — mostra-se como tal, honestamente, não se esconde
// nem se finge um número. Assim que o PCC aplicar a certificação real (Sincronizar
// com o PCC), este hook reflete-a sozinho, em qualquer ecrã que o use.
export interface AgtCertificate { certificate_number: string; certified: boolean; environment?: string }
export const useAgtCertificate = () =>
  useQuery({
    queryKey: ['fiscal', 'certificate'],
    queryFn: async (): Promise<AgtCertificate> => {
      const r = await apiClient.get('fiscal/config/');
      const cfg = (r.data?.results || r.data || [])[0] || {};
      const num = cfg.certificate_number || '0000';
      return { certificate_number: num, certified: num !== '0000', environment: cfg.environment };
    },
    staleTime: 60 * 1000,
  });
