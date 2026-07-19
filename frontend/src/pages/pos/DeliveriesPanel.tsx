import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import { aviso, pedir } from '../../ui/dialogo';
import { IcoEntrega, IcoLapis, IcoVisto } from './Icons';

/**
 * ENTREGAS — a fila do que sai da cozinha para um DESTINO (Quarto, Piscina, Praia…).
 *
 * Uma mesa serve-se ali; um destino é caminho: o pedido fica PRONTO, alguém pega no
 * tabuleiro (DESPACHADO) e alguém confirma que chegou (ENTREGUE, com nome e hora —
 * fica na auditoria). Sem este ecrã, o room-service era um grito para o corredor.
 * Motor: dispatch_order/deliver do backoffice; o destino aparece na fatura.
 */
export default function DeliveriesPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();

  const { data: fila = [] } = useQuery({
    queryKey: ['pos-entregas'],
    queryFn: async () => {
      const r = await apiClient.get('pos/tickets/', { params: { status: 'OPEN,SUSPENDED' } });
      // só o que tem DESTINO (não mesas) e ainda não foi entregue
      return ((r.data?.results || r.data || []) as any[])
        .filter((t) => t.status === 'OPEN' && t.dest_kind && t.dest_kind !== 'TABLE'
          && t.delivery_status !== 'DELIVERED');
    },
    refetchInterval: 8000,
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['pos-entregas'] });
  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

  const despachar = async (t: any) => {
    try { await apiClient.post(`pos/tickets/${t.id}/dispatch_order/`, {}); inval(); }
    catch (e: any) { aviso(e?.response?.data?.detail || 'Erro.'); }
  };
  const entregar = async (t: any) => {
    const quem = await pedir(`ENTREGUE em ${t.dest_label}?\n\nQuem entregou:`);
    if (!quem) return;
    const nota = await pedir('Observações (opcional):') || '';
    try {
      await apiClient.post(`pos/tickets/${t.id}/deliver/`, { delivered_by: quem, note: nota });
      inval();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Erro.'); }
  };

  return (
    <Window title="Entregas — pedidos com destino" width={820} onClose={onClose} tone="#1a4f8a">
      <div className="flex flex-col bg-[#1a1a1a]" style={{ maxHeight: '66vh' }}>
        <div className="grid grid-cols-[1fr_120px_110px_110px_190px] bg-[#2b2b2b] text-white
          text-[13px] font-bold px-3 py-2">
          <span>Destino / Conta</span><span>Prioridade</span><span className="text-right">Total</span>
          <span>Estado</span><span />
        </div>
        <div className="flex-1 overflow-auto pos-arrasta">
          {fila.map((t: any) => (
            <div key={t.id} className="grid grid-cols-[1fr_120px_110px_110px_190px] px-3 py-2
              text-white text-[14px] border-b border-black/30 items-center">
              <span>
                <b>{t.dest_label}</b>
                <span className="block text-[12px] text-white/50">{t.ticket_number} · {t.operator_name}</span>
                {t.dest_note && <span className="block text-[12px] text-[#f0c000]"><IcoLapis size={12} /> {t.dest_note}</span>}
              </span>
              <span className={t.dest_priority === 'URGENT' ? 'text-[#ff8a80] font-bold' : 'text-white/60'}>
                {t.dest_priority === 'URGENT' ? 'URGENTE' : 'Normal'}
              </span>
              <span className="text-right">{money(t.grand_total)}</span>
              <span className={t.delivery_status === 'DISPATCHED' ? 'text-[#9dffb0]' : 'text-white/60'}>
                {t.delivery_status === 'DISPATCHED' ? 'A caminho' : 'Na cozinha'}
              </span>
              <span className="flex gap-1 justify-end">
                {t.delivery_status !== 'DISPATCHED' && (
                  <button onClick={() => despachar(t)}
                    className="h-[36px] px-3 bg-[#1a4f8a] text-white text-[13px] font-bold rounded"><span className="inline-flex items-center gap-2"><IcoEntrega size={18} />Despachar</span></button>
                )}
                <button onClick={() => entregar(t)}
                  className="h-[36px] px-3 bg-[#1f7a34] text-white text-[13px] font-bold rounded"><span className="inline-flex items-center gap-2"><IcoVisto size={24} />Entregue</span></button>
              </span>
            </div>
          ))}
          {fila.length === 0 && (
            <div className="text-white/50 text-center py-8 text-[14px]">
              Sem entregas pendentes — os pedidos com destino (Quarto/Piscina/…) aparecem aqui.
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}
