import { apiClient } from './client';

export interface SupplierInvoice {
  id: number; number: string; supplier_name: string; supplier_ref?: string; grn_ref?: string;
  date: string; due_date?: string | null; amount: string; paid_amount: string; balance: string;
  status: string; status_display?: string;
}

export const payablesApi = {
  list: async (params?: any): Promise<SupplierInvoice[]> => (await apiClient.get('finance/supplier-invoices/', { params })).data,
  pay: async (id: number, account: number, amount?: string | number) => (await apiClient.post(`finance/supplier-invoices/${id}/pay/`, { account, amount })).data,
  statement: async (id: number) => (await apiClient.get(`finance/supplier-invoices/${id}/statement/`)).data,
};
