import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { HandCoins, DollarSign, Users } from 'lucide-react';
import { receivablesApi } from '../../api/receivables';
import { useAccounts } from '../../hooks/useFinance';

const money = (v: any) => Number(v || 0).toFixed(2);
const ST: Record<string, string> = { ISSUED: 'text-red-600 font-bold', PARTIAL: 'text-[#b06a00] font-bold', PAID: 'text-green-700 font-bold', DRAFT: 'text-gray-500', CANCELLED: 'text-gray-400' };

export default function AccountsReceivableView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'invoices' | 'customers'>('invoices');
  const { data: invoices = [] } = useQuery({ queryKey: ['receivables', 'inv'], queryFn: receivablesApi.invoices });
  const { data: customers = [] } = useQuery({ queryKey: ['receivables', 'cust'], queryFn: receivablesApi.customers });
  const { data: accounts = [] } = useAccounts();
  const receive = useMutation({
    mutationFn: ({ id, account, amount }: any) => receivablesApi.receive(id, account, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receivables'] }),
  });

  const openInv = invoices.filter((i: any) => !['DRAFT', 'CANCELLED', 'PAID'].includes(i.status));
  const doReceive = (inv: any) => {
    if (!accounts.length) { alert('Crie primeiro uma conta de tesouraria.'); return; }
    const acc = accounts[0];
    const amount = window.prompt(`Receber da fatura ${inv.number} (saldo ${money(inv.balance)}) para a conta "${acc.name}". Valor:`, money(inv.balance));
    if (amount === null) return;
    receive.mutate({ id: inv.id, account: acc.id, amount }, { onError: (e: any) => alert(e?.response?.data?.detail || 'Erro') });
  };
  const totalDue = openInv.reduce((s: number, i: any) => s + Number(i.balance), 0);

  return (
    <ClassicWindow title="Contas a Receber — Clientes (conta corrente)" icon={<HandCoins size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Faturas em dívida: <b>{money(totalDue)}</b> · liquidadas por recebimentos que entram na tesouraria</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-1 bg-[#f0f0f0] border-b border-[#a0a0a0] px-2 pt-1 text-[11px]">
          <button onClick={() => setTab('invoices')} className={`px-3 py-1.5 border border-b-0 font-bold ${tab === 'invoices' ? 'bg-white text-[#1e3f66]' : 'bg-[#e0e0e0] text-gray-600'}`}>Faturas a receber</button>
          <button onClick={() => setTab('customers')} className={`px-3 py-1.5 border border-b-0 font-bold flex items-center gap-1 ${tab === 'customers' ? 'bg-white text-[#1e3f66]' : 'bg-[#e0e0e0] text-gray-600'}`}><Users size={12} />Conta corrente</button>
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === 'invoices' ? (
            <ClassicGrid rowKey="id" data={invoices} columns={[
              { header: 'Nº', accessor: 'number', width: '12%' },
              { header: 'Cliente', accessor: 'customer_name', width: '26%' },
              { header: 'Data', accessor: 'date', width: '12%' },
              { header: 'Total', accessor: (r: any) => money(r.total), width: '12%' },
              { header: 'Recebido', accessor: (r: any) => money(r.paid_amount), width: '12%' },
              { header: 'Saldo', accessor: (r: any) => <span className={Number(r.balance) > 0 ? 'text-red-600 font-bold' : 'text-green-700'}>{money(r.balance)}</span>, width: '12%' },
              { header: 'Estado', accessor: (r: any) => <span className={ST[r.status] || ''}>{r.status_display}</span>, width: '10%' },
              { header: '', accessor: (r: any) => !['DRAFT', 'CANCELLED', 'PAID'].includes(r.status) ? <button title="Receber" onClick={() => doReceive(r)} className="text-green-700 hover:text-green-900"><DollarSign size={14} /></button> : null, width: '8%' },
            ]} />
          ) : (
            <ClassicGrid rowKey="customer" data={customers} columns={[
              { header: 'Cliente', accessor: 'customer', width: '44%' },
              { header: 'Faturado', accessor: (r: any) => money(r.invoiced), width: '18%' },
              { header: 'Recebido', accessor: (r: any) => money(r.received), width: '18%' },
              { header: 'Saldo em dívida', accessor: (r: any) => <span className={Number(r.balance) > 0 ? 'text-red-600 font-bold' : 'text-green-700'}>{money(r.balance)}</span>, width: '20%' },
            ]} />
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
