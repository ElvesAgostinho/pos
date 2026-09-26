import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

interface Props {
  mode: 'assign' | 'change';
  reservation: any;
  onClose: () => void;
  onDone: () => void;
}

/** Atribuição Rápida de Quartos (sem quarto ainda) / Mudança de Quarto (já tem um). */
export default function PmsRoomPickerDialog({ mode, reservation, onClose, onDone }: Props) {
  const { data: rooms, isLoading } = useQuery({
    queryKey: ['pms', 'rooms', 'picker', reservation.room_type],
    queryFn: async () => (await apiClient.get('pms/rooms/', {
      params: { room_type: reservation.room_type },
    })).data,
  });
  const list = (Array.isArray(rooms) ? rooms : rooms?.results || [])
    .filter((r: any) => r.id !== reservation.room);

  const pick = async (roomId: number) => {
    try {
      const action = mode === 'assign' ? 'quick-assign' : 'change-room';
      await apiClient.post(`pms/reservations/${action}/`, { reservation: reservation.id, room: roomId });
      onDone();
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[520px] max-h-[70vh] bg-[#F7FAFA] border border-[#7FA9B1] shadow-xl flex flex-col">
        <div className="h-8 flex items-center justify-between px-3 text-white text-[12px] font-bold" style={{ background: 'linear-gradient(to bottom, #062A31, #041F24)' }}>
          {mode === 'assign' ? 'Atribuição Rápida de Quartos' : 'Mudança de Quarto'}
          <button onClick={onClose} className="text-white/80 hover:text-white">×</button>
        </div>
        <div className="px-3 py-2 text-[11px] bg-white border-b border-[#EEF4F5]">
          <b>{reservation.confirmation}</b> · {reservation.guest_name} · {reservation.room_type_name}
          {reservation.room_number && <> · quarto atual: <b>{reservation.room_number}</b></>}
        </div>
        <div className="flex-1 overflow-auto p-2">
          {isLoading ? <div className="text-gray-400 text-[11px]">A carregar quartos…</div> : (
            <div className="grid grid-cols-4 gap-2">
              {list.map((r: any) => (
                <button key={r.id} onClick={() => pick(r.id)}
                  disabled={r.status === 'OCCUPIED' || r.status === 'OOO'}
                  className={`p-2 border text-[11px] text-left ${
                    r.status === 'VACANT_CLEAN' ? 'bg-[#F7FAFA] border-[#CFE3E6] hover:bg-[#EEF4F5]'
                    : r.status === 'VACANT_DIRTY' ? 'bg-[#F7FAFA] border-[#CFE3E6] hover:bg-[#EEF4F5]'
                    : 'bg-[#F7FAFA] border-[#CFE3E6] text-gray-400 cursor-not-allowed'}`}>
                  <div className="font-bold">{r.number}</div>
                  <div className="text-[10px]">{r.status_display}</div>
                </button>
              ))}
              {!isLoading && list.length === 0 && (
                <div className="col-span-4 text-center text-gray-400 py-6">Sem quartos desta categoria.</div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-2 bg-[#F7FAFA] border-t border-[#CFE3E6]">
          <button onClick={onClose} className="px-2 py-1 text-[12px] text-[#041F24] border border-transparent hover:border-[#CFE3E6] hover:bg-[#F7FAFA] rounded-[6px]">Fechar</button>
        </div>
      </div>
    </div>
  );
}
