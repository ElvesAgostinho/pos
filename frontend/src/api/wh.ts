import { apiClient } from './client';

export interface StockLocation {
  id?: number; warehouse: number; warehouse_name?: string; code: string; name?: string | null;
  location_type: string; location_type_display?: string; is_active?: boolean;
}
export interface StockLot {
  id?: number; warehouse: number; warehouse_name?: string; item: number; item_name?: string; item_code?: string;
  lot_number: string; quantity: number | string; expiry_date?: string | null; received_at?: string | null;
  location?: number | null; is_active?: boolean; days_to_expiry?: number | null;
}
export interface TransferLine { id?: number; item: number; item_name?: string; item_code?: string; quantity: number | string; }
export interface StockTransfer {
  id?: number; number?: string; source: number; source_name?: string; destination: number; destination_name?: string;
  status?: string; status_display?: string; note?: string | null; lines?: TransferLine[]; confirmed_at?: string | null;
}
export interface CountLine { id?: number; item: number; item_name?: string; item_code?: string; system_qty?: number | string; counted_qty: number | string; variance?: string; }
export interface InventoryCount {
  id?: number; number?: string; warehouse: number; warehouse_name?: string; status?: string; status_display?: string;
  note?: string | null; lines?: CountLine[]; confirmed_at?: string | null;
}

const crud = <T,>(resource: string) => ({
  list: async (params?: Record<string, any>): Promise<T[]> => (await apiClient.get(`inventory/wh/${resource}/`, { params })).data,
  create: async (p: Partial<T>): Promise<T> => (await apiClient.post(`inventory/wh/${resource}/`, p)).data,
  update: async (id: number, p: Partial<T>): Promise<T> => (await apiClient.patch(`inventory/wh/${resource}/${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`inventory/wh/${resource}/${id}/`); },
});

export const whApi = {
  locations: crud<StockLocation>('locations'),
  lots: crud<StockLot>('lots'),
  transfers: crud<StockTransfer>('transfers'),
  counts: crud<InventoryCount>('counts'),

  confirmTransfer: async (id: number) => (await apiClient.post(`inventory/wh/transfers/${id}/confirm/`)).data,
  confirmCount: async (id: number) => (await apiClient.post(`inventory/wh/counts/${id}/confirm/`)).data,

  dashboard: async (): Promise<any> => (await apiClient.get('inventory/wh/dashboard/')).data,
  costing: async (): Promise<any> => (await apiClient.get('inventory/wh/costing/')).data,

  // Lookups
  warehouses: async (): Promise<any[]> => (await apiClient.get('inventory/warehouses/')).data,
  items: async (search?: string): Promise<any[]> => (await apiClient.get('inventory/items/', { params: search ? { search } : {} })).data,
};
