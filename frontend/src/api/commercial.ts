import { apiClient } from './client';

export interface Promotion {
  id?: number; name: string; outlet?: number | null; outlet_name?: string;
  scope: string; scope_display?: string; category?: number | null; category_name?: string;
  item?: number | null; item_name?: string; discount_type: string; discount_type_display?: string;
  value: string | number; start_date?: string | null; end_date?: string | null;
  happy_start?: string | null; happy_end?: string | null; weekdays?: string | null;
  priority?: number; is_active?: boolean; active_now?: boolean;
}
export interface ComboItem { id?: number; item: number; item_name?: string; quantity: string | number; }
export interface Combo { id?: number; name: string; outlet?: number | null; price: string | number; is_active?: boolean; items?: ComboItem[]; }

export const commercialApi = {
  getPromotions: async (): Promise<Promotion[]> => (await apiClient.get('commercial/promotions/')).data,
  createPromotion: async (p: Partial<Promotion>) => (await apiClient.post('commercial/promotions/', p)).data,
  updatePromotion: async (id: number, p: Partial<Promotion>) => (await apiClient.patch(`commercial/promotions/${id}/`, p)).data,
  deletePromotion: async (id: number) => { await apiClient.delete(`commercial/promotions/${id}/`); },

  getCombos: async (): Promise<Combo[]> => (await apiClient.get('commercial/combos/')).data,
  createCombo: async (p: Partial<Combo>) => (await apiClient.post('commercial/combos/', p)).data,
  deleteCombo: async (id: number) => { await apiClient.delete(`commercial/combos/${id}/`); },
};
