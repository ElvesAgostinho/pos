import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import TouchKeyboard from './TouchKeyboard';

/**
 * INFO. HÓSPEDE — quem está em casa, agora.
 *
 * É o que o empregado precisa para lançar um consumo no quarto: o quarto, o hóspede, a
 * conta (folio), o regime e o saldo. Sem isto, ele pergunta o número do quarto ao cliente
 * e escreve o que o cliente disser — e é assim que o jantar do 302 vai parar ao 203.
 *
 * MAPA DE REFEIÇÕES (o outro separador) mostra o que cada regime INCLUI hoje: BB só tem
 * pequeno-almoço. Servir um almoço a quem só tem BB e não o cobrar é oferecer o almoço —
 * e ninguém dá por isso, porque "o cliente é do hotel".
 */
export default function GuestsPanel({ aba, onPick, onClose }: {
  aba: 'GUESTS' | 'MEALS';
  onPick?: (h: any) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');

  const { data } = useQuery({
    queryKey: ['pos-guests', aba, busca],
    queryFn: async () => (await apiClient.get(
      aba === 'GUESTS' ? 'pos/terminal/guests/' : 'pos/terminal/meals/',
      { params: busca ? { q: busca } : undefined })).data,
  });

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const linhas: any[] = (data?.rows || []).filter((r: any) =>
    !busca || `${r.room} ${r.guest} ${r.entity}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <Window title={aba === 'GUESTS' ? 'Info. Hóspede' : 'Mapa de Refeições'}
      width={1400} onClose={onClose}>
      <div className="flex flex-col" style={{ height: '62vh' }}>

        {/* sem PMS, diz-se com todas as letras */}
        {data && data.available === false && (
          <div className="p-10 text-center text-white/70 text-[17px]">
            {data.detail}
          </div>
        )}

        {data?.available && (
          <div className="flex-1 overflow-auto min-h-0">
            {aba === 'GUESTS' ? (
              <>
                <div className="grid grid-cols-[130px_140px_1fr_200px_160px_140px] bg-[#3a3a3a]
                  text-white text-[14px] font-bold px-3 py-2 sticky top-0">
                  <span>Quarto</span><span>Conta</span><span>Hóspede</span>
                  <span>Check-Out</span><span>Package</span><span className="text-right">Saldo</span>
                </div>
                {linhas.map((h) => (
                  <button key={h.reservation} onClick={() => onPick?.(h)}
                    className="w-full grid grid-cols-[130px_140px_1fr_200px_160px_140px] px-3 py-2.5
                      text-left text-white text-[15px] border-b border-black/40 hover:bg-[#0f8b8d]">
                    <span className="font-bold">{h.room}</span>
                    <span>{h.folio || '—'}</span>
                    <span>
                      {h.entity && <span className="block text-[13px] text-[#4ec5c1]">{h.entity}</span>}
                      {h.guest}
                    </span>
                    <span>{h.checkout}</span>
                    <span>{h.board}</span>
                    <span className="text-right">{money(h.balance)}</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="grid text-white text-[14px] font-bold bg-[#3a3a3a] px-3 py-2 sticky top-0"
                  style={{ gridTemplateColumns: `120px 120px 1fr repeat(${(data.meals || []).length}, 170px)` }}>
                  <span>Quarto</span><span>Regime</span><span>Entidade / Hóspede</span>
                  {(data.meals || []).map((m: any) => (
                    <span key={m.code} className="text-center">{m.label}</span>
                  ))}
                </div>
                {linhas.map((h) => (
                  <div key={h.reservation}
                    className="grid px-3 py-2.5 text-white text-[15px] border-b border-black/40"
                    style={{ gridTemplateColumns: `120px 120px 1fr repeat(${(data.meals || []).length}, 170px)` }}>
                    <span className="font-bold">{h.room}</span>
                    <span>{h.board}</span>
                    <span>
                      {h.entity && <span className="block text-[13px] text-[#4ec5c1]">{h.entity}</span>}
                      {h.guest}
                    </span>
                    {(data.meals || []).map((m: any) => (
                      <span key={m.code} className="text-center">
                        {h.meals[m.code] ? (
                          <span className="text-[#2ecc40] text-[20px]">● {h.pax}</span>
                        ) : (
                          <span className="text-[#e02020] text-[20px]" title="Não incluído — cobra-se">⊘</span>
                        )}
                      </span>
                    ))}
                  </div>
                ))}
              </>
            )}

            {linhas.length === 0 && (
              <div className="text-white/50 text-center py-12">Ninguém em casa.</div>
            )}
          </div>
        )}

        <TouchKeyboard valor={texto} setValor={setTexto} onOk={() => setBusca(texto)} />
      </div>
    </Window>
  );
}
