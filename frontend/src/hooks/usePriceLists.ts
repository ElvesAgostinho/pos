import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { priceListApi } from '../api/pricelists';
import type { PriceList } from '../api/pricelists';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['pricelists'] });

export const usePriceLists = () => useQuery({ queryKey: ['pricelists'], queryFn: priceListApi.list });
export const useCreatePriceList = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<PriceList>) => priceListApi.create(p), onSuccess: () => inval(qc) }); };
export const useDeletePriceList = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => priceListApi.remove(id), onSuccess: () => inval(qc) }); };
export const useSetPrice = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, item, price }: { id: number; item: number; price: string | number }) => priceListApi.setPrice(id, item, price), onSuccess: () => inval(qc) }); };
export const useRemovePriceItem = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, item }: { id: number; item: number }) => priceListApi.removeItem(id, item), onSuccess: () => inval(qc) }); };
