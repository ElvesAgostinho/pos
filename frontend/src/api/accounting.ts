import { apiClient } from './client';

export interface AccEntryLine { id?: number; account: number; account_code?: string; account_name?: string; description?: string; debit: number | string; credit: number | string; cost_center?: string | null; }
export interface AccEntry {
  id?: number; number?: string; journal: number; journal_name?: string; period?: number | null;
  entry_date: string; description: string; reference?: string | null; source?: string;
  status?: string; status_display?: string; lines?: AccEntryLine[];
  total_debit?: string; total_credit?: string; is_balanced?: boolean;
}

const crud = (base: string) => ({
  list: async (params?: Record<string, any>): Promise<any[]> => (await apiClient.get(base, { params })).data,
  create: async (p: any) => (await apiClient.post(base, p)).data,
  update: async (id: number, p: any) => (await apiClient.patch(`${base}${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`${base}${id}/`); },
});

export const accApi = {
  accounts: crud('accounting/accounts/'),
  journals: crud('accounting/journals/'),
  periods: crud('accounting/periods/'),
  entries: crud('accounting/entries/'),
  postEntry: async (id: number) => (await apiClient.post(`accounting/entries/${id}/post_entry/`)).data,
  reverseEntry: async (id: number) => (await apiClient.post(`accounting/entries/${id}/reverse_entry/`)).data,
  toggleClosePeriod: async (id: number) => (await apiClient.post(`accounting/periods/${id}/toggle_close/`)).data,
  dashboard: async () => (await apiClient.get('accounting/dashboard/')).data,
  trialBalance: async (params?: any) => (await apiClient.get('accounting/trial-balance/', { params })).data,
  ledger: async (account: string) => (await apiClient.get('accounting/ledger/', { params: { account } })).data,
  incomeStatement: async (params?: any) => (await apiClient.get('accounting/income-statement/', { params })).data,
  balanceSheet: async (params?: any) => (await apiClient.get('accounting/balance-sheet/', { params })).data,
  autoPostPending: async () => (await apiClient.get('accounting/auto-post/')).data,
  runAutoPost: async (sources: string[], post = true) => (await apiClient.post('accounting/auto-post/', { sources, post })).data,
  mapping: async () => (await apiClient.get('accounting/mapping/')).data,
  closeResultsPreview: async () => (await apiClient.get('accounting/close-results/')).data,
  closeResults: async () => (await apiClient.post('accounting/close-results/', {})).data,
};
