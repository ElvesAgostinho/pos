import { apiClient } from './client';

// Master Data — fonte ÚNICA de artigos, unidades e categorias (app inventory).
export interface MdItem {
  id?: number;
  code: string;
  name: string;
  item_type: string;
  item_type_display?: string;
  category?: number | null;
  category_name?: string | null;
  brand?: number | null;
  brand_name?: string | null;
  base_uom: number;
  base_uom_code?: string;
  current_average_cost?: string | number;
  sale_price?: string | number | null;
  purchase_price?: string | number | null;
  tax_percentage?: string | number;
  barcode?: string | null;
  image_url?: string | null;
  min_stock?: string | number;
  max_stock?: string | number | null;
  is_sold?: boolean;
  is_purchased?: boolean;
  allow_fraction?: boolean;
  is_active?: boolean;
}
export interface MdUom { id?: number; code: string; name: string; }
export interface MdCategory { id?: number; name: string; parent?: number | null; }
export interface MdTax { id?: number; code: string; name: string; percentage: string | number; is_active?: boolean; }
export interface MdBrand { id?: number; name: string; manufacturer?: string | null; is_active?: boolean; }
export interface MdPaymentMethod {
  id?: number; code: string; name: string; method_type: string; method_type_display?: string;
  currency?: string; allows_change?: boolean; allows_refund?: boolean; allows_partial?: boolean;
  allows_mixed?: boolean; allows_multicurrency?: boolean; fee_percentage?: string | number;
  sort_order?: number; icon?: string | null; color?: string | null; is_active?: boolean;
}

const crud = <T,>(base: string) => ({
  list: async (params?: any): Promise<T[]> => (await apiClient.get(base, { params })).data,
  create: async (p: Partial<T>): Promise<T> => (await apiClient.post(base, p)).data,
  update: async (id: number, p: Partial<T>): Promise<T> => (await apiClient.patch(`${base}${id}/`, p)).data,
  remove: async (id: number): Promise<void> => { await apiClient.delete(`${base}${id}/`); },
});

export const masterdataApi = {
  items: crud<MdItem>('inventory/items/'),
  uoms: crud<MdUom>('inventory/uoms/'),
  categories: crud<MdCategory>('inventory/categories/'),
  taxes: crud<MdTax>('mdm/taxes/'),
  brands: crud<MdBrand>('mdm/brands/'),
  paymentMethods: crud<MdPaymentMethod>('mdm/payment-methods/'),
  documentSeries: crud<MdDocumentSeries>('mdm/document-series/'),
};

export interface MdDocumentSeries {
  id?: number; code: string; name: string; document_type: string; document_type_display?: string;
  prefix?: string; year?: number; current_number?: number; is_active?: boolean;
}
export const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: 'PROFORMA', label: 'Pré-conta / Proforma' }, { value: 'INVOICE', label: 'Fatura' },
  { value: 'SIMPLIFIED', label: 'Fatura Simplificada' }, { value: 'CREDIT_NOTE', label: 'Nota de Crédito' },
  { value: 'RECEIPT', label: 'Recibo' },
];

export const ITEM_TYPES: { value: string; label: string }[] = [
  { value: 'RawMaterial', label: 'Matéria-Prima' },
  { value: 'Manufactured', label: 'Produzido (Ficha Técnica)' },
  { value: 'Retail', label: 'Revenda' },
  { value: 'Service', label: 'Serviço' },
];
