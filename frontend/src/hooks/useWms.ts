import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wmsApi } from '../api/wms';
import type { WMSWarehouse, WMSLocation } from '../api/wms';

// Warehouses Hooks
export const useWarehouses = () => {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: wmsApi.getWarehouses,
  });
};

export const useCreateWarehouse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wmsApi.createWarehouse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });
};

export const useUpdateWarehouse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WMSWarehouse> }) => 
      wmsApi.updateWarehouse(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });
};

export const useDeleteWarehouse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wmsApi.deleteWarehouse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });
};

// Locations Hooks
export const useLocations = () => {
  return useQuery({
    queryKey: ['locations'],
    queryFn: wmsApi.getLocations,
  });
};

export const useLocationsTree = (warehouseId: string | null) => {
  return useQuery({
    queryKey: ['locations', 'tree', warehouseId],
    queryFn: () => wmsApi.getLocationsTree(warehouseId!),
    enabled: !!warehouseId,
  });
};

export const useCreateLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wmsApi.createLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
};

export const useUpdateLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WMSLocation> }) => 
      wmsApi.updateLocation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
};

export const useDeleteLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wmsApi.deleteLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
};

// BOM Hooks
export const useBoms = () => {
  return useQuery({
    queryKey: ['boms'],
    queryFn: wmsApi.getBoms,
  });
};

export const useCreateBom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wmsApi.createBom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
    },
  });
};

export const useUpdateBom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<import('../api/wms').WMSBillOfMaterials> }) => 
      wmsApi.updateBom(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
    },
  });
};

export const useDeleteBom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wmsApi.deleteBom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
    },
  });
};

export const useStockLevels = () => {
  return useQuery({
    queryKey: ['stock-levels'],
    queryFn: wmsApi.getStockLevels,
  });
};

export const useTransactions = () => {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: wmsApi.getTransactions,
  });
};

export const useCreateTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wmsApi.createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
    },
  });
};
