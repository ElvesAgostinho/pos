import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import { IcoAviso, IcoLapis } from './Icons';

/**
 * KDS — O ECRÃ DA COZINHA (e do bar, e da pastelaria).
 *
 * É o monitor pendurado na cozinha: cada cartão é um item DISPARADO da venda, com a
 * mesa, a quantidade e há quanto tempo espera. TOCAR no cartão avança o estado —
 * FIRED (chegou) → PREPARING (ao lume) → READY (pronto a sair) → SERVED (saiu da fila).
 *
 * As ANULAÇÕES entram A VERMELHO e ficam até a estação confirmar que viu — senão o
 * cozinheiro faz o prato que a mesa já cancelou.
 *
 * A estação vem do backoffice (a tecla do artigo diz para onde vai) — este ecrã só
 * mostra a fila DELA. Rota: /pos/kds (escolhe-se a estação em cima).
 */
const ESTADOS: Record<string, { cor: string; label: string; accao: string }> = {
  FIRED: { cor: '#8a6100', label: 'NOVO', accao: 'Começar' },
  PREPARING: { cor: '#1a4f8a', label: 'A PREPARAR', accao: 'Pronto' },
  READY: { cor: '#1f7a34', label: 'PRONTO', accao: 'Saiu' },
  CANCELLED: { cor: '#8a0f0f', label: 'ANULADO', accao: 'Visto' },
};
const ESTACOES = [['KITCHEN', 'Cozinha'], ['BAR', 'Bar'], ['PASTRY', 'Pastelaria']];

export default function KdsScreen() {
  const qc = useQueryClient();
  const [estacao, setEstacao] = useState('KITCHEN');

  const { data: fila = [] } = useQuery({
    queryKey: ['kds', estacao],
    queryFn: async () => {
      const r = await apiClient.get('pos/kds/', { params: { station: estacao } });
      return (r.data?.results || r.data || []) as any[];
    },
    refetchInterval: 4000,          // a cozinha vive em tempo real
  });

  const avancar = async (l: any) => {
    try {
      await apiClient.post(`pos/kds/${l.id}/advance/`, {});
      qc.invalidateQueries({ queryKey: ['kds'] });
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Erro.'); }
  };

  const minutos = (t: string) => t ? Math.floor((Date.now() - new Date(t).getTime()) / 60000) : 0;

  return (
    <div className="h-screen w-screen bg-[#111] flex flex-col overflow-hidden select-none">
      <div className="h-[64px] bg-black flex items-center px-4 gap-2 flex-shrink-0">
        <span className="text-[26px] font-black text-white">ML<span className="text-[#c9a400]">.</span></span>
        <span className="text-white/60 text-[15px] mr-4">Ecrã de Produção</span>
        {ESTACOES.map(([k, l]) => (
          <button key={k} onClick={() => setEstacao(k)}
            className={`h-[44px] px-5 rounded font-bold text-[16px] ${estacao === k
              ? 'bg-[#c9a400] text-black' : 'bg-[#2b2b2b] text-white/70'}`}>{l}</button>
        ))}
        <span className="ml-auto text-white/60 text-[14px]">{fila.length} item(ns) na fila</span>
      </div>

      <div className="flex-1 overflow-auto p-3 grid gap-3 content-start"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {fila.map((l: any) => {
          const e = ESTADOS[l.kds_status] || ESTADOS.FIRED;
          const espera = minutos(l.fired_at);
          return (
            <button key={l.id} onClick={() => avancar(l)}
              className="rounded-lg overflow-hidden text-left shadow-lg active:scale-95 transition"
              style={{ background: '#1d1d1d', border: `2px solid ${e.cor}` }}>
              <div className="px-3 py-1.5 flex justify-between items-center text-white text-[13px] font-bold"
                style={{ background: e.cor }}>
                <span>{e.label}</span>
                {/* o TEMPO é o que manda na cozinha: >10 min pisca a consciência */}
                <span className={espera > 10 && l.kds_status !== 'READY' ? 'animate-pulse' : ''}>{espera} min</span>
              </div>
              <div className="p-3">
                <div className="text-white text-[18px] font-bold leading-tight">
                  {Number(l.quantity)}× {l.description || l.item_name}
                </div>
                <div className="text-white/60 text-[13px] mt-1">
                  {l.dest_label || (l.table_label ? `Mesa ${l.table_label}` : 'Balcão')} · {l.operator_name || ''}
                </div>
                {/* a NOTA do empregado ("sem cebola") — é para a cozinha que ela existe */}
                {l.note && <div className="text-[#7fd4ff] text-[13px] mt-1 font-bold"><IcoLapis size={12} /> {l.note}</div>}
                {l.allergens?.length > 0 && (
                  <div className="text-[#ff8a80] text-[12px] mt-1"><IcoAviso size={12} /> {l.allergens.join(', ')}</div>
                )}
                <div className="mt-2 text-center text-white text-[14px] font-bold rounded py-1.5"
                  style={{ background: '#2b2b2b' }}>
                  toque → {e.accao}
                </div>
              </div>
            </button>
          );
        })}
        {fila.length === 0 && (
          <div className="col-span-full text-white/40 text-center py-24 text-[18px]">
            Fila vazia — nada em produção nesta estação.
          </div>
        )}
      </div>
    </div>
  );
}
