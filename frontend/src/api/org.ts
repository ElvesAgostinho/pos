import { apiClient } from './client';

export interface Company { id?: number; group?: number; group_name?: string; name: string; tax_id?: string; }
export interface Hotel { id?: number; company?: number; company_name?: string; name: string; location?: string; }
export interface Department { id?: number; hotel?: number; hotel_name?: string; name: string; }
export interface Area { id?: number; department?: number; department_name?: string; name: string; }

const crud = (base: string) => ({
  list: async (params?: any): Promise<any[]> => (await apiClient.get(`org/${base}/`, { params })).data,
  create: async (p: any) => (await apiClient.post(`org/${base}/`, p)).data,
  update: async (id: number, p: any) => (await apiClient.patch(`org/${base}/${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`org/${base}/${id}/`); },
});

export const orgApi = {
  companies: crud('companies'),
  hotels: crud('hotels'),
  departments: crud('departments'),
  areas: crud('areas'),
};
