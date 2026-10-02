import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { Wallet, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar } from '../../ui/dialogo';

const btn = 'px-3 py-1.5 text-[12px] border border-[#D7DBDF] rounded-[6px] bg-gradient-to-b from-white to-[#F3F4F6] hover:to-[#EBEEF0] active:translate-y-px inline-flex items-center gap-1.5 disabled:opacity-40';
const ST_COLOR: Record<string, string> = { PENDING: '#2E75B6', PAID: '#17375E', FAILED: '#B42318', REFUNDED: '#2E75B6' };
const METODOS: [string, string][] = [
  ['TRANSFER', 'Transferência bancária'], ['CASH', 'Numerário'],
  ['CARD', 'Cartão'], ['GATEWAY', 'Pagamento online'], ['OTHER', 'Outro'],
];
const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

/**
 * DEPÓSITOS DE RESERVAS ONLINE — quem reservou no site e ainda não pagou, e
 * quem já pagou.
 *
 * O motor de reservas calculava o depósito e mandava-o para o ecrã do hóspede;
 * ninguém no hotel ficava a saber que havia dinheiro a receber, e no check-in
 * cobrava-se a estadia inteira outra vez. Esta é a lista que faltava — e
 * confirmar aqui uma entrada lança-a na conta do hóspede.
 */
export default function PmsBookingDepositsView() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<string>('PENDING');
  const [metodo, setMetodo] = useState<Record<number, string>>({});
  const [refer, setRefer] = useState<Record<number, string>>({});

  const { data: pagamentos = [], isFetching, refetch } = useQuery({
    queryKey: ['pms', 'booking-payments', filtro],
    queryFn: async () => (await apiClient.get('pms/booking-payments/', {
      params: filtro ? { status: filtro } : {},
    })).data,
    refetchInterval: 60000,
  });

  const confirmarPagamento = useMutation({
    mutationFn: async (p: any) => (await apiClient.post(`pms/booking-payments/${p.id}/mark-paid/`, {
      method: metodo[p.id] || 'TRANSFER',
      reference: refer[p.id] || '',
    })).data,
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['pms', 'booking-payments'] });
      qc.invalidateQueries({ queryKey: ['pms', 'folios'] });
      aviso(d.detail, 'Depósito confirmado');
    },
    onError: notifyError,
  });

  const marcarFalhado = useMutation({
    mutationFn: async (p: any) => (await apiClient.post(`pms/booking-payments/${p.id}/mark-failed/`, {
      reason: 'Pagamento não concretizado pelo hóspede.',
    })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pms', 'booking-payments'] }),
    onError: notifyError,
  });

  const porReceber = pagamentos
    .filter((p: any) => p.status === 'PENDING')
    .reduce((t: number, p: any) => t + Number(p.amount || 0), 0);

  return (
    <ClassicWindow title="Depósitos de reservas online" icon={<Wallet size={14} className="text-gray-300" />}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-gray-600">
            Confirmar um depósito lança-o como pagamento na conta do hóspede — no check-in, ou já se
            ele estiver hospedado.
          </span>
          <button className={btn} onClick={() => refetch()}>
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />Actualizar</button>
        </div>}>
      <div className="p-4 space-y-3 bg-[#F3F4F6] h-full overflow-auto">
        <div className="bg-white border border-[#D7DBDF] rounded-[10px] p-3 flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-2">Mostrar
            <select className="border border-[#D7DBDF] rounded-[6px] px-2 py-1" value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}>
              <option value="PENDING">Por receber</option>
              <option value="PAID">Já pagos</option>
              <option value="FAILED">Falhados</option>
              <option value="">Todos</option>
            </select>
          </label>
          {filtro === 'PENDING' && (
            <span className="text-[#B42318] font-bold">
              Por receber: {money(porReceber)} Kz · {pagamentos.length} reserva(s)
            </span>
          )}
        </div>

        <div className="bg-white border border-[#D7DBDF] rounded-[10px] overflow-hidden">
          <div className="grid grid-cols-[110px_1fr_100px_110px_1fr_150px] gap-2 px-3 py-1.5 bg-[#F3F4F6] border-b border-[#EBEEF0] text-[11px] font-bold text-[#6B7280]">
            <span>Reserva</span><span>Hóspede</span><span>Entrada</span><span>Valor</span>
            <span>Situação</span><span>Confirmar entrada</span>
          </div>
          {pagamentos.map((p: any) => (
            <div key={p.id} className="grid grid-cols-[110px_1fr_100px_110px_1fr_150px] gap-2 px-3 py-2 border-b border-[#EBEEF0] items-center text-[12px]">
              <span className="font-mono text-[#6B7280]">{p.confirmation}</span>
              <span className="font-bold">{p.guest_name || '—'}</span>
              <span>{p.check_in ? new Date(p.check_in).toLocaleDateString('pt-PT') : '—'}</span>
              <span className="font-bold">{money(p.amount)} {p.currency}</span>
              <span>
                <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: ST_COLOR[p.status] }}>
                  {p.status_display}</span>
                <span className="block text-[10px] text-gray-500 mt-0.5" title={p.message || ''}>
                  {p.status === 'PAID'
                    ? `${p.method_display}${p.reference ? ' · ' + p.reference : ''}${p.confirmed_by ? ' · por ' + p.confirmed_by : ''}`
                    : (p.message || '')}
                  {p.status === 'PAID' && !p.posted_to_folio && ' · por lançar na conta'}
                </span>
              </span>
              {p.status === 'PENDING' ? (
                <span className="flex flex-col gap-1">
                  <span className="flex gap-1">
                    <select className="border border-[#D7DBDF] rounded-[6px] px-1 py-0.5 text-[11px] flex-1"
                            value={metodo[p.id] || 'TRANSFER'}
                            onChange={(e) => setMetodo({ ...metodo, [p.id]: e.target.value })}>
                      {METODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </span>
                  <input className="border border-[#D7DBDF] rounded-[6px] px-1 py-0.5 text-[11px]"
                         placeholder="Referência" value={refer[p.id] || ''}
                         onChange={(e) => setRefer({ ...refer, [p.id]: e.target.value })} />
                  <span className="flex gap-1">
                    <button className="text-[11px] text-[#1A1D21] hover:underline inline-flex items-center gap-0.5"
                            onClick={async () => {
                              if (await confirmar(
                                `Confirma que entraram ${money(p.amount)} ${p.currency} da reserva ${p.confirmation}?`,
                                'Confirmar depósito')) confirmarPagamento.mutate(p);
                            }}><CheckCircle2 size={12} />Recebido</button>
                    <button className="text-[11px] text-[#B42318] hover:underline inline-flex items-center gap-0.5"
                            onClick={() => marcarFalhado.mutate(p)}><XCircle size={12} />Falhou</button>
                  </span>
                </span>
              ) : (
                <span className="text-gray-400 text-[11px]">
                  {p.paid_at ? new Date(p.paid_at).toLocaleString('pt-PT') : '—'}
                </span>
              )}
            </div>
          ))}
          {pagamentos.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-gray-500">
              {filtro === 'PENDING'
                ? 'Nenhum depósito por receber.'
                : 'Sem registos para este filtro.'}
            </div>
          )}
        </div>

        <div className="text-[11px] text-gray-500">
          Com os provedores reais (Multicaixa Express, EMIS, Stripe, PayPal) quem confirma um pagamento é
          o próprio gateway — essa ligação ainda não está credenciada nesta instalação, por isso os
          depósitos ficam aqui à espera de alguém confirmar que o dinheiro entrou. A percentagem do
          depósito define-se em <b>Booking Engine</b>.
        </div>
      </div>
    </ClassicWindow>
  );
}
