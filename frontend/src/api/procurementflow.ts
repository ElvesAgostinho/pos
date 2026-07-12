import { apiClient } from './client';

export const procApi = {
  // Requisições
  getRequisitions: async (params?: any): Promise<any[]> => (await apiClient.get('procurement/requisitions/', { params })).data,
  createRequisition: async (p: any) => (await apiClient.post('procurement/requisitions/', p)).data,
  reqAction: async (id: number, act: 'submit' | 'approve' | 'reject', data?: any) => (await apiClient.post(`procurement/requisitions/${id}/${act}/`, data || {})).data,
  createRfq: async (id: number) => (await apiClient.post(`procurement/requisitions/${id}/create_rfq/`, {})).data,

  // RFQ + cotações + comparação
  getRfqs: async (): Promise<any[]> => (await apiClient.get('procurement/rfqs/')).data,
  addQuote: async (rfq: number, supplier: number, prices?: any[]) => (await apiClient.post(`procurement/rfqs/${rfq}/add_quote/`, { supplier, prices })).data,
  comparison: async (rfq: number) => (await apiClient.get(`procurement/rfqs/${rfq}/comparison/`)).data,
  getQuotes: async (rfq: number): Promise<any[]> => (await apiClient.get('procurement/quotes/', { params: { rfq } })).data,
  convertToPo: async (quote: number) => (await apiClient.post(`procurement/quotes/${quote}/convert_to_po/`, {})).data,

  // apoios
  getSuppliers: async (): Promise<any[]> => (await apiClient.get('esm/suppliers/')).data,
  getUoms: async (): Promise<any[]> => (await apiClient.get('inventory/uoms/')).data,
};
