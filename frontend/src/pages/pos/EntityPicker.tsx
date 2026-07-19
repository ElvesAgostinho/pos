import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import TouchKeyboard from './TouchKeyboard';

/**
 * ENTIDADE — a quem se passa a conta.
 *
 * "Venda Direta" é o consumidor final. Quando o cliente pede fatura com contribuinte, ou
 * é uma empresa com conta corrente, ou o sócio com cartão de membro, é aqui que se
 * escolhe QUEM. Sem isto a fatura sai a "Consumidor Final", a empresa não a pode deduzir,
 * e o cliente volta furioso no dia seguinte — e a fatura já não se muda.
 */
export default function EntityPicker({ onPick, onCancel }: {
  onPick: (e: any) => void;
  onCancel: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');

  const { data: linhas = [], isFetching } = useQuery({
    queryKey: ['pos-entities', busca],
    queryFn: async () => {
      const r = await apiClient.get('pos/marketing/entities/', { params: { q: busca || undefined } });
      return ((r.data?.results || r.data || []) as any[]).slice(0, 60);
    },
  });

  return (
    <Window title="Entidade" width={980} onClose={onCancel}>
      <div className="flex flex-col" style={{ height: '58vh' }}>
        <div className="grid grid-cols-[90px_130px_1fr_130px] bg-[#3a3a3a] text-white
          text-[13px] font-bold px-3 py-2 flex-shrink-0">
          <span>Nº</span><span>Nr. contrib.</span><span>Nome</span><span>Contacto</span>
        </div>

        <div className="flex-1 overflow-auto pos-arrasta bg-[#1f1f1f] min-h-0">
          {linhas.map((e: any) => (
            <button key={e.id} onClick={() => onPick(e)}
              className="w-full grid grid-cols-[90px_130px_1fr_130px] px-3 py-2.5 text-left text-white
                text-[15px] border-b border-black/40 hover:bg-[#0f8b8d]">
              <span className="text-white/60">{e.code}</span>
              <span>{e.tax_id || '—'}</span>
              <span className="truncate">
                {e.name}
                {e.is_blocked && <span className="ml-2 text-[#ff8a80] text-[12px]">bloqueada</span>}
                {e.card_name && <span className="ml-2 text-[#f0c000] text-[12px]">{e.card_name}</span>}
              </span>
              <span>{e.phone || '—'}</span>
            </button>
          ))}
          {!isFetching && linhas.length === 0 && (
            <div className="text-white/50 text-center py-10">Nenhuma entidade encontrada.</div>
          )}
        </div>

        <TouchKeyboard valor={texto} setValor={setTexto} onOk={() => setBusca(texto)} />
      </div>
    </Window>
  );
}
