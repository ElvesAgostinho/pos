import { apiClient } from './client';

export interface PriceListItem { id?: number; price_list?: number; item: number; item_name?: string; item_code?: string; price: string | number; }
export interface PriceList { id?: number; code: string; name: string; currency?: string; is_active?: boolean; items?: PriceListItem[]; item_count?: number; }

export const priceListApi = {
  list: async (): Promise<PriceList[]> => (await apiClient.get('inventory/price-lists/')).data,
  create: async (p: Partial<PriceList>) => (await apiClient.post('inventory/price-lists/', p)).data,
  remove: async (id: number) => { await apiClient.delete(`inventory/price-lists/${id}/`); },
  setPrice: async (id: number, item: number, price: string | number) => (await apiClient.post(`inventory/price-lists/${id}/set_price/`, { item, price })).data,
  removeItem: async (id: number, item: number) => (await apiClient.post(`inventory/price-lists/${id}/remove_item/`, { item })).data,
};
