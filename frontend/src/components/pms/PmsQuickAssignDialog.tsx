import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import ClassicGrid from '../ui/ClassicGrid';

/** "Atribuição rápida de quartos" — 1) escolhe uma reserva sem quarto à esquerda,
 * 2) escolhe um quarto livre dessa categoria à direita, 3) atribui logo (sem
 * confirmação extra, tal como no PMS de referência). */
export default function PmsQuickAssignDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [selResId, setSelResId] = useState<number | null>(null);

  const { data: reservas, refetch: refetchRes } = useQuery({
    queryKey: ['pms', 'reservations', 'no-room'],
    queryFn: async () => (await apiClient.get('pms/reservations/', {
      params: { no_room: '1' },
    })).data,
  });
  const resRows = (Array.isArray(reservas) ? reservas : reservas?.results || [])
    .filter((r: any) => r.status !== 'CHECKED_OUT' && r.status !== 'CANCELLED');
  const selRes = resRows.find((r: any) => r.id === selResId);

  const { data: rooms, refetch: refetchRooms } = useQuery({
    queryKey: ['pms', 'rooms', 'free', selRes?.room_type, selRes?.check_in, selRes?.check_out],
    queryFn: async () => (await apiClient.get('pms/rooms/free/', {
      params: { room_type: selRes.room_type, date_from: selRes.check_in, date_to: selRes.check_out },
    })).data,
    enabled: !!selRes,
  });
  const roomRows = (Array.isArray(rooms) ? rooms : []).filter((r: any) => r.is_free);

  const atribuir = async (roomId: number) => {
    if (!selRes) return;
    try {
      await apiClient.post('pms/reservations/quick-assign/', { reservation: selRes.id, room: roomId });
      qc.invalidateQueries({ queryKey: ['pms'] });
      setSelResId(null);
      refetchRes();
      refetchRooms();
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[1100px] max-h-[80vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
          Atribuição rápida de quartos
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden bg-white">
          <div className="w-1/2 overflow-auto border-r border-[#c0c0c0]">
            <ClassicGrid rowKey="id" data={resRows} selectedRowId={selResId ?? undefined}
              onRowClick={(r: any) => setSelResId(r.id)}
              columns={[
                { header: 'Reserva', accessor: 'confirmation', width: '16%' },
                { header: 'Check-In', accessor: 'check_in', width: '13%' },
                { header: 'Check-Out', accessor: 'check_out', width: '13%' },
                { header: 'Pax', accessor: (r: any) => (r.adults || 0) + (r.children || 0), width: '8%' },
                { header: 'Hóspede', accessor: 'guest_name', width: '20%' },
                { header: 'Grupo', accessor: (r: any) => r.block_code || '—', width: '12%' },
                { header: 'Categoria', accessor: 'room_type_name', width: '18%' },
              ]} />
          </div>
          <div className="w-1/2 overflow-auto">
            {!selRes ? (
              <div className="p-6 text-center text-gray-400 text-[12px]">Escolha uma reserva à esquerda para ver os quartos livres.</div>
            ) : (
              <ClassicGrid rowKey="id" data={roomRows} onRowClick={(r: any) => atribuir(r.id)}
                columns={[
                  { header: 'Quarto', accessor: 'number', width: '20%' },
                  { header: 'Categoria', accessor: 'room_type_code', width: '25%' },
                  { header: 'Andar', accessor: () => '—', width: '20%' },
                  { header: 'LIMPO', accessor: (r: any) => r.status === 'VACANT_CLEAN' ? '✔' : '', width: '17%' },
                  { header: 'Inspeccionado', accessor: () => '', width: '18%' },
                ]} />
            )}
          </div>
        </div>
        <div className="flex items-stretch gap-3 px-3 py-2 bg-[#e8e8e8] border-t border-[#c0c0c0] text-[11px] flex-shrink-0">
          <label className="flex flex-col gap-0.5 flex-1">Reservation info:
            <textarea readOnly rows={2} className="border border-[#a0a0a0] p-1 bg-white resize-none"
              value={selRes ? `${selRes.confirmation} · ${selRes.guest_name} · ${selRes.room_type_name} · ${selRes.check_in} → ${selRes.check_out}` : ''} />
          </label>
          <div className="text-[#555]">
            <b>Instructions:</b>
            <div>1) Select one reservation from the left panel</div>
            <div>2) Select the desired room from the right panel</div>
            <div>3) The room will be assigned to the reservation immediately</div>
          </div>
          <button onClick={onClose} className="flex items-start gap-1.5 font-semibold text-[#333] hover:text-black flex-shrink-0">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white flex-shrink-0">
              <X size={9} strokeWidth={3} />
            </span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
