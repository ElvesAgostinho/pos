import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import ClassicButton from '../ui/ClassicButton';

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
      <div className="w-[520px] max-h-[70vh] bg-[#f0f0f0] border border-[#8fa4bb] shadow-xl flex flex-col">
        <div className="h-8 flex items-center justify-between px-3 text-white text-[12px] font-bold" style={{ background: 'linear-gradient(to bottom, #2a5488, #183453)' }}>
          {mode === 'assign' ? 'Atribuição Rápida de Quartos' : 'Mudança de Quarto'}
          <button onClick={onClose} className="text-white/80 hover:text-white">×</button>
        </div>
        <div className="px-3 py-2 text-[11px] bg-white border-b border-[#d0d0d0]">
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
                    r.status === 'VACANT_CLEAN' ? 'bg-[#eafaf0] border-[#8fce9e] hover:bg-[#d5f5e0]'
                    : r.status === 'VACANT_DIRTY' ? 'bg-[#fff7e6] border-[#e0c080] hover:bg-[#ffedc0]'
                    : 'bg-[#f0f0f0] border-[#c0c0c0] text-gray-400 cursor-not-allowed'}`}>
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
        <div className="flex justify-end gap-2 p-2 bg-[#e8e8e8] border-t border-[#c0c0c0]">
          <ClassicButton label="Fechar" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
