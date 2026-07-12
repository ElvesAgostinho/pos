import { apiClient } from './client';

const crud = (base: string) => ({
  list: async (): Promise<any[]> => (await apiClient.get(`${base}/`)).data,
  create: async (p: any) => (await apiClient.post(`${base}/`, p)).data,
  update: async (id: number, p: any) => (await apiClient.patch(`${base}/${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`${base}/${id}/`); },
});

export const cadastrosApi = {
  currencies: crud('mdm/currencies'),
  countries: crud('mdm/countries'),
  banks: crud('mdm/banks'),
  languages: crud('mdm/languages'),
  customers: crud('mdm/customers'),
};
export type CadEnt = keyof typeof cadastrosApi;
