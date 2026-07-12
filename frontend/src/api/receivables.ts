import { apiClient } from './client';

export const receivablesApi = {
  invoices: async (): Promise<any[]> => (await apiClient.get('finance/invoices/')).data,
  receive: async (id: number, account: number, amount?: string | number) => (await apiClient.post(`finance/invoices/${id}/receive/`, { account, amount })).data,
  customers: async (): Promise<any[]> => (await apiClient.get('finance/invoices/customers/')).data,
};
