import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgApi } from '../api/org';

type Ent = 'companies' | 'hotels' | 'departments' | 'areas';
const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['org'] });

export const useOrgList = (ent: Ent, params?: any) =>
  useQuery({ queryKey: ['org', ent, params], queryFn: () => orgApi[ent].list(params) });
export const useOrgCreate = (ent: Ent) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => orgApi[ent].create(p), onSuccess: () => inval(qc) });
};
export const useOrgUpdate = (ent: Ent) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: number; data: any }) => orgApi[ent].update(id, data), onSuccess: () => inval(qc) });
};
export const useOrgDelete = (ent: Ent) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => orgApi[ent].remove(id), onSuccess: () => inval(qc) });
};
