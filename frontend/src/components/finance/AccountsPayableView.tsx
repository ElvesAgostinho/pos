import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { Receipt, DollarSign } from 'lucide-react';
import { payablesApi } from '../../api/payables';
import { useAccounts } from '../../hooks/useFinance';
import { aviso, pedir } from '../../ui/dialogo';

const money = (v: any) => Number(v || 0).toFixed(2);
const ST: Record<string, string> = { OPEN: 'text-[#8C2B1F] font-bold', PARTIAL: 'text-[#062A31] font-bold', PAID: 'text-[#062A31] font-bold', CANCELLED: 'text-gray-400' };

export default function AccountsPayableView() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const { data: invoices = [] } = useQuery({ queryKey: ['payables', status], queryFn: () => payablesApi.list(status ? { status } : undefined) });
  const { data: accounts = [] } = useAccounts();
  const pay = useMutation({
    mutationFn: ({ id, account, amount }: any) => payablesApi.pay(id, account, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payables'] }),
  });

  const doPay = async (inv: any) => {
    if (!accounts.length) { aviso('Crie primeiro uma conta de tesouraria (Financeiro → Tesouraria).'); return; }
    const acc = accounts[0];
    const amount = await pedir(`Pagar fatura ${inv.number} (saldo ${money(inv.balance)}) da conta "${acc.name}". Valor a pagar:`, money(inv.balance));
    if (amount === null) return;
    pay.mutate({ id: inv.id, account: acc.id, amount }, { onError: (e: any) => aviso(e?.response?.data?.detail || 'Erro no pagamento') });
  };

  const totalOpen = invoices.reduce((s: number, i: any) => s + Number(i.balance), 0);

  return (
    <ClassicWindow title="Contas a Pagar — Fornecedores (conta corrente)" icon={<Receipt size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{invoices.length} fatura(s) · em dívida: <b>{money(totalOpen)}</b> · nascem automaticamente da receção de mercadorias (GRN)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 bg-[#F7FAFA] border-b border-[#7FA9B1] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Estado:</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-[#7FA9B1] p-1 bg-white">
            <option value="">Todas</option><option value="OPEN">Em aberto</option><option value="PARTIAL">Parcial</option><option value="PAID">Pagas</option>
          </select>
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={invoices} columns={[
            { header: 'Nº', accessor: 'number', width: '12%' },
            { header: 'Fornecedor', accessor: 'supplier_name', width: '22%' },
            { header: 'Receção', accessor: (r: any) => r.grn_ref || '—', width: '13%' },
            { header: 'Data', accessor: 'date', width: '11%' },
            { header: 'Valor', accessor: (r: any) => money(r.amount), width: '11%' },
            { header: 'Pago', accessor: (r: any) => money(r.paid_amount), width: '10%' },
            { header: 'Saldo', accessor: (r: any) => <span className={Number(r.balance) > 0 ? 'text-[#8C2B1F] font-bold' : 'text-[#062A31]'}>{money(r.balance)}</span>, width: '11%' },
            { header: 'Estado', accessor: (r: any) => <span className={ST[r.status] || ''}>{r.status_display}</span>, width: '10%' },
            { header: '', accessor: (r: any) => r.status !== 'PAID' && r.status !== 'CANCELLED' ? <button title="Pagar" onClick={() => doPay(r)} className="text-[#062A31] hover:text-[#062A31]"><DollarSign size={14} /></button> : null, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
