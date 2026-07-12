import { apiClient } from './client';

const crud = (base: string) => ({
  list: async (params?: Record<string, any>): Promise<any[]> => (await apiClient.get(base, { params })).data,
  create: async (p: any) => (await apiClient.post(base, p)).data,
  update: async (id: number, p: any) => (await apiClient.patch(`${base}${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`${base}${id}/`); },
});

export const finalApi = {
  // Workflow (19)
  flows: crud('platform/workflow-flows/'),
  wfTasks: crud('platform/workflow-tasks/'),
  wfDashboard: async () => (await apiClient.get('platform/workflow/dashboard/')).data,
  // Compras (08)
  returns: crud('procurement/returns/'),
  confirmReturn: async (id: number) => (await apiClient.post(`procurement/returns/${id}/confirm/`)).data,
  procDashboard: async () => (await apiClient.get('procurement/dashboard/')).data,
  procPlanning: async () => (await apiClient.get('procurement/planning/')).data,
  // Comercial (06)
  loyaltyPrograms: crud('commercial/loyalty-programs/'),
  loyaltyTiers: crud('commercial/loyalty-tiers/'),
  comDashboard: async () => (await apiClient.get('commercial/dashboard/')).data,
  // Finanças (14)
  reconciliations: crud('finance/reconciliations/'),
  accountBalances: async () => (await apiClient.get('finance/account-balances/')).data,
  // Admin (01)
  groups: crud('org/groups/'),
  modules: async () => (await apiClient.get('licensing/active-modules/')).data,
  features: async () => (await apiClient.get('licensing/features/')).data,
  systemInfo: async () => (await apiClient.get('platform/system/')).data,
  // Segurança (03)
  securityPolicy: async () => (await apiClient.get('platform/security-policy/')).data,
  saveSecurityPolicy: async (p: any) => (await apiClient.post('platform/security-policy/', p)).data,
  securityDashboard: async () => (await apiClient.get('platform/security/dashboard/')).data,
  // lookups
  suppliers: async () => (await apiClient.get('esm/suppliers/')).data,
  warehouses: async () => (await apiClient.get('inventory/warehouses/')).data,
  items: async (search?: string) => (await apiClient.get('inventory/items/', { params: search ? { search } : {} })).data,
};
