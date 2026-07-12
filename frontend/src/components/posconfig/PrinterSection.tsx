import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import SimpleSection from './SimpleSection';

/**
 * IMPRESSORAS — o posto de impressão (Cozinha, Bar, Restaurante) e o APARELHO
 * a que está ligado.
 *
 * Sem aparelho, a comanda fica em fila e ninguém a vai buscar: o pedido nunca
 * chega à cozinha e o cliente fica à espera de um prato que não está a ser feito.
 * É por isso que existe o "Emitir Aviso" — para o empregado saber logo, e não
 * vinte minutos depois.
 *
 * Os aparelhos vêm do catálogo de Hardware (a porta série é lá).
 */
export default function PrinterSection() {
  const { data: devices = [] } = useQuery({
    queryKey: ['posc', 'hardware-printers'],
    queryFn: async () => (await apiClient.get('pos/config/hardware/', { params: { hw_type: 'PRINTER' } })).data,
  });
  const { data: outlets = [] } = useQuery({
    queryKey: ['posc', 'outlets'],
    queryFn: async () => { const r = await apiClient.get('pos/outlets/'); return r.data?.results || r.data || []; },
  });

  return (
    <SimpleSection title="Impressora" queryKey="printers" endpoint="inventory/pos/printers/"
      columns={[
        { key: 'code', label: 'Código', width: '20%' },
        { key: 'name', label: 'Nome', width: '26%' },
        { key: 'station_display', label: 'Área de produção', width: '16%' },
        { key: 'device_name', label: 'Impressora', width: '20%',
          render: (r: any) => r.device_name
            ? r.device_name
            : <span className="text-[#c0392b]">sem aparelho</span> },
        { key: 'warn_on_failure', label: 'Emitir Aviso', width: '10%', toggle: true },
        { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
      ]}
      fields={[
        { key: 'code', label: 'Código:', required: true, width: 'w-[300px]' },
        { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
        { key: 'station', label: 'Área de produção:', type: 'select', required: true, width: 'w-[300px]',
          options: [
            { value: 'KITCHEN', label: 'Cozinha' }, { value: 'BAR', label: 'Bar' },
            { value: 'PASTRY', label: 'Pastelaria' }, { value: 'CASHIER', label: 'Caixa' },
          ],
          help: 'Para onde vai a comanda impressa nesta impressora.' },
        { key: 'outlet', label: 'Ponto de venda:', type: 'select', width: 'w-[300px]',
          options: (outlets as any[]).map((o) => ({ value: o.id, label: o.name })),
          help: 'Vazio = serve todos.' },
        { key: 'device', label: 'Impressora:', type: 'select', width: 'w-[300px]',
          options: (devices as any[]).map((d) => ({ value: d.id, label: `${d.name} (${d.port || 'sem porta'})` })),
          help: 'O aparelho físico. Vem do catálogo de Hardware — sem ele, a comanda não sai.' },
        { key: 'warn_on_failure', label: 'Emitir Aviso', type: 'checkbox',
          help: 'Avisa o empregado se a comanda não for impressa.' },
        { key: 'is_active', label: 'Ativo', type: 'checkbox' },
      ]} />
  );
}
