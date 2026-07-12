import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { itemAdvApi } from '../api/itemadvanced';
import { apiClient } from '../api/client';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['itemadv'] });

export const useUomList = () => useQuery({ queryKey: ['itemadv', 'uomlist'], queryFn: async () => (await apiClient.get('inventory/uoms/')).data });

export const useVariants = (item?: number) => useQuery({ queryKey: ['itemadv', 'variants', item], queryFn: () => itemAdvApi.getVariants(item!), enabled: !!item });
export const useCreateVariant = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: any) => itemAdvApi.createVariant(p), onSuccess: () => inval(qc) }); };
export const useDeleteVariant = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => itemAdvApi.deleteVariant(id), onSuccess: () => inval(qc) }); };

export const useItemUoms = (item?: number) => useQuery({ queryKey: ['itemadv', 'uoms', item], queryFn: () => itemAdvApi.getUoms(item!), enabled: !!item });
export const useCreateItemUom = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: any) => itemAdvApi.createUom(p), onSuccess: () => inval(qc) }); };
export const useDeleteItemUom = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => itemAdvApi.deleteUom(id), onSuccess: () => inval(qc) }); };

export const useItemRecipe = (item?: number) => useQuery({ queryKey: ['itemadv', 'recipe', item], queryFn: () => itemAdvApi.getRecipeForItem(item!), enabled: !!item });
export const useRecalcRecipe = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => itemAdvApi.recalcRecipe(id), onSuccess: () => inval(qc) }); };
