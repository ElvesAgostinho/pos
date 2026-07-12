import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fnbApi } from '../api/fnb';

type Resource = 'menus' | 'menuItems' | 'events' | 'haccp' | 'waste' | 'quality';

// Fábrica de hooks CRUD para um recurso F&B (lista + criar + atualizar + apagar).
function useResource<T>(resource: Resource, params?: Record<string, any>) {
  const qc = useQueryClient();
  const key = ['fnb', resource, params ?? {}];
  const inval = () => qc.invalidateQueries({ queryKey: ['fnb', resource] });
  const api = fnbApi[resource] as any;

  return {
    query: useQuery<T[]>({ queryKey: key, queryFn: () => api.list(params) }),
    create: useMutation({ mutationFn: (p: Partial<T>) => api.create(p), onSuccess: inval }),
    update: useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<T> }) => api.update(id, data), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: number) => api.remove(id), onSuccess: inval }),
  };
}

export const useFnbMenus = (params?: Record<string, any>) => useResource('menus', params);
export const useFnbMenuItems = (menu?: number) => useResource('menuItems', menu ? { menu } : undefined);
export const useFnbEvents = (params?: Record<string, any>) => useResource('events', params);
export const useHaccp = (params?: Record<string, any>) => useResource('haccp', params);
export const useWaste = (params?: Record<string, any>) => useResource('waste', params);
export const useQuality = (params?: Record<string, any>) => useResource('quality', params);

// Endpoints agregados
export const useFnbDashboard = () =>
  useQuery({ queryKey: ['fnb', 'dashboard'], queryFn: fnbApi.dashboard });
export const useFnbOutlets = (type?: string) =>
  useQuery({ queryKey: ['fnb', 'outlets', type], queryFn: () => fnbApi.outlets(type) });
export const useFnbTiming = () =>
  useQuery({ queryKey: ['fnb', 'timing'], queryFn: fnbApi.timing });
export const useFnbReports = () =>
  useQuery({ queryKey: ['fnb', 'reports'], queryFn: fnbApi.reports });

// Lookups
export const useFnbAreas = () => useQuery({ queryKey: ['fnb', 'areas'], queryFn: fnbApi.areas });
export const useFnbUoms = () => useQuery({ queryKey: ['fnb', 'uoms'], queryFn: fnbApi.uoms });
export const useFnbItems = (search?: string) =>
  useQuery({ queryKey: ['fnb', 'items', search], queryFn: () => fnbApi.items(search) });
