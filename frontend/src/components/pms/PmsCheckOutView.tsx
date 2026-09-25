import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar } from '../../ui/dialogo';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';

/** Check-Out avulso — pesquisa uma reserva em check-in, mostra o folio
    (saldo/lançamentos), obriga a liquidar antes de fechar a conta e faz o
    check-out (ReservationViewSet.check_out já existente: fecha o folio e
    liberta o quarto para VACANT_DIRTY). */
export default function PmsCheckOutView() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['pms', 'reservations', 'checkout-search', q],
    queryFn: async () => (await apiClient.get('pms/reservations/', {
      params: { status: 'CHECKED_IN', q: q || undefined },
    })).data,
  });
  const rows: any[] = Array.isArray(data) ? data : data?.results || [];
  const selRow = rows.find((r) => r.id === selId);

  const { data: folio, refetch: refetchFolio } = useQuery({
    queryKey: ['pms', 'folio', 'for-reservation', selId],
    queryFn: async () => {
      const res = (await apiClient.get(`pms/reservations/${selId}/`)).data;
      if (!res.folio_id) return null;
      return (await apiClient.get(`pms/folios/${res.folio_id}/`)).data;
    },
    enabled: !!selId,
  });

  const invalidate = () => { refetch(); refetchFolio(); qc.invalidateQueries({ queryKey: ['pms'] }); };

  const settle = async () => {
    if (!folio) return;
    if (!(await confirmar(`Registar pagamento de ${folio.balance}?`))) return;
    setBusy(true);
    try { await apiClient.post(`pms/folios/${folio.id}/settle/`, {}); invalidate(); }
    catch (e) { notifyError(e); } finally { setBusy(false); }
  };

  const doCheckOut = async () => {
    if (!selId) return;
    if (!(await confirmar(`Confirmar Check-Out de ${selRow?.guest_name} (Quarto ${selRow?.room_number || '—'})?`))) return;
    setBusy(true);
    try {
      await apiClient.post(`pms/reservations/${selId}/check_out/`, {});
      aviso('Check-out efetuado. Quarto libertado para limpeza.');
      setSelId(null);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] });
    } catch (e) { notifyError(e); } finally { setBusy(false); }
  };

  const balancePending = !!folio && Number(folio.balance) !== 0;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[420px] flex-shrink-0 border-r border-[#EEF4F5] flex flex-col">
          <div className="p-2 border-b border-[#EEF4F5]">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por hóspede, quarto ou confirmação…"
              className="w-full border border-[#7FA9B1] p-1.5 text-[12px]" />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" selectedRowId={selId ?? undefined} data={rows} onRowClick={(r: any) => setSelId(r.id)} columns={[
              { header: 'Confirmação', accessor: 'confirmation', width: '25%' },
              { header: 'Hóspede', accessor: 'guest_name', width: '40%' },
              { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '15%' },
              { header: 'Saldo', accessor: 'folio_balance', width: '20%' },
            ]} />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!selId ? (
            <div className="text-center text-gray-400 py-10 text-[12px]">Escolha uma reserva em check-in à esquerda.</div>
          ) : !folio ? (
            <div className="text-center text-gray-400 py-10 text-[12px]">Esta reserva não tem conta aberta — pode seguir para o check-out.</div>
          ) : (
            <>
              <div className="mb-3">
                <div className="font-bold text-[15px]">{selRow?.guest_name}</div>
                <div className="text-[11px] text-[#5C8891]">
                  Quarto {selRow?.room_number || '—'} · {selRow?.confirmation} · {selRow?.check_in} → {selRow?.check_out}
                </div>
              </div>
              <div className="flex items-center justify-between border border-[#CFE3E6] px-3 py-2 mb-3">
                <span className="text-[12px]">{folio.label} · {folio.status_display}</span>
                <span className={`font-bold text-[16px] ${balancePending ? 'text-[#B0392B]' : 'text-[#062A31]'}`}>Saldo: {folio.balance}</span>
              </div>
              {balancePending && (
                <div className="text-[11px] text-[#8C2B1F] bg-[#FDECEA] border border-[#B0392B] px-2 py-1.5 mb-3">
                  Conta por liquidar — registe o pagamento antes de fazer o check-out.
                </div>
              )}
              <div style={{ height: 260 }}>
                <ClassicGrid rowKey="id" data={folio.charges || []} columns={[
                  { header: 'Data', accessor: (r: any) => new Date(r.created_at).toLocaleString('pt-PT'), width: '25%' },
                  { header: 'Tipo', accessor: 'charge_type_display', width: '20%' },
                  { header: 'Descrição', accessor: (r: any) => r.is_void ? <span className="line-through text-gray-400">{r.description}</span> : r.description, width: '35%' },
                  { header: 'Valor', accessor: 'amount', width: '20%' },
                ]} />
              </div>
            </>
          )}
        </div>
      </div>

      <Toolbar actions={[
        { label: 'Atualizar', icon: '⟳', color: '#062A31', onClick: invalidate },
        { label: 'Registar Pagamento', icon: '💳', color: '#062A31', onClick: settle, disabled: !balancePending || busy },
        { label: 'Check-Out', icon: '✔', color: '#062A31', onClick: doCheckOut, disabled: !selId || balancePending || busy },
      ]} />
    </div>
  );
}
