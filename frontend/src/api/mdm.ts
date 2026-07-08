import { apiClient } from './client';

export interface Category {
  id: string;
  name: string;
  description?: string;
  parent: string | null;
}

export interface Tax {
  id: string;
  code: string;
  name: string;
  percentage: string;
}

export interface Uom {
  id: string;
  code: string;
  name: string;
}

export interface Brand {
  id: string;
  name: string;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface Item {
  id?: string;
  code: string;
  name: string;
  description?: string;
  base_price: string | number;
  cost_price?: string | number;
  item_type: string;
  is_active: boolean;
  category: string | null;
  tax: string | null;
  uom?: string | null;
  brand?: string | null;
  supplier?: string | null;
  category_name?: string;
  tax_percentage?: number;
  brand_name?: string;
}

export const mdmApi = {
  // Categories
  getCategories: async (): Promise<Category[]> => {
    const { data } = await apiClient.get<Category[]>('mdm/categories/');
    return data;
  },
  createCategory: async (categoryData: Partial<Category>): Promise<Category> => {
    const { data } = await apiClient.post<Category>('mdm/categories/', categoryData);
    return data;
  },
  updateCategory: async (id: string, categoryData: Partial<Category>): Promise<Category> => {
    const { data } = await apiClient.put<Category>(`mdm/categories/${id}/`, categoryData);
    return data;
  },
  deleteCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`mdm/categories/${id}/`);
  },

  // Taxes
  getTaxes: async (): Promise<Tax[]> => {
    const { data } = await apiClient.get<Tax[]>('mdm/taxes/');
    return data;
  },
  createTax: async (taxData: Partial<Tax>): Promise<Tax> => {
    const { data } = await apiClient.post<Tax>('mdm/taxes/', taxData);
    return data;
  },
  updateTax: async (id: string, taxData: Partial<Tax>): Promise<Tax> => {
    const { data } = await apiClient.put<Tax>(`mdm/taxes/${id}/`, taxData);
    return data;
  },
  deleteTax: async (id: string): Promise<void> => {
    await apiClient.delete(`mdm/taxes/${id}/`);
  },

  // UOMs
  getUoms: async (): Promise<Uom[]> => {
    const { data } = await apiClient.get<Uom[]>('mdm/uoms/');
    return data;
  },
  createUom: async (uomData: Partial<Uom>): Promise<Uom> => {
    const { data } = await apiClient.post<Uom>('mdm/uoms/', uomData);
    return data;
  },
  updateUom: async (id: string, uomData: Partial<Uom>): Promise<Uom> => {
    const { data } = await apiClient.put<Uom>(`mdm/uoms/${id}/`, uomData);
    return data;
  },
  deleteUom: async (id: string): Promise<void> => {
    await apiClient.delete(`mdm/uoms/${id}/`);
  },

  // Brands
  getBrands: async (): Promise<Brand[]> => {
    const { data } = await apiClient.get<Brand[]>('mdm/brands/');
    return data;
  },
  createBrand: async (brandData: Partial<Brand>): Promise<Brand> => {
    const { data } = await apiClient.post<Brand>('mdm/brands/', brandData);
    return data;
  },
  updateBrand: async (id: string, brandData: Partial<Brand>): Promise<Brand> => {
    const { data } = await apiClient.put<Brand>(`mdm/brands/${id}/`, brandData);
    return data;
  },
  deleteBrand: async (id: string): Promise<void> => {
    await apiClient.delete(`mdm/brands/${id}/`);
  },

  // Suppliers
  getSuppliers: async (): Promise<Supplier[]> => {
    const { data } = await apiClient.get<Supplier[]>('mdm/suppliers/');
    return data;
  },
  createSupplier: async (supplierData: Partial<Supplier>): Promise<Supplier> => {
    const { data } = await apiClient.post<Supplier>('mdm/suppliers/', supplierData);
    return data;
  },
  updateSupplier: async (id: string, supplierData: Partial<Supplier>): Promise<Supplier> => {
    const { data } = await apiClient.put<Supplier>(`mdm/suppliers/${id}/`, supplierData);
    return data;
  },
  deleteSupplier: async (id: string): Promise<void> => {
    await apiClient.delete(`mdm/suppliers/${id}/`);
  },

  // Items
  getItems: async (): Promise<Item[]> => {
    const { data } = await apiClient.get<Item[]>('mdm/items/');
    return data;
  },
  
  createItem: async (itemData: Partial<Item>): Promise<Item> => {
    const { data } = await apiClient.post<Item>('mdm/items/', itemData);
    return data;
  },

  updateItem: async (id: string, itemData: Partial<Item>): Promise<Item> => {
    const { data } = await apiClient.put<Item>(`mdm/items/${id}/`, itemData);
    return data;
  },

  deleteItem: async (id: string): Promise<void> => {
    await apiClient.delete(`mdm/items/${id}/`);
  }
};
