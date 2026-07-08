import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { posApi } from '../api/pos';
import type { Outlet, ItemPOSProfile, POSTerminal } from '../api/pos';

// --- OUTLETS ---
export const useOutlets = () => {
  return useQuery({
    queryKey: ['outlets'],
    queryFn: posApi.getOutlets,
  });
};

export const useCreateOutlet = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Outlet>) => posApi.createOutlet(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outlets'] }),
  });
};

export const useUpdateOutlet = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Outlet> }) => posApi.updateOutlet(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outlets'] }),
  });
};

export const useDeleteOutlet = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => posApi.deleteOutlet(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outlets'] }),
  });
};

// --- TERMINALS ---
export const useTerminals = () => {
  return useQuery({
    queryKey: ['terminals'],
    queryFn: posApi.getTerminals,
  });
};

export const useCreateTerminal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<POSTerminal>) => posApi.createTerminal(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['terminals'] }),
  });
};

export const useUpdateTerminal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<POSTerminal> }) => posApi.updateTerminal(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['terminals'] }),
  });
};

export const useDeleteTerminal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => posApi.deleteTerminal(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['terminals'] }),
  });
};

// --- POS PROFILES ---
export const usePOSProfiles = () => {
  return useQuery({
    queryKey: ['pos_profiles'],
    queryFn: posApi.getProfiles,
  });
};

export const useCreatePOSProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ItemPOSProfile>) => posApi.createProfile(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pos_profiles'] }),
  });
};

export const useUpdatePOSProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ItemPOSProfile> }) => posApi.updateProfile(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pos_profiles'] }),
  });
};

export const useDeletePOSProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => posApi.deleteProfile(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pos_profiles'] }),
  });
};

// ==========================================
// FASE C: Configuração da Operação
// ==========================================

import type { POSOperationConfig, POSDiningTable, POSPaymentMethod, POSOrderType } from '../api/pos';

// --- OPERATION CONFIGS ---
export const useOperationConfigs = () => {
  return useQuery({
    queryKey: ['operation_configs'],
    queryFn: posApi.getOperationConfigs,
  });
};

export const useCreateOperationConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<POSOperationConfig>) => posApi.createOperationConfig(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operation_configs'] }),
  });
};

export const useUpdateOperationConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<POSOperationConfig> }) => posApi.updateOperationConfig(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operation_configs'] }),
  });
};

// --- DINING TABLES ---
export const useDiningTables = () => {
  return useQuery({
    queryKey: ['dining_tables'],
    queryFn: posApi.getDiningTables,
  });
};

export const useCreateDiningTable = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<POSDiningTable>) => posApi.createDiningTable(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dining_tables'] }),
  });
};

export const useUpdateDiningTable = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<POSDiningTable> }) => posApi.updateDiningTable(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dining_tables'] }),
  });
};

export const useDeleteDiningTable = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => posApi.deleteDiningTable(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dining_tables'] }),
  });
};

// --- PAYMENT METHODS ---
export const usePaymentMethods = () => {
  return useQuery({
    queryKey: ['payment_methods'],
    queryFn: posApi.getPaymentMethods,
  });
};

export const useCreatePaymentMethod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<POSPaymentMethod>) => posApi.createPaymentMethod(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment_methods'] }),
  });
};

export const useUpdatePaymentMethod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<POSPaymentMethod> }) => posApi.updatePaymentMethod(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment_methods'] }),
  });
};

export const useDeletePaymentMethod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => posApi.deletePaymentMethod(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment_methods'] }),
  });
};

// --- ORDER TYPES ---
export const useOrderTypes = () => {
  return useQuery({
    queryKey: ['order_types'],
    queryFn: posApi.getOrderTypes,
  });
};

export const useCreateOrderType = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<POSOrderType>) => posApi.createOrderType(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order_types'] }),
  });
};

export const useUpdateOrderType = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<POSOrderType> }) => posApi.updateOrderType(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order_types'] }),
  });
};

export const useDeleteOrderType = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => posApi.deleteOrderType(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order_types'] }),
  });
};
