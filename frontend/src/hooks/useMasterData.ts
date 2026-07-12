import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterdataApi } from '../api/masterdata';
import type { MdItem, MdUom, MdCategory, MdTax, MdBrand, MdPaymentMethod } from '../api/masterdata';

const key = ['masterdata'];
const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: key });

// Items
export const useMdItems = (params?: any) =>
  useQuery({ queryKey: ['masterdata', 'items', params], queryFn: () => masterdataApi.items.list(params) });
export const useMdCreateItem = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<MdItem>) => masterdataApi.items.create(p), onSuccess: () => inval(qc) });
};
export const useMdUpdateItem = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<MdItem> }) => masterdataApi.items.update(id, data), onSuccess: () => inval(qc) });
};
export const useMdDeleteItem = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => masterdataApi.items.remove(id), onSuccess: () => inval(qc) });
};

// UoMs
export const useMdUoms = () =>
  useQuery({ queryKey: ['masterdata', 'uoms'], queryFn: () => masterdataApi.uoms.list() });
export const useMdCreateUom = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<MdUom>) => masterdataApi.uoms.create(p), onSuccess: () => inval(qc) });
};
export const useMdDeleteUom = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => masterdataApi.uoms.remove(id), onSuccess: () => inval(qc) });
};

// Categories
export const useMdCategories = () =>
  useQuery({ queryKey: ['masterdata', 'categories'], queryFn: () => masterdataApi.categories.list() });
export const useMdCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<MdCategory>) => masterdataApi.categories.create(p), onSuccess: () => inval(qc) });
};
export const useMdDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => masterdataApi.categories.remove(id), onSuccess: () => inval(qc) });
};

// Taxes
export const useMdTaxes = () =>
  useQuery({ queryKey: ['masterdata', 'taxes'], queryFn: () => masterdataApi.taxes.list() });
export const useMdCreateTax = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<MdTax>) => masterdataApi.taxes.create(p), onSuccess: () => inval(qc) });
};
export const useMdUpdateTax = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<MdTax> }) => masterdataApi.taxes.update(id, data), onSuccess: () => inval(qc) });
};
export const useMdDeleteTax = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => masterdataApi.taxes.remove(id), onSuccess: () => inval(qc) });
};

// Brands
export const useMdBrands = () =>
  useQuery({ queryKey: ['masterdata', 'brands'], queryFn: () => masterdataApi.brands.list() });
export const useMdCreateBrand = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<MdBrand>) => masterdataApi.brands.create(p), onSuccess: () => inval(qc) });
};
export const useMdDeleteBrand = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => masterdataApi.brands.remove(id), onSuccess: () => inval(qc) });
};

// Payment Methods
export const useMdPaymentMethods = () =>
  useQuery({ queryKey: ['masterdata', 'payment-methods'], queryFn: () => masterdataApi.paymentMethods.list() });
export const useMdCreatePaymentMethod = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<MdPaymentMethod>) => masterdataApi.paymentMethods.create(p), onSuccess: () => inval(qc) });
};
export const useMdDeletePaymentMethod = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => masterdataApi.paymentMethods.remove(id), onSuccess: () => inval(qc) });
};

// Séries de Documentos
export const useMdDocumentSeries = () =>
  useQuery({ queryKey: ['masterdata', 'document-series'], queryFn: () => masterdataApi.documentSeries.list() });
export const useMdCreateDocumentSeries = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => masterdataApi.documentSeries.create(p), onSuccess: () => inval(qc) });
};
export const useMdDeleteDocumentSeries = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => masterdataApi.documentSeries.remove(id), onSuccess: () => inval(qc) });
};
