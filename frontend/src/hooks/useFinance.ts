import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import type { FinanceAccount, CostCenter, Receipt, PaymentVoucher, Invoice } from '../api/finance';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['finance'] });

export const useAccounts = () => useQuery({ queryKey: ['finance', 'accounts'], queryFn: financeApi.getAccounts });
export const useCreateAccount = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<FinanceAccount>) => financeApi.createAccount(p), onSuccess: () => inval(qc) }); };

export const useCostCenters = () => useQuery({ queryKey: ['finance', 'cost-centers'], queryFn: financeApi.getCostCenters });
export const useCreateCostCenter = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<CostCenter>) => financeApi.createCostCenter(p), onSuccess: () => inval(qc) }); };
export const useDeleteCostCenter = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => financeApi.deleteCostCenter(id), onSuccess: () => inval(qc) }); };

export const useReceipts = () => useQuery({ queryKey: ['finance', 'receipts'], queryFn: financeApi.getReceipts });
export const useCreateReceipt = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<Receipt>) => financeApi.createReceipt(p), onSuccess: () => inval(qc) }); };
export const useConfirmReceipt = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => financeApi.confirmReceipt(id), onSuccess: () => inval(qc) }); };

export const usePayments = () => useQuery({ queryKey: ['finance', 'payments'], queryFn: financeApi.getPayments });
export const useCreatePayment = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<PaymentVoucher>) => financeApi.createPayment(p), onSuccess: () => inval(qc) }); };
export const useConfirmPayment = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => financeApi.confirmPayment(id), onSuccess: () => inval(qc) }); };

export const useInvoices = () => useQuery({ queryKey: ['finance', 'invoices'], queryFn: financeApi.getInvoices });
export const useCreateInvoice = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<Invoice>) => financeApi.createInvoice(p), onSuccess: () => inval(qc) }); };
export const useIssueInvoice = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => financeApi.issueInvoice(id), onSuccess: () => inval(qc) }); };
export const useMarkInvoicePaid = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => financeApi.markInvoicePaid(id), onSuccess: () => inval(qc) }); };
