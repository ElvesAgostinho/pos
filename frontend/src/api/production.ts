import { apiClient } from './client';

// ---------- Tipos ----------
export interface Allergen { id: number; code: string; name: string; }

export interface InvItem {
  id: number; code: string; name: string; item_type: string;
  base_uom: number; base_uom_code?: string; current_average_cost?: string | number;
}
export interface InvUom { id: number; code: string; name: string; }

export interface ProductionArea {
  id?: number; hotel: number; name: string; area_type: string;
  area_type_display?: string; is_active?: boolean;
}

export interface KitchenEquipment {
  id?: number; area: number; area_name?: string; name: string;
  equipment_type: string; capacity?: string | null; is_active?: boolean;
}

export interface ItemProductionProfile {
  id?: number; item: number; item_name?: string; item_code?: string;
  is_semi_finished: boolean; allergens?: Allergen[]; allergen_ids?: number[];
  shelf_life_hours?: number | null; storage_instructions?: string | null;
  serving_size_g?: string | null; energy_kcal?: string | null; fat_g?: string | null;
  saturated_fat_g?: string | null; carbs_g?: string | null; sugars_g?: string | null;
  protein_g?: string | null; salt_g?: string | null; fiber_g?: string | null;
}

export interface RecipeLine {
  id?: number; recipe?: number; component_item: number;
  component_name?: string; component_code?: string;
  quantity: string | number; uom: number; uom_code?: string;
  wastage_percentage?: string | number; is_optional?: boolean; note?: string | null;
  effective_quantity?: string; line_cost?: string;
}

export interface Recipe {
  id?: number; final_item: number; final_item_name?: string;
  code: string; name: string; area?: number | null; area_name?: string | null;
  equipment_ids?: number[];
  version?: number; status?: string; status_display?: string;
  yield_quantity: string | number; yield_uom: number; yield_uom_code?: string;
  prep_time_mins?: number | null; cook_time_mins?: number | null;
  instructions?: string | null; theoretical_cost?: string; cost_per_yield_unit?: string;
  is_active?: boolean; lines?: RecipeLine[];
}

// ---------- API ----------
export const productionApi = {
  // Lookups (inventory)
  getItems: async (params?: { search?: string; item_type?: string }): Promise<InvItem[]> =>
    (await apiClient.get('inventory/items/', { params })).data,
  getUoms: async (): Promise<InvUom[]> => (await apiClient.get('inventory/uoms/')).data,

  getAllergens: async (): Promise<Allergen[]> => (await apiClient.get('production/allergens/')).data,

  getAreas: async (): Promise<ProductionArea[]> => (await apiClient.get('production/areas/')).data,
  createArea: async (p: Partial<ProductionArea>) => (await apiClient.post('production/areas/', p)).data,
  updateArea: async (id: number, p: Partial<ProductionArea>) => (await apiClient.patch(`production/areas/${id}/`, p)).data,
  deleteArea: async (id: number) => { await apiClient.delete(`production/areas/${id}/`); },

  getEquipment: async (areaId?: number): Promise<KitchenEquipment[]> =>
    (await apiClient.get('production/equipment/', { params: areaId ? { area: areaId } : {} })).data,
  createEquipment: async (p: Partial<KitchenEquipment>) => (await apiClient.post('production/equipment/', p)).data,
  deleteEquipment: async (id: number) => { await apiClient.delete(`production/equipment/${id}/`); },

  getProfile: async (itemId: number): Promise<ItemProductionProfile[]> =>
    (await apiClient.get('production/item-profiles/', { params: { item: itemId } })).data,
  createProfile: async (p: Partial<ItemProductionProfile>) => (await apiClient.post('production/item-profiles/', p)).data,
  updateProfile: async (id: number, p: Partial<ItemProductionProfile>) =>
    (await apiClient.patch(`production/item-profiles/${id}/`, p)).data,

  // Recipes
  getRecipes: async (): Promise<Recipe[]> => (await apiClient.get('production/recipes/')).data,
  getRecipe: async (id: number): Promise<Recipe> => (await apiClient.get(`production/recipes/${id}/`)).data,
  createRecipe: async (p: Partial<Recipe>): Promise<Recipe> => (await apiClient.post('production/recipes/', p)).data,
  updateRecipe: async (id: number, p: Partial<Recipe>): Promise<Recipe> => (await apiClient.patch(`production/recipes/${id}/`, p)).data,
  deleteRecipe: async (id: number) => { await apiClient.delete(`production/recipes/${id}/`); },
  recalcRecipe: async (id: number): Promise<Recipe> => (await apiClient.post(`production/recipes/${id}/recalculate_cost/`)).data,

  addLine: async (p: Partial<RecipeLine>) => (await apiClient.post('production/recipe-lines/', p)).data,
  deleteLine: async (id: number) => { await apiClient.delete(`production/recipe-lines/${id}/`); },
};
