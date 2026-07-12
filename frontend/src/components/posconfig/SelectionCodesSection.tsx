import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import SimpleSection from './SimpleSection';

/**
 * CÓDIGOS DE SELEÇÃO — o que se marca na ficha do hóspede (Golfe, Spa, Negócios).
 *
 * É o que permite dizer "manda a newsletter do spa só a quem marcou Bem-estar"
 * em vez de a mandar a toda a gente — que é como se perde a lista de e-mails.
 *
 * Cada código pertence a um GRUPO (a gaveta: Interesses, Origem, Motivo da viagem).
 * O grupo escolhe-se de uma lista real, não se escreve à mão.
 */
export default function SelectionCodesSection() {
  const { data: grupos = [] } = useQuery({
    queryKey: ['posc', 'selgroups'],
    queryFn: async () => (await apiClient.get('pos/config/selection-groups/')).data,
  });

  return (
    <SimpleSection title="Código de Seleção" queryKey="selcodes" endpoint="pos/config/selection-codes/"
      columns={[
        { key: 'number', label: 'Nr', width: '8%' },
        { key: 'code', label: 'Código', width: '24%' },
        { key: 'name', label: 'Descrição', width: '38%' },
        { key: 'group_name', label: 'Grupo', width: '22%' },
        { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
      ]}
      fields={[
        { key: 'number', label: 'Nr:', type: 'number', width: 'w-[140px]' },
        { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
        { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
        { key: 'group', label: 'Grupo:', type: 'select', required: true, width: 'w-[290px]',
          options: (grupos as any[]).map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })),
          help: 'A gaveta a que este código pertence.' },
        { key: 'is_active', label: 'Ativo', type: 'checkbox' },
      ]} />
  );
}
