import { apiClient } from './client';

// ---------- Tipos ----------
export interface FnbMenuItem {
  id?: number; menu?: number; item?: number | null; item_name?: string; item_code?: string;
  section?: string | null; name: string; description?: string | null;
  price: number | string; sort_order?: number; is_available?: boolean; is_signature?: boolean;
  cost?: string; margin?: string | null;
}
export interface FnbMenu {
  id?: number; hotel?: number; name: string; menu_type: string; menu_type_display?: string;
  outlet_type?: string | null; outlet_type_display?: string | null;
  valid_from?: string | null; valid_to?: string | null; is_active?: boolean; notes?: string | null;
  items?: FnbMenuItem[]; item_count?: number;
}
export interface FnbEvent {
  id?: number; hotel?: number; name: string; event_type: string; event_type_display?: string;
  event_date: string; start_time?: string | null; end_time?: string | null; pax?: number;
  location?: string | null; menu?: number | null; menu_name?: string | null;
  status: string; status_display?: string; contact_name?: string | null; contact_phone?: string | null;
  estimated_value?: number | string; notes?: string | null;
}
export interface HaccpCheck {
  id?: number; hotel?: number; area?: number | null; area_name?: string | null;
  check_type: string; check_type_display?: string; location_label?: string | null;
  measured_value?: number | string | null; unit?: string; limit_min?: number | string | null;
  limit_max?: number | string | null; compliant?: boolean; corrective_action?: string | null;
  checked_by?: string | null; checked_at?: string; notes?: string | null;
}
export interface WasteRecord {
  id?: number; hotel?: number; area?: number | null; area_name?: string | null;
  item?: number | null; item_name?: string | null; description: string;
  quantity: number | string; uom?: number | null; uom_code?: string | null;
  reason: string; reason_display?: string; estimated_cost?: number | string;
  recorded_by?: string | null; recorded_at?: string; notes?: string | null;
}
export interface QualityCheck {
  id?: number; hotel?: number; area?: number | null; area_name?: string | null;
  outlet_type?: string | null; subject: string; score: number; result: string;
  result_display?: string; inspector?: string | null; checked_at?: string; notes?: string | null;
}

// ---------- CRUD genérico ----------
const crud = <T,>(resource: string) => ({
  list: async (params?: Record<string, any>): Promise<T[]> =>
    (await apiClient.get(`production/fnb/${resource}/`, { params })).data,
  create: async (p: Partial<T>): Promise<T> =>
    (await apiClient.post(`production/fnb/${resource}/`, p)).data,
  update: async (id: number, p: Partial<T>): Promise<T> =>
    (await apiClient.patch(`production/fnb/${resource}/${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`production/fnb/${resource}/${id}/`); },
});

export const fnbApi = {
  menus: crud<FnbMenu>('menus'),
  menuItems: crud<FnbMenuItem>('menu-items'),
  events: crud<FnbEvent>('events'),
  haccp: crud<HaccpCheck>('haccp'),
  waste: crud<WasteRecord>('waste'),
  quality: crud<QualityCheck>('quality'),

  dashboard: async (): Promise<any> => (await apiClient.get('production/fnb/dashboard/')).data,
  outlets: async (type?: string): Promise<any> =>
    (await apiClient.get('production/fnb/outlets/', { params: type ? { type } : {} })).data,
  timing: async (): Promise<any> => (await apiClient.get('production/fnb/timing/')).data,
  reports: async (): Promise<any> => (await apiClient.get('production/fnb/reports/')).data,

  // Lookups reutilizados
  items: async (search?: string): Promise<any[]> =>
    (await apiClient.get('inventory/items/', { params: search ? { search } : {} })).data,
  areas: async (): Promise<any[]> => (await apiClient.get('production/areas/')).data,
  uoms: async (): Promise<any[]> => (await apiClient.get('inventory/uoms/')).data,
};
