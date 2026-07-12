// Motor 9 — store-and-forward: fila local (outbox) de vendas feitas offline.
const KEY = 'pos_offline_outbox';

export interface OfflineTicket {
  client_uuid: string;
  outlet: number;
  operator_name: string;
  lines: { item: number; quantity: number; unit_price: number; label?: string }[];
  payments: { payment_method: number; amount: number }[];
  created_at: string;
}

export const outbox = {
  list: (): OfflineTicket[] => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  },
  add: (t: OfflineTicket) => {
    const l = outbox.list();
    l.push(t);
    localStorage.setItem(KEY, JSON.stringify(l));
  },
  removeSynced: (uuids: string[]) => {
    const l = outbox.list().filter((t) => !uuids.includes(t.client_uuid));
    localStorage.setItem(KEY, JSON.stringify(l));
  },
};
