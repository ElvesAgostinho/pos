import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

/**
 * AS PESSOAS DA MESA — os números de baixo da comanda.
 *
 * Quatro amigos jantam e cada um paga o que comeu: cada NÚMERO é uma pessoa (uma
 * subconta da MESMA mesa). Tocar num número muda para a conta dessa pessoa; tocar no
 * número SEGUINTE (apagado) ACRESCENTA uma pessoa — abre-lhe uma subconta vazia.
 *
 * Os números GIRAM de verdade (carrossel): as setas rodam a fila — 1·2·3·4 passa a
 * 2·3·4·5 — e ao chegar ao fim volta ao princípio. Uma mesa de grupo com 12 pessoas
 * cabe sempre nos mesmos 4 lugares.
 *
 * Nada disto é novo: as subcontas são o `split`/`siblings`/`merge` do motor de
 * tickets do backoffice; cada uma paga-se como qualquer conta.
 */
export default function SubcontaBar({ conta, mesa, outlet, onSwitch }: {
  conta: any;                       // a conta atual (tem table e outlet)
  // Sem conta ativa (o painel direito das Parciais nasce vazio), a MESA de referência
  // vem por aqui — o carrossel mostra as pessoas dela na mesma, para se escolher uma.
  mesa?: number | null;
  outlet?: number | null;
  onSwitch: (ticketId: number) => void;
}) {
  const qc = useQueryClient();
  const [ini, setIni] = useState(0);      // onde começa a janela do carrossel
  const tableId = conta?.table ?? mesa ?? null;
  const outletId = conta?.outlet ?? outlet ?? null;

  // TODAS as contas abertas desta mesa, por ordem de chegada — o nº 1 é a primeira.
  const { data: contas = [] } = useQuery({
    queryKey: ['subcontas', tableId],
    queryFn: async () => {
      const r = await apiClient.get('pos/tickets/', { params: { status: 'OPEN' } });
      const todas = (r.data?.results || r.data || []) as any[];
      return todas.filter((t) => t.status === 'OPEN' && t.table === tableId)
        .sort((a, b) => a.id - b.id);
    },
    enabled: !!tableId,
    refetchInterval: 8000,
  });

  if (!tableId) return null;    // venda direta / balcão: não há mesa, não há pessoas

  const acrescentar = async () => {
    try {
      const r = await apiClient.post('pos/tickets/', {
        outlet: outletId, table: tableId, guests: 1,
        guest_type: conta?.guest_type || 'PASSANTE',
        operator_name: (JSON.parse(localStorage.getItem('pos_operator') || '{}').name) || 'Operador',
      });
      qc.invalidateQueries({ queryKey: ['subcontas', tableId] });
      qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
      onSwitch(r.data.id);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Não foi possível acrescentar a pessoa.');
    }
  };

  // O carrossel vai ATÉ 50+ números (como o original): os primeiros são as pessoas
  // reais; qualquer número vazio acrescenta a pessoa seguinte. Girar dá a volta.
  const total = Math.max(50, contas.length + 1);
  const JANELA = 4;
  const girar = (d: number) => setIni((ini + d + total) % total);

  return (
    <div className="flex items-stretch bg-black gap-px h-[62px] flex-shrink-0">
      {total > JANELA && (
        <button onClick={() => girar(-1)} className="w-[40px] bg-[#2b2b2b] text-white/80 text-[22px]">‹</button>
      )}
      {Array.from({ length: Math.min(JANELA, total) }, (_, j) => {
        const i = (ini + j) % total;         // gira com volta ao princípio
        const t = contas[i];
        return (
          <button key={j}
            onClick={() => (t ? onSwitch(t.id) : acrescentar())}
            title={t ? `Subconta ${i + 1} · ${Number(t.grand_total).toLocaleString('pt-PT')} Kz`
              : 'Acrescentar pessoa (nova subconta)'}
            className={`flex-1 text-[22px] font-bold
              ${t && t.id === conta?.id
                ? 'bg-[#1a1a1a] text-white ring-2 ring-[#f0c000]'
                : t ? 'bg-[#2b2b2b] text-white/80'
                  : 'bg-[#1f1f1f] text-white/35'}`}>
            {i + 1}
            {t && Number(t.grand_total) > 0 && (
              <span className="block text-[11px] font-normal text-white/50 -mt-1">
                {Number(t.grand_total).toLocaleString('pt-PT')}
              </span>
            )}
          </button>
        );
      })}
      {total > JANELA && (
        <button onClick={() => girar(1)} className="w-[40px] bg-[#2b2b2b] text-white/80 text-[22px]">›</button>
      )}
    </div>
  );
}
