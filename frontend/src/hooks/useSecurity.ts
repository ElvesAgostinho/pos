import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { securityApi } from '../api/security';
import type { SecUser } from '../api/security';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['security'] });

export const useUsers = () => useQuery({ queryKey: ['security', 'users'], queryFn: securityApi.getUsers });
export const useProfiles = () => useQuery({ queryKey: ['security', 'profiles'], queryFn: securityApi.getProfiles });
export const useCreateUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (p: Partial<SecUser>) => securityApi.createUser(p), onSuccess: () => inval(qc) }); };
export const useUpdateUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<SecUser> }) => securityApi.updateUser(id, data), onSuccess: () => inval(qc) }); };
export const useDeleteUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => securityApi.deleteUser(id), onSuccess: () => inval(qc) }); };
export const useSetPassword = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, password }: { id: number; password: string }) => securityApi.setPassword(id, password), onSuccess: () => inval(qc) }); };
export const useToggleActive = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => securityApi.toggleActive(id), onSuccess: () => inval(qc) }); };

export const useSessions = (status?: string) => useQuery({ queryKey: ['security', 'sessions', status], queryFn: () => securityApi.getSessions(status), refetchInterval: 15000 });
export const useRevokeSession = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => securityApi.revokeSession(id), onSuccess: () => inval(qc) }); };
export const useAuthEvents = (t?: string) => useQuery({ queryKey: ['security', 'events', t], queryFn: () => securityApi.getEvents(t) });
