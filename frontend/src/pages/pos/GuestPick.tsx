import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import TouchKeyboard from './TouchKeyboard';

/**
 * ESCOLHER O HÓSPEDE — a lista de quem está EM CASA, do PMS.
 *
 * Quando a mesa é de um HÓSPEDE, não se escreve o nome à mão: escolhe-se da lista de
 * check-ins (quarto, nome, regime, folio). É o que evita o jantar do 302 ir parar ao
 * 203. A mesma lista serve para COBRAR no quarto: o meio "Conta Quarto" pede o quarto
 * daqui, não de um prompt às cegas.
 *
 * Os PARÂMETROS do backoffice mandam: 8035/8064 desligados → este ecrã diz que a
 * interface está desligada; 8147 ligado → só devolve depois de se pesquisar.
 */
export default function GuestPick({ titulo = 'Escolher o hóspede', onPick, onClose }: {
  titulo?: string;
  onPick: (g: { room: string; guest: string; folio: number | null; board?: string }) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');

  const { data } = useQuery({
    queryKey: ['pos-guestpick', busca],
    queryFn: async () => (await apiClient.get('pos/terminal/guests/',
      { params: busca ? { q: busca } : undefined })).data,
  });
  const linhas: any[] = data?.rows || [];

  return (
    <Window title={titulo} width={620} onClose={onClose} tone="#0f8b8d">
      <div className="flex flex-col bg-[#1a1a1a]" style={{ height: '58vh' }}>
        <div className="grid grid-cols-[90px_1fr_90px_1fr] bg-[#2b2b2b] text-white text-[13px] font-bold px-3 py-2">
          <span>Quarto</span><span>Hóspede</span><span>Regime</span><span>Entidade</span>
        </div>
        <div className="flex-1 overflow-auto">
          {linhas.map((g: any, i: number) => (
            <button key={i} onClick={() => onPick({ room: g.room, guest: g.guest, folio: g.folio, board: g.board })}
              className="w-full grid grid-cols-[90px_1fr_90px_1fr] px-3 py-2.5 text-left text-white
                text-[15px] border-b border-black/30 hover:bg-[#0f8b8d]/40 active:bg-[#0f8b8d]">
              <span className="font-bold">{g.room}</span>
              <span className="truncate">{g.guest}</span>
              <span className="text-white/60">{g.board || '—'}</span>
              <span className="truncate text-white/60">{g.entity || ''}</span>
            </button>
          ))}
          {data && data.available === false && (
            <div className="text-white/50 text-center py-8 px-6 text-[14px]">{data.detail}</div>
          )}
          {data?.must_search && (
            <div className="text-white/50 text-center py-8 text-[14px]">
              Escreva o nome ou o quarto (parâmetro 8147 — hotéis grandes não listam todos).
            </div>
          )}
          {data?.available !== false && !data?.must_search && linhas.length === 0 && (
            <div className="text-white/50 text-center py-8 text-[14px]">Nenhum hóspede em casa.</div>
          )}
        </div>
        <TouchKeyboard valor={texto} setValor={setTexto} onOk={() => setBusca(texto)} />
      </div>
    </Window>
  );
}
