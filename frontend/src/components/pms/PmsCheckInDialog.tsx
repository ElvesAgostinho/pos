import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, User, Plus } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import EntityEditor from '../posconfig/EntityEditor';
import PmsShowFreeRoomsDialog from './PmsShowFreeRoomsDialog';

const naoConstruido = (label: string) => aviso(`"${label}" ainda não está construído nesta fase do PMS.`);

/** Check-In — igual ao popup do PMS de referência: escolher/confirmar o
 * quarto (com o mesmo "Mostrar quartos livres" que a Nova Reserva já usa) e
 * editar a ficha do hóspede sem sair daqui (o MESMO editor do POS, "Nova
 * entidade" — não um formulário novo). */
export default function PmsCheckInDialog({ reservation, onClose, onDone }: {
  reservation: any; onClose: () => void; onDone: () => void;
}) {
  const [room, setRoom] = useState<any>(reservation.room_number ? { id: reservation.room, number: reservation.room_number } : null);
  const [allowDirty, setAllowDirty] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [editingGuest, setEditingGuest] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: roomTypes } = useQuery({ queryKey: ['pms', 'room-types'], queryFn: async () => (await apiClient.get('pms/room-types/')).data });
  const rtList = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];
  const { data: guest } = useQuery({
    queryKey: ['pos', 'entities', reservation.guest],
    queryFn: async () => (await apiClient.get(`pos/marketing/entities/${reservation.guest}/`)).data,
    enabled: editingGuest,
  });

  const doCheckIn = async () => {
    if (!room) { aviso('Escolha um quarto (use o "+").'); return; }
    setSaving(true);
    try {
      await apiClient.post(`pms/reservations/${reservation.id}/check_in/`, { room: room.id, allow_dirty: allowDirty });
      onDone();
    } catch (e) { notifyError(e); } finally { setSaving(false); }
  };

  if (editingGuest) {
    if (!guest) return null;
    return <EntityEditor entity={guest} onClose={() => setEditingGuest(false)} onSaved={() => setEditingGuest(false)} />;
  }

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[520px] bg-[#F7FAFA] border border-[#5C8891] shadow-xl">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#041F24' }}>
          Check-In
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 text-[12px] flex flex-col gap-3">
          <div className="flex items-center justify-between border border-[#CFE3E6] bg-white p-2">
            <div>
              <div className="font-bold text-[15px]">{reservation.confirmation}</div>
              <div>{reservation.guest_name}</div>
            </div>
            <button onClick={() => setEditingGuest(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#F7FAFA] border border-[#CFE3E6] hover:bg-[#F7FAFA] font-semibold">
              <User size={13} /> Editar Hóspede
            </button>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-[70px]">Quarto:</span>
            <input readOnly value={room ? room.number : ''} className="border border-[#7FA9B1] p-1.5 bg-white flex-1" />
            <button onClick={() => setShowRoomPicker(true)} title="Mostrar quartos livres"
              className="w-7 h-7 rounded-full flex items-center justify-center bg-[#041F24] text-white"><Plus size={14} /></button>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={allowDirty} onChange={(e) => setAllowDirty(e.target.checked)} /> Permitir mesmo se quarto estiver sujo
          </label>
          <label className="flex items-center gap-1.5 text-gray-400 cursor-not-allowed" title="Ainda não está construído nesta fase do PMS." onClick={() => naoConstruido('Estado de inspeção do quarto')}>
            <input type="checkbox" disabled /> Permitir mesmo se quarto estiver não inspeccionado
          </label>
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 bg-[#F7FAFA] border-t border-[#CFE3E6]">
          <button onClick={doCheckIn} disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold text-[#041F24] disabled:opacity-50">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: '#5C8891' }}>✓</span>
            {saving ? 'A processar…' : 'Check-In'}
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#041F24] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B0392B] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>

      {showRoomPicker && (
        <PmsShowFreeRoomsDialog roomTypes={rtList} dateFrom={reservation.check_in} dateTo={reservation.check_out} roomType={String(reservation.room_type)}
          onClose={() => setShowRoomPicker(false)} onSelect={(r) => { setRoom(r); setShowRoomPicker(false); }} />
      )}
    </div>
  );
}
