import { apiClient } from './client';

export interface Guest { id?: number; hotel?: number; full_name: string; document_id?: string; tax_id?: string; email?: string; phone?: string; country?: string; vip?: boolean; }
export interface RoomType { id?: number; hotel?: number; code: string; name: string; capacity?: number; base_rate?: string | number; is_active?: boolean; }
export interface Room { id?: number; hotel?: number; room_type: number; room_type_name?: string; number: string; floor?: string; status?: string; status_display?: string; is_active?: boolean; }
export interface Reservation {
  id?: number; hotel?: number; confirmation?: string; guest: number; guest_name?: string;
  room_type: number; room_type_name?: string; room?: number | null; room_number?: string;
  check_in: string; check_out: string; adults?: number; children?: number; rate?: string | number;
  status?: string; status_display?: string; nights?: number; folio_id?: number; folio_balance?: string; notes?: string;
}
export interface FolioCharge { id?: number; folio?: number; charge_type: string; charge_type_display?: string; description: string; amount: string; source_reference?: string; created_at?: string; }
export interface Folio { id?: number; number?: string; status?: string; status_display?: string; charges_total?: string; payments_total?: string; balance?: string; guest_name?: string; room_number?: string; charges?: FolioCharge[]; }

export const ROOM_STATUS = [
  { value: 'VACANT_CLEAN', label: 'Livre / Limpo' }, { value: 'VACANT_DIRTY', label: 'Livre / Por limpar' },
  { value: 'OCCUPIED', label: 'Ocupado' }, { value: 'OOO', label: 'Fora de serviço' },
];

export const pmsApi = {
  getGuests: async (): Promise<Guest[]> => (await apiClient.get('pms/guests/')).data,
  createGuest: async (p: Partial<Guest>) => (await apiClient.post('pms/guests/', p)).data,
  deleteGuest: async (id: number) => { await apiClient.delete(`pms/guests/${id}/`); },

  getRoomTypes: async (): Promise<RoomType[]> => (await apiClient.get('pms/room-types/')).data,
  createRoomType: async (p: Partial<RoomType>) => (await apiClient.post('pms/room-types/', p)).data,

  getRooms: async (): Promise<Room[]> => (await apiClient.get('pms/rooms/')).data,
  createRoom: async (p: Partial<Room>) => (await apiClient.post('pms/rooms/', p)).data,
  setRoomStatus: async (id: number, status: string) => (await apiClient.post(`pms/rooms/${id}/set_status/`, { status })).data,

  getReservations: async (params?: any): Promise<Reservation[]> => (await apiClient.get('pms/reservations/', { params })).data,
  createReservation: async (p: Partial<Reservation>) => (await apiClient.post('pms/reservations/', p)).data,
  checkIn: async (id: number, room?: number) => (await apiClient.post(`pms/reservations/${id}/check_in/`, room ? { room } : {})).data,
  checkOut: async (id: number) => (await apiClient.post(`pms/reservations/${id}/check_out/`, {})).data,
  cancelReservation: async (id: number) => (await apiClient.post(`pms/reservations/${id}/cancel/`, {})).data,

  getFolios: async (): Promise<Folio[]> => (await apiClient.get('pms/folios/')).data,
  getFolio: async (id: number): Promise<Folio> => (await apiClient.get(`pms/folios/${id}/`)).data,
  postCharge: async (id: number, c: Partial<FolioCharge>) => (await apiClient.post(`pms/folios/${id}/post_charge/`, c)).data,
  settleFolio: async (id: number, amount?: string | number) => (await apiClient.post(`pms/folios/${id}/settle/`, amount != null ? { amount } : {})).data,
  generateInvoice: async (id: number) => (await apiClient.post(`pms/folios/${id}/generate_invoice/`, {})).data,
};
