import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import SimpleSection from './SimpleSection';

/**
 * SUB-SEGMENTO — o setor de atividade do cliente (Petrolífera, Banca, Saúde…).
 *
 * Pendura-se num SEGMENTO (Corporate, MICE). É o que permite responder à pergunta
 * que o dono faz todos os meses: "de onde vem o dinheiro?" — e a resposta útil não
 * é "empresas", é "petrolíferas".
 */
export default function SubSegmentSection() {
  const { data: segmentos = [] } = useQuery({
    queryKey: ['posc', 'segments'],
    queryFn: async () => (await apiClient.get('pos/config/segments/')).data,
  });

  return (
    <SimpleSection title="Sub-Segmento" queryKey="subsegments" endpoint="pos/config/subsegments/"
      columns={[
        { key: 'code', label: 'Código', width: '18%' },
        { key: 'name', label: 'Descrição', width: '42%' },
        { key: 'segment_name', label: 'Segmento', width: '26%',
          render: (r: any) => r.segment_name || <span className="text-[#999]">—</span> },
        { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
      ]}
      fields={[
        { key: 'number', label: 'Nr:', type: 'number', width: 'w-[140px]' },
        { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
        { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
        { key: 'segment', label: 'Segmento:', type: 'select', width: 'w-[290px]',
          options: (segmentos as any[]).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` })) },
        { key: 'for_pms', label: 'PMS', type: 'checkbox' },
        { key: 'for_ems', label: 'Eventos', type: 'checkbox' },
        { key: 'for_pos', label: 'POS', type: 'checkbox' },
        { key: 'is_active', label: 'Ativo', type: 'checkbox' },
      ]} />
  );
}
