import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { ArrowUpCircle, Plus, Check } from 'lucide-react';
import { usePayments, useCreatePayment, useConfirmPayment, useAccounts } from '../../hooks/useFinance';

const ST: Record<string, string> = { DRAFT: 'text-gray-500', CONFIRMED: 'text-green-700 font-bold', CANCELLED: 'text-red-600' };
const today = () => new Date().toISOString().slice(0, 10);

export default function PaymentsView() {
  const { data: payments = [] } = usePayments();
  const { data: accounts = [] } = useAccounts();
  const create = useCreatePayment();
  const confirm = useConfirmPayment();
  const empty = { account: '', party_name: '', amount: '', method: 'CASH', date: today() };
  const [draft, setDraft] = useState<any>(empty);

  const add = () => {
    if (!draft.account || !draft.party_name || !draft.amount) { alert('Preencha conta, beneficiário e valor.'); return; }
    create.mutate({ ...draft, account: Number(draft.account) }, { onSuccess: () => setDraft({ ...empty, account: draft.account }) });
  };
  const doConfirm = (id: number) => confirm.mutate(id, { onError: (e: any) => alert(e?.response?.data?.detail || 'Erro') });

  return (
    <ClassicWindow title="Pagamentos (Financeiro)" icon={<ArrowUpCircle size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{payments.length} pagamento(s) · confirmar debita a conta (valida saldo)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <select value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— conta —</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="Beneficiário" value={draft.party_name} onChange={(e) => setDraft({ ...draft, party_name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Valor" type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Registar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={payments}
            columns={[
              { header: 'Nº', accessor: 'number', width: '14%' },
              { header: 'Conta', accessor: 'account_name', width: '20%' },
              { header: 'Beneficiário', accessor: 'party_name', width: '22%' },
              { header: 'Valor', accessor: (r: any) => Number(r.amount).toFixed(2), width: '14%' },
              { header: 'Data', accessor: 'date', width: '12%' },
              { header: 'Estado', accessor: (r: any) => <span className={ST[r.status] || ''}>{r.status_display}</span>, width: '10%' },
              { header: '', accessor: (r: any) => r.status === 'DRAFT' ? <button title="Confirmar" onClick={() => doConfirm(r.id)} className="text-green-700 hover:text-green-900"><Check size={13} /></button> : null, width: '8%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
