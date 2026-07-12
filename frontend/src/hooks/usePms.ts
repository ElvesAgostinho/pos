import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pmsApi } from '../api/pms';
import type { Guest, RoomType, Room, Reservation } from '../api/pms';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['pms'] });

export const useGuests = () => useQuery({ queryKey: ['pms', 'guests'], queryFn: pmsApi.getGuests });
export const useCreateGuest = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<Guest>) => pmsApi.createGuest(p), onSuccess: () => inval(qc) }); };
export const useDeleteGuest = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => pmsApi.deleteGuest(id), onSuccess: () => inval(qc) }); };

export const useRoomTypes = () => useQuery({ queryKey: ['pms', 'room-types'], queryFn: pmsApi.getRoomTypes });
export const useCreateRoomType = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<RoomType>) => pmsApi.createRoomType(p), onSuccess: () => inval(qc) }); };

export const useRooms = () => useQuery({ queryKey: ['pms', 'rooms'], queryFn: pmsApi.getRooms });
export const useCreateRoom = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<Room>) => pmsApi.createRoom(p), onSuccess: () => inval(qc) }); };
export const useSetRoomStatus = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => pmsApi.setRoomStatus(id, status), onSuccess: () => inval(qc) }); };

export const useReservations = (params?: any) => useQuery({ queryKey: ['pms', 'reservations', params], queryFn: () => pmsApi.getReservations(params) });
export const useCreateReservation = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<Reservation>) => pmsApi.createReservation(p), onSuccess: () => inval(qc) }); };
export const useCheckIn = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, room }: { id: number; room?: number }) => pmsApi.checkIn(id, room), onSuccess: () => inval(qc) }); };
export const useCheckOut = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => pmsApi.checkOut(id), onSuccess: () => inval(qc) }); };
export const useCancelReservation = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => pmsApi.cancelReservation(id), onSuccess: () => inval(qc) }); };

export const useFolios = () => useQuery({ queryKey: ['pms', 'folios'], queryFn: pmsApi.getFolios });
export const useSettleFolio = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, amount }: { id: number; amount?: string | number }) => pmsApi.settleFolio(id, amount), onSuccess: () => inval(qc) }); };
