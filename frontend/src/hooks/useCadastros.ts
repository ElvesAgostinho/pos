import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cadastrosApi } from '../api/cadastros';
import type { CadEnt } from '../api/cadastros';

const inval = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['cadastros'] });

export const useCadList = (ent: CadEnt) =>
  useQuery({ queryKey: ['cadastros', ent], queryFn: () => cadastrosApi[ent].list() });
export const useCadCreate = (ent: CadEnt) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (p: any) => cadastrosApi[ent].create(p), onSuccess: () => inval(qc) });
};
export const useCadDelete = (ent: CadEnt) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => cadastrosApi[ent].remove(id), onSuccess: () => inval(qc) });
};
