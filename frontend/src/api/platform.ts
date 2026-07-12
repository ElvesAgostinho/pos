import { apiClient } from './client';

const crud = (base: string) => ({
  list: async (params?: Record<string, any>): Promise<any[]> => (await apiClient.get(base, { params })).data,
  create: async (p: any) => (await apiClient.post(base, p)).data,
  update: async (id: number, p: any) => (await apiClient.patch(`${base}${id}/`, p)).data,
  remove: async (id: number) => { await apiClient.delete(`${base}${id}/`); },
});

export const platformApi = {
  connectors: crud('platform/connectors/'),
  channels: crud('platform/notification-channels/'),
  rules: crud('platform/notification-rules/'),
  templates: crud('platform/document-templates/'),
  tasks: crud('platform/scheduled-tasks/'),
  systemInfo: async (): Promise<any> => (await apiClient.get('platform/system/')).data,
  clearCache: async (): Promise<any> => (await apiClient.post('platform/system/', { action: 'clear_cache' })).data,
  logs: async (): Promise<any> => (await apiClient.get('platform/logs/')).data,
  backupUrl: 'support/backup/',
};
