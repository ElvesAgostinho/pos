import { apiClient } from './client';

export interface ItemVariant { id?: number; item: number; code: string; name: string; sale_price?: string | number | null; qty_factor?: string | number; effective_price?: string; is_active?: boolean; }
export interface ItemUom { id?: number; item: number; uom: number; uom_code?: string; base_uom_code?: string; factor: string | number; role?: string; role_display?: string; }

export const itemAdvApi = {
  getVariants: async (item: number): Promise<ItemVariant[]> => (await apiClient.get('inventory/item-variants/', { params: { item } })).data,
  createVariant: async (p: Partial<ItemVariant>) => (await apiClient.post('inventory/item-variants/', p)).data,
  deleteVariant: async (id: number) => { await apiClient.delete(`inventory/item-variants/${id}/`); },

  getUoms: async (item: number): Promise<ItemUom[]> => (await apiClient.get('inventory/item-uoms/', { params: { item } })).data,
  createUom: async (p: Partial<ItemUom>) => (await apiClient.post('inventory/item-uoms/', p)).data,
  deleteUom: async (id: number) => { await apiClient.delete(`inventory/item-uoms/${id}/`); },

  getRecipeForItem: async (item: number): Promise<any[]> => (await apiClient.get('production/recipes/', { params: { final_item: item } })).data,
  recalcRecipe: async (id: number) => (await apiClient.post(`production/recipes/${id}/recalculate_cost/`, {})).data,
};
