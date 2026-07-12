import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { warehouseApi } from '../api/warehouse';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['warehouse'] });

export const useWarehouses = () => useQuery({ queryKey: ['warehouse', 'list'], queryFn: warehouseApi.getWarehouses });
export const useCreateWarehouse = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: any) => warehouseApi.createWarehouse(p), onSuccess: () => inval(qc) }); };
export const useStockLevels = (params?: any) => useQuery({ queryKey: ['warehouse', 'stock', params], queryFn: () => warehouseApi.getStockLevels(params) });
export const useMovements = (params?: any) => useQuery({ queryKey: ['warehouse', 'moves', params], queryFn: () => warehouseApi.getMovements(params) });
export const useStockOp = (op: 'receive' | 'issue' | 'transfer' | 'adjust') => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => warehouseApi[op](p), onSuccess: () => inval(qc) });
};
