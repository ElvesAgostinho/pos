import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { esmApi } from '../api/esm';
import type { Supplier } from '../api/esm';

export const useEsmDashboard = () =>
  useQuery({ queryKey: ['esm', 'dashboard'], queryFn: esmApi.getDashboard });

export const useEsmCategories = () =>
  useQuery({ queryKey: ['esm', 'categories'], queryFn: esmApi.getCategories });

export const useSuppliers = (params?: { status?: string; search?: string; category?: number }) =>
  useQuery({
    queryKey: ['esm', 'suppliers', params],
    queryFn: () => esmApi.getSuppliers(params),
  });

export const useSupplier = (id?: number) =>
  useQuery({
    queryKey: ['esm', 'supplier', id],
    queryFn: () => esmApi.getSupplier(id!),
    enabled: !!id,
  });

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['esm'] });

export const useCreateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Supplier>) => esmApi.createSupplier(data),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useUpdateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Supplier> }) => esmApi.updateSupplier(id, data),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useDeleteSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => esmApi.deleteSupplier(id),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useRecalcPerformance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => esmApi.recalcPerformance(id),
    onSuccess: () => invalidateAll(qc),
  });
};

// Coleções filhas
export const useCreateContact = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: esmApi.createContact, onSuccess: () => invalidateAll(qc) });
};
export const useDeleteContact = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: esmApi.deleteContact, onSuccess: () => invalidateAll(qc) });
};
export const useCreateContract = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: esmApi.createContract, onSuccess: () => invalidateAll(qc) });
};
export const useDeleteContract = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: esmApi.deleteContract, onSuccess: () => invalidateAll(qc) });
};
export const useCreateDocument = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: esmApi.createDocument, onSuccess: () => invalidateAll(qc) });
};
export const useDeleteDocument = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: esmApi.deleteDocument, onSuccess: () => invalidateAll(qc) });
};
export const useCreateCatalogEntry = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: esmApi.createCatalogEntry, onSuccess: () => invalidateAll(qc) });
};
export const useDeleteCatalogEntry = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: esmApi.deleteCatalogEntry, onSuccess: () => invalidateAll(qc) });
};
