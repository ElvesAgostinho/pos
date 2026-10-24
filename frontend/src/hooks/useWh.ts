import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { whApi } from '../api/wh';
import type { StockLocation, StockLot, StockTransfer, InventoryCount,
  ProductionOrder, ProductionRequirements } from '../api/wh';

type Resource = 'locations' | 'lots' | 'transfers' | 'counts' | 'orders';

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

export const useWhProductionOrders = (params?: Record<string, any>) => useResource<ProductionOrder>('orders', params);

/** O que a ordem vai gastar. Só se pergunta quando há uma ordem escolhida. */
export const useWhRequirements = (id?: number) => useQuery<ProductionRequirements>({
  queryKey: ['wh', 'requirements', id],
  queryFn: () => whApi.requirements(id as number),
  enabled: !!id,
});

export const useProduce = () => {
  const qc = useQueryClient();
  // Produzir mexe no stock, nos lotes e no custo médio do artigo: o que está em
  // ecrã depois disto é outro — por isso invalida-se tudo, não só as ordens.
  return useMutation({ mutationFn: (id: number) => whApi.produce(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['wh'] }) });
};
export const useCancelOrder = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => whApi.cancelOrder(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['wh'] }) });
};

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
