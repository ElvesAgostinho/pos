import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import PayPanel from './PayPanel';
import { aviso, pedir } from '../../ui/dialogo';
import { IcoCadeado, IcoCruz, IcoDinheiro } from './Icons';

/**
 * FECHO DO DIA NO TERMINAL — e o que o impede.
 *
 * O dia não fecha com contas abertas: seriam vendas servidas e não cobradas. Antes,
 * o terminal só dizia "12 conta(s) ainda abertas" e deixava o caixa à procura delas
 * mesa a mesa. Agora a janela LISTA as contas que travam o fecho e resolve-as aqui:
 *   💰 COBRAR — abre o painel de pagamentos dessa conta (o mesmo de sempre);
 *   ✕ ANULAR — anula com motivo (fica na auditoria; a mesa liberta-se).
 * Quando a lista chega a zero, o botão FECHAR O DIA acende. É o mesmo motor do
 * backoffice (day-close + pay + void) — só que ao alcance do dedo do caixa.
 */
export default function DayClose({ onClosed, onClose }: {
  onClosed: () => void; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [aCobrar, setACobrar] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: d, refetch } = useQuery({
    queryKey: ['pos-dayclose'],
    queryFn: async () => (await apiClient.get('pos/ops/day-close/')).data,
    refetchInterval: 8000,
  });

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const contas: any[] = d?.open_tickets || [];

  const cobrar = async (t: any) => {
    try {
      const conta = (await apiClient.get(`pos/tickets/${t.id}/`)).data;
      setACobrar(conta);
    } catch { aviso('Não foi possível abrir a conta.'); }
  };

  const anular = async (t: any) => {
    const motivo = await pedir(
      `ANULAR a conta ${t.ticket} (${t.where} · ${money(t.total)} Kz)?\n\n` +
      'A anulação fica na auditoria com o motivo.\n\nMotivo:');
    if (!motivo) return;
    try {
      await apiClient.post(`pos/tickets/${t.id}/void/`, { reason: motivo });
      await refetch();
      qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível anular.'); }
  };

  const fechar = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post('pos/ops/day-close/', {});
      aviso(r.data?.detail || 'Dia fechado.');
      onClosed();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível fechar o dia.');
      await refetch();
    } finally { setBusy(false); }
  };

  return (
    <Window title={`Fecho do Dia — ${d?.date || ''}`} width={860} onClose={onClose} tone="#8a0f0f">
      <div className="flex flex-col bg-[#1a1a1a]" style={{ maxHeight: '70vh' }}>
        <div className="px-4 py-2 text-white/80 text-[14px] bg-[#242424] flex gap-6">
          <span>Vendas de hoje: <b className="text-white">{d?.sales_today?.count ?? 0}</b> conta(s)
            · <b className="text-white">{money(d?.sales_today?.total)} Kz</b></span>
          <span>Caixas abertas: <b className="text-white">{(d?.open_cash_sessions || []).length}</b></span>
          <span className={contas.length ? 'text-[#ff8a80] font-bold' : 'text-[#9dffb0]'}>
            {contas.length ? `${contas.length} conta(s) a travar o fecho` : 'Nada trava o fecho'}
          </span>
        </div>

        {/* as contas que TRAVAM o fecho — resolvem-se AQUI, uma a uma */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-[110px_1fr_120px_1fr_120px_170px] bg-[#2b2b2b] text-white
            text-[13px] font-bold px-3 py-2 sticky top-0">
            <span>Conta</span><span>Onde</span><span>Outlet</span>
            <span>Operador</span><span className="text-right">Total</span><span />
          </div>
          {contas.map((t) => (
            <div key={t.id} className="grid grid-cols-[110px_1fr_120px_1fr_120px_170px] px-3 py-2
              text-white text-[14px] border-b border-black/30 items-center">
              <span className="text-white/60 text-[12px]">{t.ticket}</span>
              <span>{t.where}</span>
              <span className="text-white/60">{t.outlet}</span>
              <span className="text-white/60">{t.operator || '—'}</span>
              <span className="text-right font-bold">{money(t.total)}</span>
              <span className="flex gap-1 justify-end">
                <button onClick={() => cobrar(t)}
                  className="h-[38px] px-3 bg-[#0f8b8d] text-white text-[13px] font-bold rounded"><span className="inline-flex items-center gap-2"><IcoDinheiro size={22} />Cobrar</span></button>
                <button onClick={() => anular(t)}
                  className="h-[38px] px-3 bg-[#8a0f0f] text-white text-[13px] font-bold rounded"><span className="inline-flex items-center gap-2"><IcoCruz size={24} />Anular</span></button>
              </span>
            </div>
          ))}
          {contas.length === 0 && (
            <div className="text-white/50 text-center py-8 text-[14px]">
              Sem contas abertas — o dia pode fechar.
            </div>
          )}
        </div>

        <button onClick={fechar} disabled={busy || contas.length > 0}
          className="h-[58px] m-2 bg-[#1f7a34] text-white text-[18px] font-bold rounded
            disabled:bg-[#3a3a3a] disabled:text-white/30">
          {contas.length > 0
            ? `Resolva as ${contas.length} conta(s) para fechar o dia`
            : busy ? 'A fechar…' : <span className="inline-flex items-center gap-2"><IcoCadeado size={22} />FECHAR O DIA</span>}
        </button>
      </div>

      {aCobrar && (
        <PayPanel ticket={aCobrar}
          onClose={() => setACobrar(null)}
          onPaid={() => { setACobrar(null); refetch(); }} />
      )}
    </Window>
  );
}
