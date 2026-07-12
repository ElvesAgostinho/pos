import { apiClient } from './client';

export interface SecUser {
  id?: number; username: string; email?: string; first_name?: string; last_name?: string;
  is_active?: boolean; is_staff?: boolean; is_superuser?: boolean; last_login?: string | null;
  password?: string; profile_ids?: number[]; profiles?: { id: number; code: string; name: string }[];
  // Propriedades a que o utilizador tem acesso (vazio = sem restrição / hotel único).
  hotel_ids?: number[]; hotels?: { id: number; name: string }[];
}
export interface Profile { id: number; code: string; name: string; category?: string; }
export interface Session { id: number; user_name?: string | null; operator_name?: string | null; status: string; login_time: string; last_activity: string; logout_time?: string | null; }
export interface AuthEvent { id: number; event_type: string; identity_attempt?: string | null; ip_address?: string | null; timestamp: string; details?: string | null; }

export const securityApi = {
  getUsers: async (): Promise<SecUser[]> => (await apiClient.get('auth/users/')).data,
  createUser: async (p: Partial<SecUser>) => (await apiClient.post('auth/users/', p)).data,
  updateUser: async (id: number, p: Partial<SecUser>) => (await apiClient.patch(`auth/users/${id}/`, p)).data,
  deleteUser: async (id: number) => { await apiClient.delete(`auth/users/${id}/`); },
  setPassword: async (id: number, password: string) => (await apiClient.post(`auth/users/${id}/set_password/`, { password })).data,
  toggleActive: async (id: number) => (await apiClient.post(`auth/users/${id}/toggle_active/`, {})).data,

  getProfiles: async (): Promise<Profile[]> => (await apiClient.get('eae/profiles/')).data,

  getSessions: async (status?: string): Promise<Session[]> => (await apiClient.get('auth/sessions/', { params: status ? { status } : {} })).data,
  revokeSession: async (id: number) => (await apiClient.post(`auth/sessions/${id}/revoke/`, {})).data,

  getEvents: async (event_type?: string): Promise<AuthEvent[]> => (await apiClient.get('auth/events/', { params: event_type ? { event_type } : {} })).data,
};
