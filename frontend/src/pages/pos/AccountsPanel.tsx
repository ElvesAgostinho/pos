import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import TouchKeyboard from './TouchKeyboard';

/**
 * CONTAS CORRENTES — as entidades e o que devem.
 *
 * No terminal serve duas coisas: ver quanto é que uma empresa já deve antes de lhe
 * deixar levar mais fiado, e ESCOLHER a entidade para a conta que se está a servir. Uma
 * entidade bloqueada aparece bloqueada — e o empregado não fica a saber disso só na hora
 * de cobrar, à frente do cliente.
 */
export default function AccountsPanel({ onPick, onClose }: {
  onPick?: (e: any) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<any | null>(null);

  const { data } = useQuery({
    queryKey: ['pos-cc', busca],
    queryFn: async () => (await apiClient.get('pos/ops/current-accounts/',
      { params: { scope: 'ALL', q: busca || undefined } })).data,
  });

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const linhas: any[] = data?.rows || [];

  return (
    <Window title="Contas Correntes — Entidades" width={1400} onClose={onClose}>
      <div className="flex flex-col" style={{ height: '62vh' }}>

        <div className="grid grid-cols-[1fr_150px_180px_180px_200px] bg-[#3a3a3a] text-white
          text-[17px] font-bold px-3 py-3">
          <span>Nome</span><span>Nr. contrib.</span><span>Contacto</span>
          <span className="text-right">Cash Advance</span>
          <span className="text-right">Saldo (Conta Corrente)</span>
        </div>

        <div className="flex-1 overflow-auto bg-[#1f1f1f] min-h-0">
          {linhas.map((e) => (
            <button key={e.id} onClick={() => setSel(e)}
              className={`w-full grid grid-cols-[1fr_150px_180px_180px_200px] px-3 py-2.5 text-left
                text-white text-[15px] border-b border-black/40
                ${sel?.id === e.id ? 'bg-[#0f8b8d]' : 'hover:bg-[#2b2b2b]'}`}>
              <span>
                {e.blocked && <span className="text-[#ff8a80] mr-2">⛔</span>}
                {e.name}
              </span>
              <span>{e.other || '—'}</span>
              <span>{e.contact || '—'}</span>
              <span className="text-right text-[#2ecc40]">{money(e.advance_balance)}</span>
              <span className={`text-right font-bold ${Number(e.cc_balance) > 0 ? 'text-[#ff8a80]' : ''}`}>
                {money(e.cc_balance)}
              </span>
            </button>
          ))}
          {linhas.length === 0 && (
            <div className="text-white/50 text-center py-12">Nenhuma entidade encontrada.</div>
          )}
        </div>

        <TouchKeyboard valor={texto} setValor={setTexto} onOk={() => setBusca(texto)} />

        <div className="grid grid-cols-3 gap-1 p-1 bg-black">
          <button onClick={() => sel && onPick?.(sel)} disabled={!sel || !onPick}
            className="h-[64px] bg-[#1f1f1f] text-[#2ecc40] text-[18px] font-bold disabled:opacity-30">
            ✔ Selecionar
          </button>
          <button onClick={() => window.open('/backoffice', '_blank')}
            className="h-[64px] bg-[#1f1f1f] text-white text-[18px]">＋ Nova entidade</button>
          <button onClick={onClose}
            className="h-[64px] bg-[#1f1f1f] text-[#e02020] text-[18px] font-bold">✖ Cancelar</button>
        </div>
      </div>
    </Window>
  );
}
