import { apiClient } from './client';

export interface FinanceAccount { id?: number; hotel?: number; code: string; name: string; account_type: string; account_type_display?: string; currency?: string; opening_balance?: string | number; balance?: string; is_active?: boolean; }
export interface CostCenter { id?: number; hotel?: number; code: string; name: string; is_active?: boolean; }
export interface Receipt { id?: number; number?: string; account: number; account_name?: string; cost_center?: number | null; party_name: string; description?: string; amount: string | number; method?: string; reference?: string; date: string; status?: string; status_display?: string; }
export interface PaymentVoucher { id?: number; number?: string; account: number; account_name?: string; cost_center?: number | null; party_name: string; description?: string; amount: string | number; method?: string; reference?: string; date: string; status?: string; status_display?: string; }
export interface InvoiceLine { id?: number; description: string; quantity: string | number; unit_price: string | number; tax_percentage?: string | number; line_total?: string; }
export interface Invoice { id?: number; number?: string; hotel?: number; customer_name: string; customer_tax_id?: string; date: string; due_date?: string; subtotal?: string; tax_total?: string; total?: string; status?: string; status_display?: string; lines?: InvoiceLine[]; notes?: string; }

export const financeApi = {
  getAccounts: async (): Promise<FinanceAccount[]> => (await apiClient.get('finance/accounts/')).data,
  createAccount: async (p: Partial<FinanceAccount>) => (await apiClient.post('finance/accounts/', p)).data,

  getCostCenters: async (): Promise<CostCenter[]> => (await apiClient.get('finance/cost-centers/')).data,
  createCostCenter: async (p: Partial<CostCenter>) => (await apiClient.post('finance/cost-centers/', p)).data,
  deleteCostCenter: async (id: number) => { await apiClient.delete(`finance/cost-centers/${id}/`); },

  getReceipts: async (): Promise<Receipt[]> => (await apiClient.get('finance/receipts/')).data,
  createReceipt: async (p: Partial<Receipt>) => (await apiClient.post('finance/receipts/', p)).data,
  confirmReceipt: async (id: number) => (await apiClient.post(`finance/receipts/${id}/confirm/`, {})).data,
  cancelReceipt: async (id: number) => (await apiClient.post(`finance/receipts/${id}/cancel/`, {})).data,

  getPayments: async (): Promise<PaymentVoucher[]> => (await apiClient.get('finance/payments/')).data,
  createPayment: async (p: Partial<PaymentVoucher>) => (await apiClient.post('finance/payments/', p)).data,
  confirmPayment: async (id: number) => (await apiClient.post(`finance/payments/${id}/confirm/`, {})).data,
  cancelPayment: async (id: number) => (await apiClient.post(`finance/payments/${id}/cancel/`, {})).data,

  getInvoices: async (): Promise<Invoice[]> => (await apiClient.get('finance/invoices/')).data,
  createInvoice: async (p: Partial<Invoice>) => (await apiClient.post('finance/invoices/', p)).data,
  issueInvoice: async (id: number) => (await apiClient.post(`finance/invoices/${id}/issue/`, {})).data,
  markInvoicePaid: async (id: number) => (await apiClient.post(`finance/invoices/${id}/mark_paid/`, {})).data,
  cancelInvoice: async (id: number) => (await apiClient.post(`finance/invoices/${id}/cancel/`, {})).data,
};
