import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { procApi } from '../api/procurementflow';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['procflow'] });

export const useRequisitions = (params?: any) => useQuery({ queryKey: ['procflow', 'req', params], queryFn: () => procApi.getRequisitions(params) });
export const useCreateRequisition = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: any) => procApi.createRequisition(p), onSuccess: () => inval(qc) }); };
export const useReqAction = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, act, data }: { id: number; act: any; data?: any }) => procApi.reqAction(id, act, data), onSuccess: () => inval(qc) }); };
export const useCreateRfq = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => procApi.createRfq(id), onSuccess: () => inval(qc) }); };

export const useRfqs = () => useQuery({ queryKey: ['procflow', 'rfqs'], queryFn: procApi.getRfqs });
export const useAddQuote = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ rfq, supplier }: { rfq: number; supplier: number }) => procApi.addQuote(rfq, supplier), onSuccess: () => inval(qc) }); };
export const useComparison = (rfq?: number) => useQuery({ queryKey: ['procflow', 'comp', rfq], queryFn: () => procApi.comparison(rfq!), enabled: !!rfq });
export const useConvertToPo = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (quote: number) => procApi.convertToPo(quote), onSuccess: () => inval(qc) }); };

export const useSuppliersList = () => useQuery({ queryKey: ['procflow', 'suppliers'], queryFn: procApi.getSuppliers });
export const useUomsList = () => useQuery({ queryKey: ['procflow', 'uoms'], queryFn: procApi.getUoms });
