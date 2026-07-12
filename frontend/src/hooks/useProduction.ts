import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productionApi } from '../api/production';
import type { Recipe, ProductionArea, KitchenEquipment, RecipeLine } from '../api/production';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['production'] });

// Lookups
export const useInvItems = (params?: { search?: string; item_type?: string }) =>
  useQuery({ queryKey: ['inv', 'items', params], queryFn: () => productionApi.getItems(params) });
export const useInvUoms = () =>
  useQuery({ queryKey: ['inv', 'uoms'], queryFn: productionApi.getUoms });
export const useAllergens = () =>
  useQuery({ queryKey: ['production', 'allergens'], queryFn: productionApi.getAllergens });

export const useItemProfile = (itemId?: number) =>
  useQuery({
    queryKey: ['production', 'profile', itemId],
    queryFn: async () => (await productionApi.getProfile(itemId!))[0] ?? null,
    enabled: !!itemId,
  });

export const useSaveProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    // Upsert: cria se não existir, senão atualiza (perfil é OneToOne com o artigo).
    mutationFn: async (p: any) =>
      p.id ? productionApi.updateProfile(p.id, p) : productionApi.createProfile(p),
    onSuccess: () => inval(qc),
  });
};

// Areas
export const useAreas = () =>
  useQuery({ queryKey: ['production', 'areas'], queryFn: productionApi.getAreas });
export const useCreateArea = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<ProductionArea>) => productionApi.createArea(p), onSuccess: () => inval(qc) });
};
export const useDeleteArea = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => productionApi.deleteArea(id), onSuccess: () => inval(qc) });
};

// Equipment
export const useEquipment = (areaId?: number) =>
  useQuery({ queryKey: ['production', 'equipment', areaId], queryFn: () => productionApi.getEquipment(areaId), enabled: areaId !== undefined });
export const useCreateEquipment = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<KitchenEquipment>) => productionApi.createEquipment(p), onSuccess: () => inval(qc) });
};
export const useDeleteEquipment = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => productionApi.deleteEquipment(id), onSuccess: () => inval(qc) });
};

// Recipes
export const useRecipes = () =>
  useQuery({ queryKey: ['production', 'recipes'], queryFn: productionApi.getRecipes });
export const useRecipe = (id?: number) =>
  useQuery({ queryKey: ['production', 'recipe', id], queryFn: () => productionApi.getRecipe(id!), enabled: !!id });
export const useCreateRecipe = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<Recipe>) => productionApi.createRecipe(p), onSuccess: () => inval(qc) });
};
export const useUpdateRecipe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Recipe> }) => productionApi.updateRecipe(id, data),
    onSuccess: () => inval(qc),
  });
};
export const useDeleteRecipe = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => productionApi.deleteRecipe(id), onSuccess: () => inval(qc) });
};
export const useAddLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<RecipeLine>) => productionApi.addLine(p), onSuccess: () => inval(qc) });
};
export const useDeleteLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => productionApi.deleteLine(id), onSuccess: () => inval(qc) });
};
