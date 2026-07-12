import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { ScrollText, FileText, DollarSign } from 'lucide-react';
import { pmsApi } from '../../api/pms';

const money = (v: any) => Number(v || 0).toFixed(2);

export default function FoliosView() {
  const qc = useQueryClient();
  const { data: folios = [] } = useQuery({ queryKey: ['pms', 'folios'], queryFn: pmsApi.getFolios });
  const inval = () => qc.invalidateQueries({ queryKey: ['pms', 'folios'] });
  const invoice = useMutation({ mutationFn: (id: number) => pmsApi.generateInvoice(id), onSuccess: inval });
  const settle = useMutation({ mutationFn: (id: number) => pmsApi.settleFolio(id), onSuccess: inval });

  const doInvoice = (f: any) => invoice.mutate(f.id, {
    onSuccess: (r: any) => alert(`Fatura ${r.invoice_number} gerada · total ${money(r.total)} · cliente ${r.customer}`),
    onError: (e: any) => alert(e?.response?.data?.detail || 'Erro'),
  });

  return (
    <ClassicWindow title="Folios / Guest Ledger (PMS → Financeiro)" icon={<ScrollText size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">O folio acumula alojamento + F&B do POS · "Faturar" gera a fatura nas Contas a Receber do hóspede</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px]">
          <button onClick={() => window.open('/pos/login', '_blank')} className="px-3 py-1 border border-[#a0a0a0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] font-bold flex items-center gap-1.5">🛒 Abrir POS (Room Service)</button>
          <span className="text-gray-500">Os consumos do POS lançados na "Conta do Quarto" aparecem aqui e no check-out.</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={folios} columns={[
            { header: 'Folio', accessor: 'number', width: '12%' },
            { header: 'Hóspede', accessor: (r: any) => r.guest_name || '—', width: '20%' },
            { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '9%' },
            { header: 'Consumos', accessor: (r: any) => money(r.charges_total), width: '12%' },
            { header: 'Pago', accessor: (r: any) => money(r.payments_total), width: '10%' },
            { header: 'Saldo', accessor: (r: any) => <span className={Number(r.balance) > 0 ? 'text-red-600 font-bold' : 'text-green-700'}>{money(r.balance)}</span>, width: '11%' },
            { header: 'Estado', accessor: (r: any) => r.status_display, width: '9%' },
            { header: 'Fatura', accessor: (r: any) => r.invoice_number || '—', width: '10%' },
            { header: 'Ações', accessor: (r: any) => (
              <div className="flex gap-2">
                {Number(r.balance) > 0 && <button title="Liquidar" onClick={() => settle.mutate(r.id)} className="text-green-700 hover:text-green-900"><DollarSign size={13} /></button>}
                {!r.invoice_number && Number(r.charges_total) > 0 && <button title="Faturar folio" onClick={() => doInvoice(r)} className="text-[#1e3f66] hover:text-black"><FileText size={13} /></button>}
              </div>), width: '7%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
