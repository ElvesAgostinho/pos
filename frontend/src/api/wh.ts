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
// ORDEM DE PRODUCAO — o que a cozinha faz em lote (20 litros de molho de manha).
// O custo do produzido nao se escreve: forma-se com o que saiu do armazem para o
// fazer, e e isso que `unit_cost`/`total_cost` trazem depois de produzir.
export interface ProductionConsumption {
  id?: number; item: number; item_code?: string; item_name?: string;
  quantity: string | number; unit_cost: string | number; total_cost: string | number;
}
export interface ProductionOrder {
  id?: number; number?: string; warehouse: number; warehouse_name?: string;
  item: number; item_code?: string; item_name?: string; quantity: string | number;
  status?: string; status_display?: string;
  lot_number?: string | null; expiry_date?: string | null; note?: string | null;
  unit_cost?: string | number; total_cost?: string | number;
  produced_at?: string | null; created_at?: string | null; created_by?: string | null;
  consumptions?: ProductionConsumption[];
}
export interface ProductionRequirementLine {
  item: number; item_code: string; item_name: string; uom: string;
  needed: string; on_hand: string; unit_cost: string; missing: boolean;
}
export interface ProductionRequirements {
  order?: string; quantity?: string; detail?: string;
  lines: ProductionRequirementLine[]; can_produce: boolean;
}

export interface InventoryCount {
  id?: number; number?: string; warehouse: number; warehouse_name?: string; status?: string; status_display?: string;
  note?: string | null; lines?: CountLine[]; confirmed_at?: string | null;
}

const invCrud = <T,>(resource: string) => ({
  list: async (params?: Record<string, any>): Promise<T[]> => (await apiClient.get(`inventory/${resource}/`, { params })).data,
  create: async (p: Partial<T>): Promise<T> => (await apiClient.post(`inventory/${resource}/`, p)).data,
  update: async (id: number, p: Partial<T>): Promise<T> => (await apiClient.patch(`inventory/${resource}/${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`inventory/${resource}/${id}/`); },
});

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

  orders: invCrud<ProductionOrder>('production/orders'),

  // A CONFERENCIA ANTES DE PRODUZIR: o que a ordem vai gastar, o que ha em
  // armazem, e o que falta. E o que faz o botao Produzir poder estar desligado
  // com a razao a vista, em vez de falhar a meio da producao.
  requirements: async (id: number): Promise<ProductionRequirements> =>
    (await apiClient.get(`inventory/production/orders/${id}/requirements/`)).data,
  produce: async (id: number): Promise<ProductionOrder> =>
    (await apiClient.post(`inventory/production/orders/${id}/produce/`)).data,
  cancelOrder: async (id: number): Promise<ProductionOrder> =>
    (await apiClient.post(`inventory/production/orders/${id}/cancel/`)).data,

  confirmTransfer: async (id: number) => (await apiClient.post(`inventory/wh/transfers/${id}/confirm/`)).data,
  confirmCount: async (id: number) => (await apiClient.post(`inventory/wh/counts/${id}/confirm/`)).data,

  dashboard: async (): Promise<any> => (await apiClient.get('inventory/wh/dashboard/')).data,
  costing: async (): Promise<any> => (await apiClient.get('inventory/wh/costing/')).data,

  // Lookups
  warehouses: async (): Promise<any[]> => (await apiClient.get('inventory/warehouses/')).data,
  items: async (search?: string): Promise<any[]> => (await apiClient.get('inventory/items/', { params: search ? { search } : {} })).data,
};
