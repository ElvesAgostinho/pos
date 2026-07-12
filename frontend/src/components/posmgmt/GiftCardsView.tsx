import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Gift, Plus } from 'lucide-react';
import { useGiftCards, useCreateGiftCard } from '../../hooks/usePosMgmt';

const rndCode = () => 'GC-' + Math.random().toString(36).slice(2, 8).toUpperCase();

export default function GiftCardsView() {
  const { data: cards = [] } = useGiftCards();
  const create = useCreateGiftCard();
  const [draft, setDraft] = useState<any>({ code: rndCode(), initial_balance: '' });

  const add = () => {
    if (!draft.code || !draft.initial_balance) { alert('Preencha código e valor.'); return; }
    create.mutate({ code: draft.code, initial_balance: draft.initial_balance },
      { onSuccess: () => setDraft({ code: rndCode(), initial_balance: '' }), onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data)) });
  };

  return (
    <ClassicWindow title="Gift Cards / Vouchers (POS · Motor 6)" icon={<Gift size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{cards.length} cartão(ões) · o saldo é debitado no pagamento (redeem) do ticket</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Código" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-40" />
          <input placeholder="Saldo inicial" type="number" value={draft.initial_balance} onChange={(e) => setDraft({ ...draft, initial_balance: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <ClassicButton icon={Plus} label="Emitir Gift Card" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={cards}
            columns={[
              { header: 'Código', accessor: 'code', width: '26%' },
              { header: 'Valor inicial', accessor: (r: any) => Number(r.initial_balance).toFixed(2), width: '20%' },
              { header: 'Saldo atual', accessor: (r: any) => <span className={Number(r.balance) > 0 ? 'text-green-700 font-bold' : 'text-gray-400'}>{Number(r.balance).toFixed(2)}</span>, width: '20%' },
              { header: 'Ativo', accessor: (r: any) => r.is_active ? 'Sim' : 'Não', width: '14%' },
              { header: 'Emitido', accessor: (r: any) => r.created_at ? new Date(r.created_at).toLocaleDateString('pt-PT') : '—', width: '20%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
