import { apiClient } from './client';

const crud = (base: string) => ({
  list: async (params?: Record<string, any>): Promise<any[]> => (await apiClient.get(base, { params })).data,
  create: async (p: any) => (await apiClient.post(base, p)).data,
  update: async (id: number, p: any) => (await apiClient.patch(`${base}${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`${base}${id}/`); },
});

export const hmcApi = {
  buildings: crud('org/buildings/'),
  floors: crud('org/floors/'),
  profitCenters: crud('org/profit-centers/'),
  costCenters: crud('finance/cost-centers/'),
  resources: crud('org/resources/'),
  dashboard: async (): Promise<any> => (await apiClient.get('org/hmc/dashboard/')).data,
  hotels: async (): Promise<any[]> => (await apiClient.get('org/hotels/')).data,
};
