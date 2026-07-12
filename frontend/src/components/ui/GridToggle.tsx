import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

/**
 * CAIXA DE GRELHA (transversal ao sistema).
 *
 * Regra da casa: onde há um visto, há uma CAIXA — e a caixa grava. Clicar faz
 * logo o PATCH no servidor e refresca a lista; não há vistos decorativos.
 *
 * Sem `endpoint`, a caixa fica desativada (verde apagada): o valor é verdadeiro
 * mas não é aqui que se decide (vem da licença, da lei fiscal ou do histórico).
 */
export default function GridToggle({ endpoint, id, field, value, title, invalidate }: {
  endpoint?: string;          // ex.: 'mdm/payment-methods'
  id?: number;
  field?: string;             // ex.: 'is_active'
  value: boolean;
  title?: string;
  invalidate?: string;        // chave de query a refrescar
}) {
  const qc = useQueryClient();
  const live = !!(endpoint && id && field);

  const save = useMutation({
    mutationFn: (v: boolean) => apiClient.patch(`${endpoint}/${id}/`, { [field!]: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidate ? [invalidate] : undefined }),
    onError: notifyError,
  });

  return (
    <input type="checkbox" checked={!!value} disabled={!live}
      title={title || (live ? 'Ligar/desligar' : 'Só de leitura')}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => live && save.mutate(e.target.checked)}
      className="w-4 h-4 align-middle" />
  );
}
