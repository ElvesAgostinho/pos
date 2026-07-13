import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import SimpleSection from './SimpleSection';

/**
 * ARMAZÉM — onde a mercadoria está.
 *
 * O "Documento para movimentos de stock de venda" diz com que documento sai a
 * mercadoria quando o POS vende. Sem ele, a venda desconta o stock mas não deixa
 * documento — e no fim do mês ninguém consegue explicar a diferença entre o que
 * o sistema diz que há e o que está na prateleira.
 */
export default function WarehouseSection() {
  const { data: docs = [] } = useQuery({
    queryKey: ['posc', 'stockdocs'],
    queryFn: async () => (await apiClient.get('pos/config/stock-docs/')).data,
  });

  return (
    <SimpleSection title="Armazém" queryKey="warehouses" endpoint="pos/config/warehouses/" copyable
      columns={[
        { key: 'code', label: 'Código', width: '16%' },
        { key: 'name', label: 'Descrição', width: '30%' },
        { key: 'doc_name', label: 'Documento para movimentos de stock de venda', width: '38%',
          render: (r: any) => r.doc_name
            ? r.doc_name
            : <span className="text-[#c0392b]">sem documento</span> },
        { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
      ]}
      fields={[
        { key: 'code', label: 'Código:', width: 'w-[290px]' },
        { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
        { key: 'location_name', label: 'Nome da localização:', width: 'w-[620px]' },
        { key: 'address1', label: 'Morada 1:', width: 'w-[620px]' },
        { key: 'address2', label: 'Morada 2:', width: 'w-[620px]' },
        { key: 'postal_code', label: 'Cód. Postal:', width: 'w-[240px]' },
        { key: 'city', label: 'Cidade:', width: 'w-[360px]' },
        { key: 'email', label: 'E-mail:', width: 'w-[440px]' },
        { key: 'phone', label: 'Telefone:', width: 'w-[240px]' },
        { key: 'fax', label: 'Fax:', width: 'w-[240px]' },
        { key: 'sale_stock_doc', label: 'Documento de venda:', type: 'select', width: 'w-[360px]',
          options: (docs as any[]).map((x) => ({ value: x.id, label: `${x.code} (${x.name})` })),
          help: 'Com que documento sai a mercadoria quando o POS vende.' },
        { key: 'accounting_account', label: 'Conta de Contabilidade:', width: 'w-[290px]' },
        { key: 'is_active', label: 'Ativo', type: 'checkbox' },
      ]} />
  );
}
