import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mdmApi } from '../api/mdm';
import type { Item, Category, Tax, Uom, Brand, Supplier } from '../api/mdm';

// Categories Hooks
export const useCategories = () => {
  return useQuery({ queryKey: ['categories'], queryFn: mdmApi.getCategories });
};
export const useCreateCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.createCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
};
export const useUpdateCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) => mdmApi.updateCategory(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
};
export const useDeleteCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.deleteCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
};

// Taxes Hooks
export const useTaxes = () => {
  return useQuery({ queryKey: ['taxes'], queryFn: mdmApi.getTaxes });
};
export const useCreateTax = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.createTax,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['taxes'] }),
  });
};
export const useUpdateTax = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Tax> }) => mdmApi.updateTax(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['taxes'] }),
  });
};
export const useDeleteTax = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.deleteTax,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['taxes'] }),
  });
};

// Uoms Hooks
export const useUoms = () => {
  return useQuery({ queryKey: ['uoms'], queryFn: mdmApi.getUoms });
};
export const useCreateUom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.createUom,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uoms'] }),
  });
};
export const useUpdateUom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Uom> }) => mdmApi.updateUom(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uoms'] }),
  });
};
export const useDeleteUom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.deleteUom,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uoms'] }),
  });
};

// Brands Hooks
export const useBrands = () => {
  return useQuery({ queryKey: ['brands'], queryFn: mdmApi.getBrands });
};
export const useCreateBrand = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.createBrand,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brands'] }),
  });
};
export const useUpdateBrand = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Brand> }) => mdmApi.updateBrand(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brands'] }),
  });
};
export const useDeleteBrand = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.deleteBrand,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brands'] }),
  });
};

// Suppliers Hooks
export const useSuppliers = () => {
  return useQuery({ queryKey: ['suppliers'], queryFn: mdmApi.getSuppliers });
};
export const useCreateSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.createSupplier,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};
export const useUpdateSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Supplier> }) => mdmApi.updateSupplier(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};
export const useDeleteSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.deleteSupplier,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

export const useItems = () => {
  return useQuery({
    queryKey: ['items'],
    queryFn: mdmApi.getItems,
  });
};

export const useCreateItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useUpdateItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Item> }) => mdmApi.updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useDeleteItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mdmApi.deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
};


