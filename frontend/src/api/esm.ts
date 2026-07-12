import { apiClient } from './client';

// ---------- Tipos ----------

export interface SupplierCategory {
  id?: number;
  name: string;
  description?: string | null;
}

export interface SupplierContact {
  id?: number;
  supplier?: number;
  role: string;
  name: string;
  job_title?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

export interface SupplierContract {
  id?: number;
  supplier?: number;
  reference: string;
  start_date: string;
  end_date?: string | null;
  base_discount_percentage?: string | number;
  bonus_description?: string | null;
  incoterms?: string | null;
  is_active?: boolean;
}

export interface SupplierDocument {
  id?: number;
  supplier?: number;
  document_type: string;
  title: string;
  file_url?: string | null;
  issue_date?: string | null;
  expiration_date?: string | null;
}

export interface SupplierQualityControl {
  id?: number;
  supplier?: number;
  requires_haccp?: boolean;
  requires_cold_chain?: boolean;
  required_temperature?: string | null;
  audit_notes?: string | null;
  last_audit_date?: string | null;
}

export interface SupplierProductCatalog {
  id?: number;
  supplier?: number;
  item: number;
  item_name?: string;
  item_code?: string;
  supplier_item_code?: string | null;
  agreed_price: string | number;
  vat_percentage?: string | number;
  is_active?: boolean;
}

export interface SupplierPerformanceProfile {
  id?: number;
  supplier?: number;
  overall_score: number;
  punctuality_percentage: string | number;
  completeness_percentage: string | number;
  price_variance_percentage: string | number;
  return_rate_percentage: string | number;
  total_orders: number;
  total_grns: number;
  last_calculated_at?: string;
}

export interface Supplier {
  id?: number;
  code: string;
  supplier_type: 'INDIVIDUAL' | 'COMPANY' | 'GROUP';
  commercial_name: string;
  legal_name?: string | null;
  nif?: string | null;
  vat_number?: string | null;
  website?: string | null;
  currency?: string;
  language?: string;
  country?: string;
  city?: string | null;
  zone?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  minimum_order_value?: string | number;
  delivery_days?: number;
  status: 'ACTIVE' | 'BLOCKED' | 'EVALUATION';
  category_ids?: number[];
  // Read-only nested
  categories?: SupplierCategory[];
  contacts?: SupplierContact[];
  contracts?: SupplierContract[];
  documents?: SupplierDocument[];
  quality_controls?: SupplierQualityControl[];
  performance_profile?: SupplierPerformanceProfile | null;
  created_at?: string;
  updated_at?: string;
}

export interface EsmDashboard {
  total_suppliers: number;
  active: number;
  blocked: number;
  evaluation: number;
  local: number;
  international: number;
  expired_documents: number;
  expiring_documents: Array<{
    id: number; supplier_id: number; supplier_name: string;
    title: string; document_type: string; expiration_date: string;
  }>;
  expiring_contracts: Array<{
    id: number; supplier_id: number; supplier_name: string;
    reference: string; end_date: string;
  }>;
  top_suppliers: Array<{
    id: number; code: string; commercial_name: string;
    overall_score: number; punctuality: string | number;
  }>;
}

// ---------- API ----------

export const esmApi = {
  getDashboard: async (): Promise<EsmDashboard> => {
    const { data } = await apiClient.get<EsmDashboard>('esm/suppliers/dashboard/');
    return data;
  },

  getSuppliers: async (params?: { status?: string; search?: string; category?: number }): Promise<Supplier[]> => {
    const { data } = await apiClient.get<Supplier[]>('esm/suppliers/', { params });
    return data;
  },
  getSupplier: async (id: number): Promise<Supplier> => {
    const { data } = await apiClient.get<Supplier>(`esm/suppliers/${id}/`);
    return data;
  },
  createSupplier: async (payload: Partial<Supplier>): Promise<Supplier> => {
    const { data } = await apiClient.post<Supplier>('esm/suppliers/', payload);
    return data;
  },
  updateSupplier: async (id: number, payload: Partial<Supplier>): Promise<Supplier> => {
    const { data } = await apiClient.patch<Supplier>(`esm/suppliers/${id}/`, payload);
    return data;
  },
  deleteSupplier: async (id: number): Promise<void> => {
    await apiClient.delete(`esm/suppliers/${id}/`);
  },
  recalcPerformance: async (id: number): Promise<SupplierPerformanceProfile> => {
    const { data } = await apiClient.post<SupplierPerformanceProfile>(`esm/suppliers/${id}/performance/`);
    return data;
  },

  getCategories: async (): Promise<SupplierCategory[]> => {
    const { data } = await apiClient.get<SupplierCategory[]>('esm/categories/');
    return data;
  },

  // Coleções filhas (filtradas por ?supplier=)
  createContact: async (p: Partial<SupplierContact>) => (await apiClient.post<SupplierContact>('esm/contacts/', p)).data,
  deleteContact: async (id: number) => { await apiClient.delete(`esm/contacts/${id}/`); },

  listContracts: async (): Promise<SupplierContract[]> => (await apiClient.get('esm/contracts/')).data,
  createContract: async (p: Partial<SupplierContract>) => (await apiClient.post<SupplierContract>('esm/contracts/', p)).data,
  updateContract: async (id: number, p: Partial<SupplierContract>) => (await apiClient.patch<SupplierContract>(`esm/contracts/${id}/`, p)).data,
  deleteContract: async (id: number) => { await apiClient.delete(`esm/contracts/${id}/`); },

  listDocuments: async (): Promise<SupplierDocument[]> => (await apiClient.get('esm/documents/')).data,
  createDocument: async (p: Partial<SupplierDocument>) => (await apiClient.post<SupplierDocument>('esm/documents/', p)).data,
  deleteDocument: async (id: number) => { await apiClient.delete(`esm/documents/${id}/`); },

  listQuality: async (): Promise<SupplierQualityControl[]> => (await apiClient.get('esm/quality-controls/')).data,
  createQuality: async (p: Partial<SupplierQualityControl>) => (await apiClient.post('esm/quality-controls/', p)).data,
  deleteQuality: async (id: number) => { await apiClient.delete(`esm/quality-controls/${id}/`); },

  listPerformance: async (): Promise<SupplierPerformanceProfile[]> => (await apiClient.get('esm/performance/')).data,

  createCatalogEntry: async (p: Partial<SupplierProductCatalog>) => (await apiClient.post<SupplierProductCatalog>('esm/catalog/', p)).data,
  deleteCatalogEntry: async (id: number) => { await apiClient.delete(`esm/catalog/${id}/`); },
};
