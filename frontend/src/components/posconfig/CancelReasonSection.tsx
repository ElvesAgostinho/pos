import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import SimpleSection from './SimpleSection';

/**
 * MOTIVO DE CANCELAMENTO — porque é que o evento caiu.
 *
 * "Cancelamento pela Meteorologia" não é o mesmo que "Cancelamento Cliente": um é
 * azar, o outro é comercial. Sem motivos, o relatório de cancelamentos é uma coluna
 * de números — e o hotel nunca sabe se está a perder eventos por preço, por serviço
 * ou por chuva.
 *
 * O ENCARGO é o artigo que se cobra ao cancelar (a taxa de cancelamento). Sem ele,
 * o hotel perde o salão E não cobra nada.
 */
export default function CancelReasonSection() {
  const { data: artigos = [] } = useQuery({
    queryKey: ['posc', 'articles-all'],
    queryFn: async () => {
      const r = await apiClient.get('inventory/pos/articles/');
      return r.data?.results || r.data || [];
    },
  });

  return (
    <SimpleSection title="Motivo de Cancelamento" queryKey="cancelreasons" endpoint="pos/config/cancel-reasons/"
      columns={[
        { key: 'code', label: 'Código', width: '16%' },
        { key: 'name', label: 'Descrição', width: '26%' },
        { key: 'charge_name', label: 'Encargo', width: '18%',
          render: (r: any) => r.charge_name || <span className="text-[#999]">(nenhum)</span> },
        { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
        { key: 'default_auto_cancel', label: 'Por omissão p/ cancelamentos autom.', width: '18%', toggle: true },
        { key: 'default_abandon', label: 'Por omissão p/ abandonos', width: '12%', toggle: true },
      ]}
      fields={[
        { key: 'number', label: 'Nr:', type: 'number', width: 'w-[140px]' },
        { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
        { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
        { key: 'charge_item', label: 'Encargo:', type: 'select', width: 'w-[360px]',
          options: (artigos as any[]).map((a) => ({ value: a.id, label: a.name })),
          help: 'O artigo que se cobra ao cancelar (taxa de cancelamento).' },
        { key: 'for_pms', label: 'PMS', type: 'checkbox' },
        { key: 'for_ems', label: 'Eventos', type: 'checkbox' },
        { key: 'default_auto_cancel', label: 'Por omissão para cancelamentos automáticos', type: 'checkbox',
          help: 'Só um motivo o pode ser.' },
        { key: 'default_abandon', label: 'Por omissão para abandonos', type: 'checkbox' },
        { key: 'is_active', label: 'Ativo', type: 'checkbox' },
      ]} />
  );
}
