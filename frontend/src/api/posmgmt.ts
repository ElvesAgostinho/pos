import { apiClient } from './client';

export interface Outlet {
  id?: number; hotel?: number; hotel_name?: string; code: string; name: string;
  outlet_type: string; outlet_type_display?: string; is_active?: boolean; price_list?: number | null; warehouse?: number | null;
}
export interface POSProductConfig {
  id?: number; outlet: number; item: number; item_name?: string; item_code?: string;
  item_category?: string | null; item_sale_price?: string; is_available?: boolean; pos_price?: string | number | null;
  pos_category?: string | null; button_color?: string | null; sort_order?: number; effective_price?: string;
  kds_station?: string;
}
export interface OutletPaymentMethod {
  id?: number; outlet: number; payment_method: number; payment_method_name?: string;
  payment_method_code?: string; method_type?: string; method_type_code?: string; is_active?: boolean; sort_order?: number;
}

export const OUTLET_TYPES: { value: string; label: string }[] = [
  { value: 'RESTAURANT', label: 'Restaurante' }, { value: 'BAR', label: 'Bar' },
  { value: 'POOL_BAR', label: 'Pool Bar' }, { value: 'COFFEE', label: 'Coffee Shop' },
  { value: 'ROOM_SERVICE', label: 'Room Service' }, { value: 'MINIBAR', label: 'Minibar' },
  { value: 'SPA', label: 'Spa' }, { value: 'SHOP', label: 'Loja' },
  { value: 'BANQUET', label: 'Banquetes' }, { value: 'OTHER', label: 'Outro' },
];

export interface CashMovement {
  id?: number; session?: number; movement_type: string; movement_type_display?: string;
  amount: string | number; reason?: string | null; created_by?: string | null; created_at?: string;
}
export interface CashSession {
  id?: number; outlet?: number | null; outlet_name?: string | null; terminal_name?: string | null;
  operator_name: string; opening_float: string | number; opened_at?: string; opened_by?: string | null;
  status?: string; status_display?: string; counted_amount?: string | null; expected_amount?: string | null;
  difference?: string | null; closing_notes?: string | null; closed_at?: string | null;
  expected_cash?: string; movements?: CashMovement[];
}

export const MOVEMENT_TYPES: { value: string; label: string }[] = [
  { value: 'REFORCO', label: 'Reforço' }, { value: 'SANGRIA', label: 'Sangria' },
  { value: 'ENTRADA', label: 'Entrada Manual' }, { value: 'SAIDA', label: 'Saída Manual' },
];

export const posMgmtApi = {
  getOutlets: async (): Promise<Outlet[]> => (await apiClient.get('pos/outlets/')).data,
  createOutlet: async (p: Partial<Outlet>) => (await apiClient.post('pos/outlets/', p)).data,
  updateOutlet: async (id: number, p: Partial<Outlet>) => (await apiClient.patch(`pos/outlets/${id}/`, p)).data,
  deleteOutlet: async (id: number) => { await apiClient.delete(`pos/outlets/${id}/`); },

  getProductConfigs: async (outlet: number): Promise<POSProductConfig[]> =>
    (await apiClient.get('pos/product-configs/', { params: { outlet } })).data,
  createProductConfig: async (p: Partial<POSProductConfig>) => (await apiClient.post('pos/product-configs/', p)).data,
  updateProductConfig: async (id: number, p: Partial<POSProductConfig>) => (await apiClient.patch(`pos/product-configs/${id}/`, p)).data,
  deleteProductConfig: async (id: number) => { await apiClient.delete(`pos/product-configs/${id}/`); },

  getOutletPayments: async (outlet: number): Promise<OutletPaymentMethod[]> =>
    (await apiClient.get('pos/outlet-payment-methods/', { params: { outlet } })).data,
  createOutletPayment: async (p: Partial<OutletPaymentMethod>) => (await apiClient.post('pos/outlet-payment-methods/', p)).data,
  deleteOutletPayment: async (id: number) => { await apiClient.delete(`pos/outlet-payment-methods/${id}/`); },

  // Motor de Caixa
  getCashSessions: async (): Promise<CashSession[]> => (await apiClient.get('pos/cash-sessions/')).data,
  openCashSession: async (p: Partial<CashSession>): Promise<CashSession> => (await apiClient.post('pos/cash-sessions/', p)).data,
  addCashMovement: async (id: number, m: Partial<CashMovement>) => (await apiClient.post(`pos/cash-sessions/${id}/add_movement/`, m)).data,
  closeCashSession: async (id: number, counted_amount: string | number, closing_notes?: string) =>
    (await apiClient.post(`pos/cash-sessions/${id}/close/`, { counted_amount, closing_notes })).data,

  // Mesas
  getTables: async (outlet?: number): Promise<POSTableT[]> => (await apiClient.get('pos/tables/', { params: outlet ? { outlet } : {} })).data,
  createTable: async (p: Partial<POSTableT>) => (await apiClient.post('pos/tables/', p)).data,
  updateTable: async (id: number, p: Partial<POSTableT>) => (await apiClient.patch(`pos/tables/${id}/`, p)).data,
  deleteTable: async (id: number) => { await apiClient.delete(`pos/tables/${id}/`); },

  // Vendas (tickets)
  getTickets: async (params?: any): Promise<POSTicket[]> => (await apiClient.get('pos/tickets/', { params })).data,
  getTicket: async (id: number): Promise<POSTicket> => (await apiClient.get(`pos/tickets/${id}/`)).data,
  openTicket: async (p: Partial<POSTicket>): Promise<POSTicket> => (await apiClient.post('pos/tickets/', p)).data,
  addTicketLine: async (id: number, line: { item: number; quantity?: number | string }) =>
    (await apiClient.post(`pos/tickets/${id}/add_line/`, line)).data,
  deleteTicketLine: async (id: number) => { await apiClient.delete(`pos/ticket-lines/${id}/`); },
  payTicket: async (id: number, payment_method: number, amount: number | string) =>
    (await apiClient.post(`pos/tickets/${id}/pay/`, { payment_method, amount })).data,
  voidTicket: async (id: number) => (await apiClient.post(`pos/tickets/${id}/void/`)).data,
  fireKitchen: async (id: number) => (await apiClient.post(`pos/tickets/${id}/fire_kitchen/`)).data,

  // KDS (Motor 5)
  getKDS: async (station?: string): Promise<KDSLine[]> =>
    (await apiClient.get('pos/kds/', { params: station ? { station } : {} })).data,
  advanceKDS: async (id: number) => (await apiClient.post(`pos/kds/${id}/advance/`)).data,

  // Documentos (Motor 7)
  issueDocument: async (ticketId: number, document_type: string, customer?: { customer_name?: string; customer_tax_id?: string }) =>
    (await apiClient.post(`pos/tickets/${ticketId}/issue_document/`, { document_type, ...(customer || {}) })).data,
  getTicketDocuments: async (ticketId: number): Promise<POSDocument[]> =>
    (await apiClient.get('pos/documents/', { params: { ticket: ticketId } })).data,

  // Auditoria (Motor 10)
  getAudit: async (event_type?: string): Promise<AuditLog[]> =>
    (await apiClient.get('pos/audit/', { params: event_type ? { event_type } : {} })).data,

  // Motor 8 — spooler de impressão
  getPrintJobs: async (status?: string): Promise<PrintJob[]> =>
    (await apiClient.get('pos/print-jobs/', { params: status ? { status } : {} })).data,
  markPrinted: async (id: number) => (await apiClient.post(`pos/print-jobs/${id}/mark_printed/`)).data,
  retryPrint: async (id: number) => (await apiClient.post(`pos/print-jobs/${id}/retry/`)).data,

  // Motor 9 — sincronização offline (store-and-forward)
  syncTickets: async (tickets: any[]) => (await apiClient.post('pos/tickets/sync/', { tickets })).data,

  // Motor 3 — reservas de mesa
  getPosReservations: async (params?: any): Promise<PosReservation[]> => (await apiClient.get('pos/reservations/', { params })).data,
  createPosReservation: async (p: Partial<PosReservation>) => (await apiClient.post('pos/reservations/', p)).data,
  seatReservation: async (id: number, table?: number) => (await apiClient.post(`pos/reservations/${id}/seat/`, table ? { table } : {})).data,
  cancelPosReservation: async (id: number, no_show?: boolean) => (await apiClient.post(`pos/reservations/${id}/cancel/`, { no_show })).data,

  // Motor 6 — gift cards
  getGiftCards: async (): Promise<GiftCard[]> => (await apiClient.get('pos/gift-cards/')).data,
  createGiftCard: async (p: Partial<GiftCard>) => (await apiClient.post('pos/gift-cards/', p)).data,

  // Motor 3/4/6 — ações avançadas do ticket
  transferTable: async (id: number, table: number) => (await apiClient.post(`pos/tickets/${id}/transfer_table/`, { table })).data,
  mergeTicket: async (id: number, source: number) => (await apiClient.post(`pos/tickets/${id}/merge/`, { source })).data,
  suspendTicket: async (id: number) => (await apiClient.post(`pos/tickets/${id}/suspend/`, {})).data,
  reopenTicket: async (id: number) => (await apiClient.post(`pos/tickets/${id}/reopen/`, {})).data,
  splitTicket: async (id: number, line_ids: number[]) => (await apiClient.post(`pos/tickets/${id}/split/`, { line_ids })).data,
  refundTicket: async (id: number, reason?: string) => (await apiClient.post(`pos/tickets/${id}/refund/`, { reason })).data,
  chargeToRoom: async (id: number, room: string) => (await apiClient.post(`pos/tickets/${id}/charge_to_room/`, { room })).data,
  redeemGift: async (id: number, code: string) => (await apiClient.post(`pos/tickets/${id}/redeem_gift/`, { code })).data,
  addCombo: async (id: number, combo: number) => (await apiClient.post(`pos/tickets/${id}/add_combo/`, { combo })).data,

  // Resumo operacional (dashboard POS + supervisão)
  getSummary: async (outlet?: number): Promise<PosSummary> =>
    (await apiClient.get('pos/tickets/summary/', { params: outlet ? { outlet } : {} })).data,
};

export interface PosSummary {
  date: string; sales_total: string; sales_count: number; avg_ticket: string;
  open_tickets: number; occupied_tables: number; cash_open: boolean; cash_expected: string;
  by_operator: { operator: string; sales: string; tickets: number; open: number }[];
  top_products: { name: string; qty: string; total: string }[];
  open_ticket_list: { ticket_number: string; operator: string; table: string | null; total: string; opened_at: string }[];
}

export interface PosReservation {
  id?: number; outlet: number; outlet_name?: string; table?: number | null; table_label?: string | null;
  guest_name: string; phone?: string; party_size?: number; reserved_for: string; status?: string; status_display?: string; note?: string;
}
export interface GiftCard { id?: number; code: string; initial_balance: string | number; balance?: string; is_active?: boolean; created_at?: string; }

export interface PrintJob {
  id: number; job_type: string; job_type_display: string; target?: string | null; title: string;
  content?: string | null; reference?: string | null; status: string; status_display: string;
  created_at: string; printed_at?: string | null;
}

export interface AuditLog {
  id: number; event_type: string; event_type_display: string; description: string;
  operator_name?: string | null; user?: string | null; outlet_name?: string | null;
  reference?: string | null; ip_address?: string | null; old_value?: string | null; new_value?: string | null;
  amount?: string | null; created_at: string;
}
export const AUDIT_EVENTS: { value: string; label: string }[] = [
  { value: '', label: 'Todos os eventos' },
  { value: 'TICKET_OPEN', label: 'Ticket aberto' }, { value: 'LINE_ADD', label: 'Linha adicionada' },
  { value: 'KITCHEN_FIRE', label: 'Enviado p/ cozinha' }, { value: 'PAYMENT', label: 'Pagamento' },
  { value: 'DOC_ISSUE', label: 'Documento emitido' }, { value: 'TICKET_VOID', label: 'Ticket anulado' },
  { value: 'CASH_OPEN', label: 'Abertura de caixa' }, { value: 'CASH_MOVE', label: 'Movimento de caixa' },
  { value: 'CASH_CLOSE', label: 'Fecho de caixa' },
];

export interface POSDocument {
  id: number; document_type: string; document_type_display?: string; full_number: string;
  ticket?: number; customer_name?: string | null; grand_total: string; status: string; status_display?: string; issued_at: string;
}

export interface KDSLine {
  id: number; ticket: number; ticket_number: string; table_label?: string | null; outlet_name: string;
  item_name: string; description: string; quantity: string; note?: string | null;
  kds_station: string; kds_status: string; kds_status_display: string; fired_at?: string | null;
}
export const KDS_STATIONS: { value: string; label: string }[] = [
  { value: 'KITCHEN', label: 'Cozinha' }, { value: 'BAR', label: 'Bar' }, { value: 'PASTRY', label: 'Pastelaria' },
];

export interface POSTableT { id?: number; outlet: number; outlet_name?: string; zone?: string | null; table_number: string; name?: string | null; seats?: number; status?: string; status_display?: string; pos_x?: number; pos_y?: number; shape?: string; }
export interface POSTicketLine { id?: number; ticket?: number; item: number; item_name?: string; item_code?: string; description?: string; quantity: string | number; unit_price?: string; tax_percentage?: string; line_total?: string; }
export interface POSTicketPayment { id?: number; payment_method: number; payment_method_name?: string; amount: string | number; change_due?: string; }
export interface POSTicket {
  id?: number; ticket_number?: string; outlet: number; outlet_name?: string; table?: number | null; table_label?: string | null;
  cash_session?: number | null; operator_name: string; guests?: number; status?: string; status_display?: string;
  subtotal?: string; tax_total?: string; discount_total?: string; grand_total?: string; paid_amount?: string; balance_due?: string;
  change_returned?: string; lines?: POSTicketLine[]; payments?: POSTicketPayment[];
}
