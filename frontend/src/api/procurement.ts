import { apiClient } from './client';

export interface Warehouse { id: number; name: string; hotel?: number; hotel_name?: string; }

export interface POLine {
  id?: number; purchase_order?: number; item: number; item_name?: string; item_code?: string;
  quantity_requested: string | number; uom: number; uom_code?: string;
  unit_price: string | number; line_total?: string;
}
export interface PurchaseOrder {
  id?: number; po_number: string; supplier: number; supplier_name?: string;
  hotel?: number | null; delivery_warehouse: number; warehouse_name?: string;
  expected_delivery_date?: string | null; status?: string; status_display?: string;
  total_amount?: string; lines?: POLine[];
}

export interface GRNLine {
  id?: number; goods_receipt?: number; po_line?: number | null; item: number; item_name?: string; item_code?: string;
  quantity_received: string | number; uom: number; uom_code?: string; unit_cost: string | number;
}
export interface GoodsReceipt {
  id?: number; receipt_number: string; purchase_order?: number | null; po_number?: string | null;
  supplier?: number; supplier_name?: string; delivery_warehouse?: number; warehouse_name?: string;
  supplier_invoice_ref?: string | null; status?: string; status_display?: string; lines?: GRNLine[];
}

export const procurementApi = {
  // Lookups
  getWarehouses: async (): Promise<Warehouse[]> => (await apiClient.get('inventory/warehouses/')).data,

  // Purchase Orders
  getPOs: async (params?: any): Promise<PurchaseOrder[]> => (await apiClient.get('procurement/purchase-orders/', { params })).data,
  getPO: async (id: number): Promise<PurchaseOrder> => (await apiClient.get(`procurement/purchase-orders/${id}/`)).data,
  createPO: async (p: Partial<PurchaseOrder>): Promise<PurchaseOrder> => (await apiClient.post('procurement/purchase-orders/', p)).data,
  updatePO: async (id: number, p: Partial<PurchaseOrder>) => (await apiClient.patch(`procurement/purchase-orders/${id}/`, p)).data,
  deletePO: async (id: number) => { await apiClient.delete(`procurement/purchase-orders/${id}/`); },
  setPOStatus: async (id: number, status: string) => (await apiClient.post(`procurement/purchase-orders/${id}/set_status/`, { status })).data,
  addPOLine: async (p: Partial<POLine>) => (await apiClient.post('procurement/po-lines/', p)).data,
  deletePOLine: async (id: number) => { await apiClient.delete(`procurement/po-lines/${id}/`); },

  // Goods Receipts
  getGRNs: async (params?: any): Promise<GoodsReceipt[]> => (await apiClient.get('procurement/goods-receipts/', { params })).data,
  getGRN: async (id: number): Promise<GoodsReceipt> => (await apiClient.get(`procurement/goods-receipts/${id}/`)).data,
  createGRN: async (p: Partial<GoodsReceipt>): Promise<GoodsReceipt> => (await apiClient.post('procurement/goods-receipts/', p)).data,
  deleteGRN: async (id: number) => { await apiClient.delete(`procurement/goods-receipts/${id}/`); },
  validateGRN: async (id: number) => (await apiClient.post(`procurement/goods-receipts/${id}/validate_receipt/`)).data,
  addGRNLine: async (p: Partial<GRNLine>) => (await apiClient.post('procurement/grn-lines/', p)).data,
  deleteGRNLine: async (id: number) => { await apiClient.delete(`procurement/grn-lines/${id}/`); },
};

export const PO_STATUS: Record<string, string> = {
  Draft: 'Rascunho', Pending_Approval: 'A Aguardar Aprovação', Approved: 'Aprovada',
  Sent: 'Enviada ao Fornecedor', Partial_Received: 'Receção Parcial', Closed: 'Fechada', Canceled: 'Cancelada',
};
export const GRN_STATUS: Record<string, string> = {
  Draft: 'Em Conferência', Validated: 'Validada', Canceled: 'Cancelada',
};
