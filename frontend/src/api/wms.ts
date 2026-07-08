import { apiClient } from './client';

export interface WMSWarehouse {
  id?: string;
  code: string;
  name: string;
  company?: number | null;
  hotel?: number | null;
  warehouse_type?: string;
  status?: string;
  cost_center?: string;
  allow_negative_stock?: boolean;
  manage_batches?: boolean;
  manage_expirations?: boolean;
  manage_serial_numbers?: boolean;
  require_outbound_approval?: boolean;
}

export interface WMSLocation {
  id?: string;
  warehouse: string;
  parent?: string | null;
  location_type: string;
  code: string;
  full_code?: string;
  name: string;
  status?: string;
  max_weight_kg?: number | null;
  max_volume_m3?: number | null;
  ideal_temperature_c?: number | null;
  block_inbound?: boolean;
  block_outbound?: boolean;
  allow_mixed_items?: boolean;
  allow_mixed_batches?: boolean;
  children?: WMSLocation[]; // For tree responses
}

export const wmsApi = {
  getWarehouses: async (): Promise<WMSWarehouse[]> => {
    const { data } = await apiClient.get<WMSWarehouse[]>('wms/warehouses/');
    return data;
  },
  createWarehouse: async (warehouseData: Partial<WMSWarehouse>): Promise<WMSWarehouse> => {
    const { data } = await apiClient.post<WMSWarehouse>('wms/warehouses/', warehouseData);
    return data;
  },
  updateWarehouse: async (id: string, warehouseData: Partial<WMSWarehouse>): Promise<WMSWarehouse> => {
    const { data } = await apiClient.put<WMSWarehouse>(`wms/warehouses/${id}/`, warehouseData);
    return data;
  },
  deleteWarehouse: async (id: string): Promise<void> => {
    await apiClient.delete(`wms/warehouses/${id}/`);
  },

  getLocations: async (): Promise<WMSLocation[]> => {
    const { data } = await apiClient.get<WMSLocation[]>('wms/locations/');
    return data;
  },
  getLocationsTree: async (warehouseId: string): Promise<WMSLocation[]> => {
    const { data } = await apiClient.get<WMSLocation[]>(`wms/warehouses/${warehouseId}/locations_tree/`);
    return data;
  },
  createLocation: async (locationData: Partial<WMSLocation>): Promise<WMSLocation> => {
    const { data } = await apiClient.post<WMSLocation>('wms/locations/', locationData);
    return data;
  },
  updateLocation: async (id: string, locationData: Partial<WMSLocation>): Promise<WMSLocation> => {
    const { data } = await apiClient.put<WMSLocation>(`wms/locations/${id}/`, locationData);
    return data;
  },
  deleteLocation: async (id: string): Promise<void> => {
    await apiClient.delete(`wms/locations/${id}/`);
  },

  getBoms: async (): Promise<WMSBillOfMaterials[]> => {
    const { data } = await apiClient.get<WMSBillOfMaterials[]>('wms/bom/');
    return data;
  },
  createBom: async (bomData: Partial<WMSBillOfMaterials>): Promise<WMSBillOfMaterials> => {
    const { data } = await apiClient.post<WMSBillOfMaterials>('wms/bom/', bomData);
    return data;
  },
  updateBom: async (id: string, bomData: Partial<WMSBillOfMaterials>): Promise<WMSBillOfMaterials> => {
    const { data } = await apiClient.put<WMSBillOfMaterials>(`wms/bom/${id}/`, bomData);
    return data;
  },
  deleteBom: async (id: string): Promise<void> => {
    await apiClient.delete(`wms/bom/${id}/`);
  },
  getTransactions: async (): Promise<WMSStockTransaction[]> => {
    const { data } = await apiClient.get<WMSStockTransaction[]>('wms/transactions/');
    return data;
  },
  createTransaction: async (txData: Partial<WMSStockTransaction>): Promise<WMSStockTransaction> => {
    const { data } = await apiClient.post<WMSStockTransaction>('wms/transactions/', txData);
    return data;
  },
  getStockLevels: async (): Promise<WMSStockLevel[]> => {
    const { data } = await apiClient.get<WMSStockLevel[]>('wms/stock-levels/');
    return data;
  }
};

export interface WMSStockLevel {
  id: string;
  item: number;
  item_name?: string;
  item_code?: string;
  location: string;
  location_name?: string;
  location_full_code?: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  quantity: string | number;
  reserved_quantity: string | number;
}

export interface WMSStockTransactionLine {
  id?: string;
  transaction?: string;
  item: number;
  source_location?: string | null;
  destination_location?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  quantity: string | number;
  uom: number;
  conversion_factor: string | number;
}

export interface WMSStockTransaction {
  id?: string;
  transaction_type: 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'ADJUSTMENT' | 'PRODUCTION';
  reference_document?: string | null;
  notes?: string | null;
  created_by?: string | null;
  transaction_date?: string;
  lines?: WMSStockTransactionLine[];
}
export interface WMSBillOfMaterialsLine {
  id?: string;
  bom?: string;
  raw_material: number; // mdm.Item id
  quantity: string | number;
  uom: number; // mdm.UnitOfMeasure id
  conversion_factor: string | number;
  wastage_percentage: string | number;
}

export interface WMSBillOfMaterials {
  id?: string;
  item: number; // mdm.Item id
  outlet?: number | null; // pos.Outlet id
  version?: number;
  yield_percentage?: string | number;
  preparation_time_mins?: number | null;
  instructions?: string | null;
  is_active?: boolean;
  lines?: WMSBillOfMaterialsLine[];
}
