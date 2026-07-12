import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { procurementApi } from '../api/procurement';
import type { PurchaseOrder, POLine, GoodsReceipt, GRNLine } from '../api/procurement';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['procurement'] });

export const useWarehousesLookup = () =>
  useQuery({ queryKey: ['inv', 'warehouses'], queryFn: procurementApi.getWarehouses });

// Purchase Orders
export const usePOs = () => useQuery({ queryKey: ['procurement', 'pos'], queryFn: () => procurementApi.getPOs() });
export const usePO = (id?: number) =>
  useQuery({ queryKey: ['procurement', 'po', id], queryFn: () => procurementApi.getPO(id!), enabled: !!id });
export const useCreatePO = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<PurchaseOrder>) => procurementApi.createPO(p), onSuccess: () => inval(qc) });
};
export const useDeletePO = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => procurementApi.deletePO(id), onSuccess: () => inval(qc) });
};
export const useSetPOStatus = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => procurementApi.setPOStatus(id, status), onSuccess: () => inval(qc) });
};
export const useAddPOLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<POLine>) => procurementApi.addPOLine(p), onSuccess: () => inval(qc) });
};
export const useDeletePOLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => procurementApi.deletePOLine(id), onSuccess: () => inval(qc) });
};

// Goods Receipts
export const useGRNs = () => useQuery({ queryKey: ['procurement', 'grns'], queryFn: () => procurementApi.getGRNs() });
export const useGRN = (id?: number) =>
  useQuery({ queryKey: ['procurement', 'grn', id], queryFn: () => procurementApi.getGRN(id!), enabled: !!id });
export const useCreateGRN = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<GoodsReceipt>) => procurementApi.createGRN(p), onSuccess: () => inval(qc) });
};
export const useDeleteGRN = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => procurementApi.deleteGRN(id), onSuccess: () => inval(qc) });
};
export const useValidateGRN = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => procurementApi.validateGRN(id), onSuccess: () => inval(qc) });
};
export const useAddGRNLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<GRNLine>) => procurementApi.addGRNLine(p), onSuccess: () => inval(qc) });
};
export const useDeleteGRNLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => procurementApi.deleteGRNLine(id), onSuccess: () => inval(qc) });
};
