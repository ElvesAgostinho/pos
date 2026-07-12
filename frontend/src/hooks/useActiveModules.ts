import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export interface LicenseStatus { licensed: boolean; client?: string; license_number?: string; valid_until?: string; modules: string[]; }

// Estado da licença local (on-premises). Sem licença válida = sem acesso à plataforma.
export const useLicenseStatus = () =>
  useQuery({
    queryKey: ['licensing', 'status'],
    queryFn: async (): Promise<LicenseStatus> => (await apiClient.get('licensing/status/')).data,
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
