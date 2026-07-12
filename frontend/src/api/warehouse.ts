import { apiClient } from './client';

export interface Warehouse { id?: number; name: string; hotel?: number; hotel_name?: string; is_main?: boolean; }
export interface StockLevel {
  id: number; warehouse: number; warehouse_name?: string; item: number; item_code?: string; item_name?: string;
  uom_code?: string; quantity_on_hand: string; quantity_reserved: string; available_quantity: string;
  unit_cost: string; min_stock_alert: string; max_stock_capacity?: string | null; last_updated: string;
}
export interface StockMovement {
  id: number; warehouse: number; warehouse_name?: string; item: number; item_code?: string; item_name?: string;
  movement_type: string; movement_type_display?: string; quantity: string; unit_cost: string;
  reference?: string; note?: string; created_by?: string; created_at: string;
}

export const warehouseApi = {
  getWarehouses: async (): Promise<Warehouse[]> => (await apiClient.get('inventory/warehouses/')).data,
  createWarehouse: async (p: Partial<Warehouse>) => (await apiClient.post('inventory/warehouses/', p)).data,

  getStockLevels: async (params?: any): Promise<StockLevel[]> => (await apiClient.get('inventory/stock-levels/', { params })).data,
  getMovements: async (params?: any): Promise<StockMovement[]> => (await apiClient.get('inventory/stock-movements/', { params })).data,

  receive: async (p: any) => (await apiClient.post('inventory/stock-movements/receive/', p)).data,
  issue: async (p: any) => (await apiClient.post('inventory/stock-movements/issue/', p)).data,
  transfer: async (p: any) => (await apiClient.post('inventory/stock-movements/transfer/', p)).data,
  adjust: async (p: any) => (await apiClient.post('inventory/stock-movements/adjust/', p)).data,
};
