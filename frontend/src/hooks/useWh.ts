import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { whApi } from '../api/wh';
import type { StockLocation, StockLot, StockTransfer, InventoryCount } from '../api/wh';

type Resource = 'locations' | 'lots' | 'transfers' | 'counts';

function useResource<T>(resource: Resource, params?: Record<string, any>) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ['wh'] });
  const api = whApi[resource] as any;
  return {
    query: useQuery<T[]>({ queryKey: ['wh', resource, params ?? {}], queryFn: () => api.list(params) }),
    create: useMutation({ mutationFn: (p: Partial<T>) => api.create(p), onSuccess: inval }),
    update: useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<T> }) => api.update(id, data), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: number) => api.remove(id), onSuccess: inval }),
  };
}

export const useWhLocations = (params?: Record<string, any>) => useResource<StockLocation>('locations', params);
export const useWhLots = (params?: Record<string, any>) => useResource<StockLot>('lots', params);
export const useWhTransfers = () => useResource<StockTransfer>('transfers');
export const useWhCounts = () => useResource<InventoryCount>('counts');

export const useConfirmTransfer = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => whApi.confirmTransfer(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['wh'] }) });
};
export const useConfirmCount = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => whApi.confirmCount(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['wh'] }) });
};

export const useWhDashboard = () => useQuery({ queryKey: ['wh', 'dashboard'], queryFn: whApi.dashboard });
export const useWhCosting = () => useQuery({ queryKey: ['wh', 'costing'], queryFn: whApi.costing });
export const useWhWarehouses = () => useQuery({ queryKey: ['wh', 'warehouses'], queryFn: whApi.warehouses });
export const useWhItems = (search?: string) => useQuery({ queryKey: ['wh', 'items', search], queryFn: () => whApi.items(search) });
