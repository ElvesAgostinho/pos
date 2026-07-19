import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import { aviso, pedir } from '../../ui/dialogo';
import { IcoCadeado } from './Icons';

/**
 * FECHO DE CAIXA DO OPERADOR — contar o dinheiro e prestar contas.
 *
 * (8005) FECHO CEGO: com "Modo Detalhado" o operador conta SEM ver o esperado — se o
 * visse, escrevia-o e o desvio nunca aparecia. O servidor é que compara (esperado vs
 * contado = diferença) e tudo fica na sessão para a reconciliação do backoffice.
 *
 * SANGRIA e REFORÇO também se fazem aqui: o dinheiro que sai para o cofre e o troco
 * que entra ficam ESCRITOS — é o que faz o esperado bater com a gaveta.
 */
export default function CashClose({ sessao, onClosed, onClose }: {
  sessao: any; onClosed: () => void; onClose: () => void;
}) {
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: s, refetch } = useQuery({
    queryKey: ['pos-cash', sessao.id],
    queryFn: async () => (await apiClient.get(`pos/cash-sessions/${sessao.id}/`)).data,
  });
  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const cego = s && s.expected_cash == null;    // (8005) o servidor decide o que se vê

  const movimento = async (tipo: 'SANGRIA' | 'REFORCO') => {
    const valor = await pedir(tipo === 'SANGRIA'
      ? 'SANGRIA — quanto sai da gaveta para o cofre?'
      : 'REFORÇO — quanto entra na gaveta (troco)?');
    if (!valor) return;
    const motivo = await pedir('Motivo:') || '';
    try {
      await apiClient.post(`pos/cash-sessions/${sessao.id}/add_movement/`,
        { movement_type: tipo, amount: valor, reason: motivo });
      await refetch();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível registar.'); }
  };

  const fechar = async () => {
    if (!contado) return aviso('Conte o dinheiro e escreva o total.');
    setBusy(true);
    try {
      const r = await apiClient.post(`pos/cash-sessions/${sessao.id}/close/`,
        { counted_amount: contado, closing_notes: notas });
      const d = r.data;
      aviso(`CAIXA FECHADA\n\nEsperado: ${money(d.expected_amount)} Kz\nContado: ${money(d.counted_amount)} Kz`
        + `\nDiferença: ${money(d.difference)} Kz${Number(d.difference) !== 0 ? '  (!)' : '  ✔'}`);
      onClosed();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível fechar a caixa.');
      setBusy(false);
    }
  };

  const tecla = (t: string) => {
    if (t === 'C') return setContado('');
    if (t === '⌫') return setContado(contado.slice(0, -1));
    setContado(contado + t);
  };

  return (
    <Window title={`Fecho de Caixa — sessão CX-${sessao.id}`} width={520} onClose={onClose} tone="#8a0f0f">
      <div className="p-3 bg-[#1a1a1a] flex flex-col gap-2">
        <div className="bg-[#242424] rounded p-3 text-[14px] text-white/80 space-y-1">
          <div className="flex justify-between"><span>Fundo de abertura</span>
            <b className="text-white">{money(s?.opening_float)} Kz</b></div>
          <div className="flex justify-between"><span>Movimentos (sangrias/reforços)</span>
            <b className="text-white">{(s?.movements || []).length}</b></div>
          <div className="flex justify-between"><span>Esperado em caixa</span>
            <b className="text-white">{cego ? '••••• (fecho cego — parâmetro 8005)' : `${money(s?.expected_cash)} Kz`}</b></div>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => movimento('SANGRIA')}
            className="h-[48px] bg-[#8a6100] text-white font-bold rounded text-[14px]">↓ Sangria (p/ cofre)</button>
          <button onClick={() => movimento('REFORCO')}
            className="h-[48px] bg-[#1a4f8a] text-white font-bold rounded text-[14px]">↑ Reforço (troco)</button>
        </div>

        <div className="text-white/60 text-[13px] mt-1">CONTAGEM — o que está mesmo na gaveta:</div>
        <div className="h-[54px] bg-black rounded text-white text-[26px] font-bold flex items-center
          justify-end px-4 border border-[#4a4a4a]">
          {contado || <span className="text-white/25">0</span>}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'].map((t) => (
            <button key={t} onClick={() => tecla(t)}
              className={`h-[50px] rounded text-[20px] font-bold ${t === 'C'
                ? 'bg-[#c0140f] text-white' : 'bg-[#2e2e2e] text-white'}`}>{t}</button>
          ))}
        </div>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas do fecho (opcional)"
          className="h-[42px] bg-[#2b2b2b] text-white px-3 rounded border border-[#3a3a3a] text-[14px]
            placeholder:text-white/30 outline-none" />
        <button onClick={fechar} disabled={busy || !contado}
          className="h-[54px] bg-[#1f7a34] text-white text-[17px] font-bold rounded disabled:opacity-40">
          {busy ? 'A fechar…' : <span className="inline-flex items-center gap-2"><IcoCadeado size={22} />FECHAR A CAIXA</span>}
        </button>
      </div>
    </Window>
  );
}
