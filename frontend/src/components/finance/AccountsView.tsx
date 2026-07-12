import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Landmark, Plus } from 'lucide-react';
import { useAccounts, useCreateAccount } from '../../hooks/useFinance';

export default function AccountsView() {
  const { data: accounts = [] } = useAccounts();
  const create = useCreateAccount();
  const empty = { code: '', name: '', account_type: 'CASH', currency: 'AOA', opening_balance: '0' };
  const [draft, setDraft] = useState<any>(empty);

  const add = () => {
    if (!draft.code || !draft.name) { alert('Preencha código e nome.'); return; }
    create.mutate({ ...draft, opening_balance: draft.opening_balance || 0 }, { onSuccess: () => setDraft(empty) });
  };

  return (
    <ClassicWindow title="Tesouraria — Contas (Financeiro)" icon={<Landmark size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{accounts.length} conta(s) · saldo = abertura + recebimentos confirmados − pagamentos confirmados</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Código" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-24" />
          <input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={draft.account_type} onChange={(e) => setDraft({ ...draft, account_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="CASH">Caixa</option><option value="BANK">Banco</option>
          </select>
          <input placeholder="Moeda" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-20" />
          <input placeholder="Saldo inicial" type="number" value={draft.opening_balance} onChange={(e) => setDraft({ ...draft, opening_balance: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <ClassicButton icon={Plus} label="Nova Conta" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={accounts}
            columns={[
              { header: 'Código', accessor: 'code', width: '14%' },
              { header: 'Nome', accessor: 'name', width: '32%' },
              { header: 'Tipo', accessor: 'account_type_display', width: '14%' },
              { header: 'Moeda', accessor: 'currency', width: '12%' },
              { header: 'Saldo', accessor: (r: any) => <span className={Number(r.balance) < 0 ? 'text-red-600 font-bold' : 'text-green-700 font-bold'}>{Number(r.balance).toFixed(2)}</span>, width: '28%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
