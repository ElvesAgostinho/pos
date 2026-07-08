import { apiClient } from './client';

export interface Warehouse {
  id?: number;
  company?: number | null;
  code: string;
  name: string;
  hotel_id?: string | null;
  department_id?: string | null;
  warehouse_type?: string | null;
  cost_center?: string | null;
  status: string;
  manager_name?: string | null;
  allow_negative_stock: boolean;
  requires_approval_for_out: boolean;
  manages_batches: boolean;
  manages_expiry: boolean;
  created_at?: string;
}

export interface Location {
  id?: number;
  warehouse: number;
  parent?: number | null;
  code: string;
  name: string;
  location_type: string;
  status: string;
  max_weight_kg: string;
  max_volume_m3: string;
  temperature_celsius?: string | null;
  
  // Readonly fields from serializer
  warehouse_name?: string;
  parent_code?: string;
}

// Warehouses
export const getWarehouses = async (): Promise<Warehouse[]> => {
  const { data } = await apiClient.get('/inventory/warehouses/');
  return data;
};

export const createWarehouse = async (warehouse: Partial<Warehouse>): Promise<Warehouse> => {
  const { data } = await apiClient.post('/inventory/warehouses/', warehouse);
  return data;
};

export const updateWarehouse = async (id: number, warehouse: Partial<Warehouse>): Promise<Warehouse> => {
  const { data } = await apiClient.put(`/inventory/warehouses/${id}/`, warehouse);
  return data;
};

export const deleteWarehouse = async (id: number): Promise<void> => {
  await apiClient.delete(`/inventory/warehouses/${id}/`);
};

// Locations
export const getLocations = async (): Promise<Location[]> => {
  const { data } = await apiClient.get('/inventory/locations/');
  return data;
};

export const createLocation = async (location: Partial<Location>): Promise<Location> => {
  const { data } = await apiClient.post('/inventory/locations/', location);
  return data;
};

export const updateLocation = async (id: number, location: Partial<Location>): Promise<Location> => {
  const { data } = await apiClient.put(`/inventory/locations/${id}/`, location);
  return data;
};

export const deleteLocation = async (id: number): Promise<void> => {
  await apiClient.delete(`/inventory/locations/${id}/`);
};
