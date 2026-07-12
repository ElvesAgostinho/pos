import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { posMgmtApi } from '../api/posmgmt';
import type { Outlet, POSProductConfig, OutletPaymentMethod } from '../api/posmgmt';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['posmgmt'] });

export const useOutlets = () => useQuery({ queryKey: ['posmgmt', 'outlets'], queryFn: posMgmtApi.getOutlets });
export const useCreateOutlet = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<Outlet>) => posMgmtApi.createOutlet(p), onSuccess: () => inval(qc) });
};
export const useDeleteOutlet = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.deleteOutlet(id), onSuccess: () => inval(qc) });
};

export const useProductConfigs = (outlet?: number) =>
  useQuery({ queryKey: ['posmgmt', 'product-configs', outlet], queryFn: () => posMgmtApi.getProductConfigs(outlet!), enabled: !!outlet });
export const useCreateProductConfig = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<POSProductConfig>) => posMgmtApi.createProductConfig(p), onSuccess: () => inval(qc) });
};
export const useUpdateProductConfig = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<POSProductConfig> }) => posMgmtApi.updateProductConfig(id, data), onSuccess: () => inval(qc) });
};
export const useDeleteProductConfig = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.deleteProductConfig(id), onSuccess: () => inval(qc) });
};

export const useOutletPayments = (outlet?: number) =>
  useQuery({ queryKey: ['posmgmt', 'outlet-payments', outlet], queryFn: () => posMgmtApi.getOutletPayments(outlet!), enabled: !!outlet });
export const useCreateOutletPayment = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: Partial<OutletPaymentMethod>) => posMgmtApi.createOutletPayment(p), onSuccess: () => inval(qc) });
};
export const useDeleteOutletPayment = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.deleteOutletPayment(id), onSuccess: () => inval(qc) });
};

// Motor de Caixa
export const useCashSessions = () => useQuery({ queryKey: ['posmgmt', 'cash'], queryFn: posMgmtApi.getCashSessions });
export const useOpenCashSession = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => posMgmtApi.openCashSession(p), onSuccess: () => inval(qc) });
};
export const useAddCashMovement = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: number; data: any }) => posMgmtApi.addCashMovement(id, data), onSuccess: () => inval(qc) });
};
export const useCloseCashSession = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, counted, notes }: { id: number; counted: any; notes?: string }) => posMgmtApi.closeCashSession(id, counted, notes), onSuccess: () => inval(qc) });
};

// Mesas
export const useTables = (outlet?: number) =>
  useQuery({ queryKey: ['posmgmt', 'tables', outlet], queryFn: () => posMgmtApi.getTables(outlet), enabled: outlet !== undefined });
export const useCreateTable = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => posMgmtApi.createTable(p), onSuccess: () => inval(qc) });
};
export const useUpdateTable = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: number; data: any }) => posMgmtApi.updateTable(id, data), onSuccess: () => inval(qc) });
};
export const useDeleteTable = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.deleteTable(id), onSuccess: () => inval(qc) });
};

// Vendas (tickets)
export const useTickets = (params?: any) =>
  useQuery({ queryKey: ['posmgmt', 'tickets', params], queryFn: () => posMgmtApi.getTickets(params) });
export const useTicket = (id?: number) =>
  useQuery({ queryKey: ['posmgmt', 'ticket', id], queryFn: () => posMgmtApi.getTicket(id!), enabled: !!id });
export const useOpenTicket = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => posMgmtApi.openTicket(p), onSuccess: () => inval(qc) });
};
export const useAddTicketLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, line }: { id: number; line: any }) => posMgmtApi.addTicketLine(id, line), onSuccess: () => inval(qc) });
};
export const useDeleteTicketLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.deleteTicketLine(id), onSuccess: () => inval(qc) });
};
export const usePayTicket = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, pm, amount }: { id: number; pm: number; amount: any }) => posMgmtApi.payTicket(id, pm, amount), onSuccess: () => inval(qc) });
};
export const useFireKitchen = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.fireKitchen(id), onSuccess: () => inval(qc) });
};

// KDS
export const useKDS = (station?: string) =>
  useQuery({ queryKey: ['posmgmt', 'kds', station], queryFn: () => posMgmtApi.getKDS(station), refetchInterval: 5000 });
export const useAdvanceKDS = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.advanceKDS(id), onSuccess: () => inval(qc) });
};

// Documentos (Motor 7)
export const useTicketDocuments = (ticketId?: number) =>
  useQuery({ queryKey: ['posmgmt', 'documents', ticketId], queryFn: () => posMgmtApi.getTicketDocuments(ticketId!), enabled: !!ticketId });
export const useIssueDocument = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, type, customer }: { id: number; type: string; customer?: any }) => posMgmtApi.issueDocument(id, type, customer), onSuccess: () => inval(qc) });
};

// Auditoria (Motor 10)
export const useAudit = (eventType?: string) =>
  useQuery({ queryKey: ['posmgmt', 'audit', eventType], queryFn: () => posMgmtApi.getAudit(eventType), refetchInterval: 10000 });

// Motor 8 — spooler de impressão
export const usePrintJobs = (status?: string) =>
  useQuery({ queryKey: ['posmgmt', 'print-jobs', status], queryFn: () => posMgmtApi.getPrintJobs(status), refetchInterval: 5000 });
export const useMarkPrinted = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.markPrinted(id), onSuccess: () => inval(qc) });
};
export const useRetryPrint = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => posMgmtApi.retryPrint(id), onSuccess: () => inval(qc) });
};

// Motor 3 — reservas de mesa
export const usePosReservations = (params?: any) =>
  useQuery({ queryKey: ['posmgmt', 'reservations', params], queryFn: () => posMgmtApi.getPosReservations(params) });
export const useCreatePosReservation = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => posMgmtApi.createPosReservation(p), onSuccess: () => inval(qc) });
};
export const useSeatReservation = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, table }: { id: number; table?: number }) => posMgmtApi.seatReservation(id, table), onSuccess: () => inval(qc) });
};
export const useCancelPosReservation = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, noShow }: { id: number; noShow?: boolean }) => posMgmtApi.cancelPosReservation(id, noShow), onSuccess: () => inval(qc) });
};

// Resumo operacional (dashboard / supervisão)
export const usePosSummary = (outlet?: number) =>
  useQuery({ queryKey: ['posmgmt', 'summary', outlet], queryFn: () => posMgmtApi.getSummary(outlet), refetchInterval: 15000 });

// Motor 6 — gift cards
export const useGiftCards = () => useQuery({ queryKey: ['posmgmt', 'gift-cards'], queryFn: posMgmtApi.getGiftCards });
export const useCreateGiftCard = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => posMgmtApi.createGiftCard(p), onSuccess: () => inval(qc) });
};
