import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

/**
 * AS PESSOAS DA MESA — o carrossel de subcontas.
 *
 * Quatro amigos jantam e cada um paga o que comeu: cada NÚMERO é uma pessoa (uma
 * subconta da MESMA mesa). Tocar num número muda para a conta dessa pessoa; tocar no
 * número SEGUINTE (o primeiro apagado) ACRESCENTA uma pessoa — abre-lhe uma subconta
 * vazia, pronta a receber os artigos dela.
 *
 * Os números RODAM (carrossel com ‹ ›) — uma mesa de grupo pode ter 12 pessoas e não
 * cabem todas na faixa. Nada disto é novo: as subcontas são o `split`/`siblings` do
 * motor de tickets do backoffice; cada uma paga-se como qualquer conta.
 */
export default function SubcontaBar({ conta, onSwitch }: {
  conta: any;                       // a conta atual (tem table e outlet)
  onSwitch: (ticketId: number) => void;
}) {
  const qc = useQueryClient();
  const faixa = useRef<HTMLDivElement>(null);

  // TODAS as contas abertas desta mesa, por ordem de chegada — o nº 1 é a primeira.
  const { data: contas = [] } = useQuery({
    queryKey: ['subcontas', conta?.table],
    queryFn: async () => {
      const r = await apiClient.get('pos/tickets/', { params: { status: 'OPEN' } });
      const todas = (r.data?.results || r.data || []) as any[];
      return todas.filter((t) => t.status === 'OPEN' && t.table === conta.table)
        .sort((a, b) => a.id - b.id);
    },
    enabled: !!conta?.table,
    refetchInterval: 8000,
  });

  if (!conta?.table) return null;    // venda direta / balcão: não há mesa, não há pessoas

  const acrescentar = async () => {
    try {
      const r = await apiClient.post('pos/tickets/', {
        outlet: conta.outlet, table: conta.table, guests: 1,
        guest_type: conta.guest_type || 'PASSANTE',
        operator_name: (JSON.parse(localStorage.getItem('pos_operator') || '{}').name) || 'Operador',
      });
      qc.invalidateQueries({ queryKey: ['subcontas', conta.table] });
      qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
      onSwitch(r.data.id);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Não foi possível acrescentar a pessoa.');
    }
  };

  // Mostra sempre pelo menos 4 células (como o original); a seguir às pessoas reais
  // vem O PRÓXIMO número, apagado — tocar nele é acrescentar essa pessoa.
  const celulas = Math.max(4, contas.length + 1);

  return (
    <div className="flex items-stretch bg-black h-[54px] flex-shrink-0">
      <button onClick={() => faixa.current?.scrollBy({ left: -240, behavior: 'smooth' })}
        className="w-[36px] bg-[#1f1f1f] text-white text-[20px] flex-shrink-0">‹</button>
      <div ref={faixa} className="flex-1 flex overflow-x-auto scroll-smooth"
        style={{ scrollbarWidth: 'none' }}>
        {Array.from({ length: celulas }, (_, i) => {
          const t = contas[i];
          const proxima = i === contas.length;          // o número que ACRESCENTA
          return (
            <button key={i}
              onClick={() => (t ? onSwitch(t.id) : proxima ? acrescentar() : undefined)}
              disabled={!t && !proxima}
              title={t ? `Subconta ${i + 1} · ${Number(t.grand_total).toLocaleString('pt-PT')} Kz`
                : proxima ? 'Acrescentar pessoa (nova subconta)' : ''}
              className={`min-w-[120px] flex-1 border-r border-[#3a3a3a] text-[20px] font-bold
                ${t && t.id === conta.id
                  ? 'bg-[#262626] text-white border-2 border-[#c9a400]'
                  : t ? 'bg-[#1a1a1a] text-white/85'
                    : proxima ? 'bg-[#111] text-white/40'
                      : 'bg-[#0d0d0d] text-white/15'}`}>
              {i + 1}
              {t && Number(t.grand_total) > 0 && (
                <span className="block text-[11px] font-normal text-white/50 -mt-0.5">
                  {Number(t.grand_total).toLocaleString('pt-PT')} Kz
                </span>
              )}
              {!t && proxima && <span className="block text-[11px] font-normal">+ pessoa</span>}
            </button>
          );
        })}
      </div>
      <button onClick={() => faixa.current?.scrollBy({ left: 240, behavior: 'smooth' })}
        className="w-[36px] bg-[#1f1f1f] text-white text-[20px] flex-shrink-0">›</button>
    </div>
  );
}
