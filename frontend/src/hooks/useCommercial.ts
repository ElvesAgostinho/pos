import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commercialApi } from '../api/commercial';
import type { Promotion, Combo } from '../api/commercial';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['commercial'] });

export const usePromotions = () => useQuery({ queryKey: ['commercial', 'promotions'], queryFn: commercialApi.getPromotions });
export const useCreatePromotion = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<Promotion>) => commercialApi.createPromotion(p), onSuccess: () => inval(qc) }); };
export const useUpdatePromotion = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Promotion> }) => commercialApi.updatePromotion(id, data), onSuccess: () => inval(qc) }); };
export const useDeletePromotion = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => commercialApi.deletePromotion(id), onSuccess: () => inval(qc) }); };

export const useCombos = () => useQuery({ queryKey: ['commercial', 'combos'], queryFn: commercialApi.getCombos });
export const useCreateCombo = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<Combo>) => commercialApi.createCombo(p), onSuccess: () => inval(qc) }); };
export const useDeleteCombo = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => commercialApi.deleteCombo(id), onSuccess: () => inval(qc) }); };
