import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import PayPanel from './PayPanel';
import { aviso } from '../../ui/dialogo';
import { IcoDinheiro, IcoImpressora, IcoParciais, IcoVisto } from './Icons';

/**
 * FUNÇÕES PARCIAIS — dividir a conta.
 *
 * Quatro amigos jantam e um paga só o que comeu. Sem isto, o empregado faz contas de
 * cabeça no guardanapo, cobra a mais a um e a menos a outro, e o fecho nunca bate.
 *
 * À esquerda a conta da mesa; à direita a subconta. As setas movem artigos entre as duas.
 * Move-se a QUANTIDADE, não a linha: metade da garrafa de vinho vai para um lado e metade
 * para o outro. A subconta paga-se sozinha — e a mesa continua ocupada com o resto.
 */
export default function SplitPanel({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [selEsq, setSelEsq] = useState<number[]>([]);
  const [selDir, setSelDir] = useState<number[]>([]);
  const [qtd, setQtd] = useState(1);
  const [subId, setSubId] = useState<number | null>(null);
  const [aPagar, setAPagar] = useState<any | null>(null);

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

  const { data: origem } = useQuery({
    queryKey: ['split-src', ticket.id],
    queryFn: async () => (await apiClient.get(`pos/tickets/${ticket.id}/`)).data,
    initialData: ticket,
  });
  const { data: sub } = useQuery({
    queryKey: ['split-dst', subId],
    queryFn: async () => (await apiClient.get(`pos/tickets/${subId}/`)).data,
    enabled: !!subId,
  });

  const refrescar = async (novoId?: number) => {
    if (novoId) setSubId(novoId);
    await qc.invalidateQueries({ queryKey: ['split-src', ticket.id] });
    await qc.invalidateQueries({ queryKey: ['split-dst'] });
    await qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
    setSelEsq([]); setSelDir([]);
  };

  const mover = async (paraDireita: boolean, tudo: boolean) => {
    const de = paraDireita ? origem : sub;
    const seleccao = paraDireita ? selEsq : selDir;
    if (!de) return;
    const linhas = (de.lines || []).filter((l: any) =>
      tudo ? true : seleccao.includes(l.id));
    if (!linhas.length) return aviso('Escolha os artigos a passar.');

    const corpo = {
      lines: linhas.map((l: any) => ({
        line: l.id,
        quantity: tudo ? l.quantity : Math.min(qtd, Number(l.quantity)),
      })),
      ...(paraDireita ? (subId ? { to: subId } : {}) : { to: ticket.id }),
    };
    const url = paraDireita
      ? `pos/tickets/${ticket.id}/split/`
      : `pos/tickets/${subId}/split/`;
    try {
      const r = await apiClient.post(url, corpo);
      await refrescar(paraDireita ? r.data.target.id : undefined);
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível dividir a conta.');
    }
  };

  const Lista = ({ conta, sel, setSel, titulo }: any) => (
    <div className="flex-1 flex flex-col">
      <div className="h-[50px] bg-[#3a3a3a] flex items-center px-3 text-white text-[19px] font-bold">
        {titulo} ({conta?.lines?.length || 0})
      </div>
      <div className="grid grid-cols-[70px_1fr_120px] bg-[#2b2b2b] text-white text-[16px] font-bold px-2 py-2">
        <span>Qtd</span><span>Descrição</span><span className="text-right">Total</span>
      </div>
      <div className="flex-1 bg-[#8a8a8a]/30 overflow-auto border-2 border-[#c9a400]">
        {(conta?.lines || []).map((l: any) => (
          <button key={l.id} onClick={() => setSel(sel.includes(l.id)
            ? sel.filter((x: number) => x !== l.id) : [...sel, l.id])}
            className={`w-full grid grid-cols-[70px_1fr_120px] px-2 py-2 text-left text-white
              text-[15px] border-b border-black/20 ${sel.includes(l.id) ? 'bg-[#0f8b8d]' : ''}`}>
            <span>{Number(l.quantity)}</span>
            <span className="truncate">{l.description}</span>
            <span className="text-right">{money(l.line_total)}</span>
          </button>
        ))}
        {!conta && <div className="text-white/50 text-center py-10">Sem subconta ainda.</div>}
      </div>
      <div className="h-[64px] bg-[#8a8a8a] flex items-center justify-end px-3">
        <span className="text-white text-[28px] font-bold">{money(conta?.grand_total)}</span>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-40">
      <div className="w-[1400px] h-[92%] bg-[#2b2b2b] border-4 border-black flex flex-col">
        <div className="h-[56px] bg-[#3a3a3a] flex items-center justify-center text-white text-[22px] font-bold">
          Funções Parciais: {origem?.table_label || origem?.ticket_number}
        </div>

        <div className="flex-1 flex overflow-hidden">
          <Lista conta={origem} sel={selEsq} setSel={setSelEsq}
            titulo={`Mesa ${origem?.table_label || ''}`} />

          {/* as setas */}
          <div className="w-[110px] bg-[#1f1f1f] flex flex-col items-center justify-center gap-2 px-2">
            <button onClick={() => mover(true, true)}
              className="w-full h-[70px] bg-[#3a3a3a] text-white text-[26px] rounded" title="Passar tudo">»»</button>
            <button onClick={() => mover(true, false)}
              className="w-full h-[70px] bg-[#3a3a3a] text-white text-[26px] rounded" title="Passar o escolhido">»</button>
            <button onClick={() => mover(false, false)} disabled={!subId}
              className="w-full h-[70px] bg-[#3a3a3a] text-white text-[26px] rounded disabled:opacity-30" title="Trazer de volta">«</button>
            <button onClick={() => mover(false, true)} disabled={!subId}
              className="w-full h-[70px] bg-[#3a3a3a] text-white text-[26px] rounded disabled:opacity-30" title="Trazer tudo">««</button>

            {/* a quantidade que cada seta move */}
            <div className="w-full mt-2 text-center text-white/60 text-[12px]">move</div>
            <div className="flex gap-1 w-full">
              <button onClick={() => setQtd(Math.max(1, qtd - 1))}
                className="flex-1 h-[46px] bg-[#3a3a3a] text-white text-[22px] rounded">−</button>
              <div className="flex-1 h-[46px] bg-black text-white text-[20px] font-bold flex items-center justify-center rounded">
                {qtd}
              </div>
              <button onClick={() => setQtd(qtd + 1)}
                className="flex-1 h-[46px] bg-[#3a3a3a] text-white text-[22px] rounded">+</button>
            </div>
          </div>

          <Lista conta={sub} sel={selDir} setSel={setSelDir}
            titulo={`Subconta ${sub?.ticket_number || ''}`} />
        </div>

        {/* ações */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-black">
          <button onClick={onClose}
            className="h-[70px] bg-[#1f1f1f] text-[#2ecc40] text-[30px]" title="Terminar"><IcoVisto size={24} /></button>
          <button onClick={() => mover(true, false)}
            className="h-[70px] bg-[#1f1f1f] text-white text-[26px]" title="Dividir"><IcoParciais size={22} /></button>
          <button onClick={() => sub && setAPagar(sub)} disabled={!sub || !sub.lines?.length}
            className="h-[70px] bg-[#1f1f1f] text-[#f0c000] text-[28px] disabled:opacity-30"
            title="Cobrar a subconta"><IcoDinheiro size={22} /></button>
          <button onClick={async () => {
            if (!sub) return;
            try {
              await apiClient.post(`pos/tickets/${sub.id}/fire_kitchen/`, {});
              aviso('Comanda enviada.');
            } catch { aviso('Erro ao imprimir.'); }
          }} disabled={!sub}
            className="h-[70px] bg-[#1f1f1f] text-white text-[26px] disabled:opacity-30"
            title="Imprimir a subconta"><IcoImpressora size={22} /></button>
        </div>
      </div>

      {aPagar && (
        <PayPanel ticket={aPagar}
          onClose={() => setAPagar(null)}
          onPaid={() => { setAPagar(null); setSubId(null); refrescar(); }} />
      )}
    </div>
  );
}
