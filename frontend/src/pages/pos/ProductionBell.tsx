import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';

/**
 * O SINO DA PRODUÇÃO — o lado do EMPREGADO do que se passa na cozinha/bar/pastelaria.
 *
 * A cozinha tem o KDS; a sala tem isto: um sino no topo do terminal que PULSA quando
 * há pratos CONCLUÍDOS no passe ("ir buscar!"), e uma janela em tempo real com as
 * três colunas do ofício — Iniciado, Concluído, Entregue — e OS TEMPOS calculados
 * dos carimbos do motor:
 *   · Iniciado  → há quanto tempo está ao lume (fired → agora);
 *   · Concluído → quanto demorou a fazer (fired → ready) e há quanto tempo ESPERA
 *                 no passe (ready → agora) — comida fria é isto;
 *   · Entregue  → o tempo total do serviço (fired → served).
 */
const dur = (a?: string, b?: string) => {
  if (!a) return '—';
  const ms = (b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime();
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

export function useProducao() {
  const { data: linhas = [] } = useQuery({
    queryKey: ['pos-producao'],
    queryFn: async () => (await apiClient.get('pos/kds/monitor/')).data as any[],
    refetchInterval: 5000,          // tempo real — o passe não espera
  });
  return {
    linhas,
    prontos: linhas.filter((l) => l.kds_status === 'READY').length,
  };
}

export function ProductionWindow({ linhas, onClose }: { linhas: any[]; onClose: () => void }) {
  const [aba, setAba] = useState<'PREPARING' | 'READY' | 'SERVED'>('READY');
  const ABAS: [typeof aba, string, string][] = [
    ['PREPARING', 'Iniciado', '#1a4f8a'], ['READY', 'Concluído', '#1f7a34'], ['SERVED', 'Entregue', '#3a3a3a']];
  const doEstado = linhas.filter((l) => l.kds_status === aba);

  return (
    <Window title="Produção — cozinha, bar e pastelaria em tempo real" width={780}
      onClose={onClose} tone="#1f7a34">
      <div className="flex flex-col bg-[#1a1a1a]" style={{ maxHeight: '66vh' }}>
        <div className="flex gap-1 p-2 bg-[#242424]">
          {ABAS.map(([k, label, cor]) => (
            <button key={k} onClick={() => setAba(k)}
              className="flex-1 h-[44px] rounded font-bold text-[15px] text-white"
              style={{ background: aba === k ? cor : '#2b2b2b', opacity: aba === k ? 1 : 0.6 }}>
              {label} ({linhas.filter((l) => l.kds_status === k).length})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[70px_1fr_120px_110px_150px] bg-[#2b2b2b] text-white
          text-[12px] font-bold px-3 py-2">
          <span>Qtd</span><span>Artigo / Onde</span><span>Estação</span>
          <span>{aba === 'PREPARING' ? 'Ao lume há' : aba === 'READY' ? 'Fez-se em' : 'Serviço total'}</span>
          <span>{aba === 'READY' ? 'NO PASSE há' : 'Enviado às'}</span>
        </div>
        <div className="flex-1 overflow-auto">
          {doEstado.map((l: any) => {
            const espera = aba === 'READY' ? dur(l.ready_at) : '';
            const urgente = aba === 'READY' && Number(espera.split(' ')[0]) >= 5;
            return (
              <div key={l.id} className="grid grid-cols-[70px_1fr_120px_110px_150px] px-3 py-2
                text-white text-[14px] border-b border-black/30 items-center">
                <span>{Number(l.quantity)}×</span>
                <span className="truncate">
                  {l.item_name}
                  <span className="block text-[12px] text-white/50">
                    {l.dest_label || (l.table_label ? `Mesa ${l.table_label}` : 'Balcão')} · {l.operator_name || ''}
                  </span>
                  {l.note && <span className="block text-[12px] text-[#7fd4ff]">✎ {l.note}</span>}
                </span>
                <span className="text-white/60 text-[13px]">{l.station_label || l.kds_station}</span>
                <span className="font-bold">
                  {aba === 'PREPARING' ? dur(l.fired_at)
                    : aba === 'READY' ? dur(l.fired_at, l.ready_at)
                      : dur(l.fired_at, l.served_at)}
                </span>
                <span className={urgente ? 'text-[#ff8a80] font-bold animate-pulse' : 'text-white/60 text-[13px]'}>
                  {aba === 'READY' ? `${espera} ⚠ ir buscar`
                    : l.fired_at ? new Date(l.fired_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>
            );
          })}
          {doEstado.length === 0 && (
            <div className="text-white/50 text-center py-8 text-[14px]">Nada neste estado.</div>
          )}
        </div>
      </div>
    </Window>
  );
}
