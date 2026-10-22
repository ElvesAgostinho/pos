import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, User, Plus } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import EntityEditor from '../posconfig/EntityEditor';
import PmsShowFreeRoomsDialog from './PmsShowFreeRoomsDialog';

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
      <div className="w-[520px] bg-[#EEF1F5] border border-[#E6E8EC] shadow-xl rounded-[16px] overflow-hidden">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#2563EB' }}>
          Check-In
          <button onClick={onClose} title="Fechar"
            className="w-6 h-6 rounded-[8px] flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 text-[12px] flex flex-col gap-3">
          <div className="flex items-center justify-between border border-[#E6E8EC] bg-white p-2">
            <div>
              <div className="font-bold text-[15px]">{reservation.confirmation}</div>
              <div>{reservation.guest_name}</div>
            </div>
            <button onClick={() => setEditingGuest(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#EEF1F5] border border-[#E6E8EC] hover:bg-[#EEF1F5] font-semibold">
              <User size={13} /> Editar Hóspede
            </button>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-[70px]">Quarto:</span>
            <input readOnly value={room ? room.number : ''} className="border border-[#E6E8EC] p-1.5 bg-white flex-1" />
            <button onClick={() => setShowRoomPicker(true)} title="Mostrar quartos livres"
              className="w-7 h-7 rounded-full flex items-center justify-center bg-[#FFFFFF] border-b border-[#E6E8EC] text-[#111827]"><Plus size={14} /></button>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={allowDirty} onChange={(e) => setAllowDirty(e.target.checked)} /> Permitir mesmo se quarto estiver sujo
          </label>
          {/* "Estado de inspeção do quarto" removido de propósito: o Room deste
              PMS só tem 2 estados de limpeza (Limpo/Sujo, ver Room.STATUS em
              pms/models.py) — não existe um 3º estado "inspecionado" para
              overridar aqui. Adicionar essa tri-estado exigiria um novo campo
              no modelo Room partilhado por todo o PMS, fora de alcance desta
              auditoria pontual. */}
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 bg-[#EEF1F5] border-t border-[#E6E8EC]">
          <button onClick={doCheckIn} disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold text-[#111827] disabled:opacity-50">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: '#3B82F6' }}>✓</span>
            {saving ? 'A processar…' : 'Check-In'}
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#111827] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#DC2626] text-white"><X size={9} strokeWidth={3} /></span>
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
