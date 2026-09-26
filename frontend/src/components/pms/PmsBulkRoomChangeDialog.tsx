import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Check } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

function RoomSelect({ reservation, value, onChange }: { reservation: any; value: string; onChange: (v: string) => void }) {
  const { data } = useQuery({
    queryKey: ['pms', 'rooms', 'free', reservation.room_type, reservation.check_in, reservation.check_out],
    queryFn: async () => (await apiClient.get('pms/rooms/free/', {
      params: { room_type: reservation.room_type, date_from: reservation.check_in, date_to: reservation.check_out },
    })).data,
  });
  const rows = (Array.isArray(data) ? data : []).filter((r: any) => r.is_free && r.id !== reservation.room);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-[#7FA9B1] p-1 bg-white w-full text-[11px]">
      <option value="">Escolha o quarto…</option>
      {rows.map((r: any) => <option key={r.id} value={r.id}>{r.number}</option>)}
    </select>
  );
}

/** "Mudanças de Quartos" — em massa: marca várias reservas (que já têm quarto)
 * e escolhe, linha a linha, para onde cada uma vai; um só botão move todas as
 * marcadas de uma vez (chama `pms/reservations/change-room/` por reserva). */
export default function PmsBulkRoomChangeDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ['pms', 'reservations', 'with-room'],
    queryFn: async () => (await apiClient.get('pms/reservations/')).data,
  });
  const rows = (Array.isArray(data) ? data : data?.results || [])
    .filter((r: any) => r.room_number && r.status !== 'CHECKED_OUT' && r.status !== 'CANCELLED');

  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState(false);

  const allChecked = rows.length > 0 && rows.every((r: any) => checked.has(r.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rows.map((r: any) => r.id)));
  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const aplicar = async () => {
    const alvo = rows.filter((r: any) => checked.has(r.id) && target[r.id]);
    if (!alvo.length) return;
    setApplying(true);
    try {
      for (const r of alvo) {
        await apiClient.post('pms/reservations/change-room/', { reservation: r.id, room: Number(target[r.id]) });
      }
      qc.invalidateQueries({ queryKey: ['pms'] });
      setChecked(new Set()); setTarget({});
      refetch();
    } catch (e) { notifyError(e); } finally { setApplying(false); }
  };

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[900px] max-h-[75vh] bg-[#F7FAFA] border border-[#5C8891] shadow-xl rounded-[16px] overflow-hidden flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#041F24' }}>
          Mudanças de Quartos
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <label className="flex items-center gap-2 px-3 py-1.5 bg-white border-b border-[#EEF4F5] text-[12px]">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} /> Selec. Todas
        </label>
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0" style={{ background: '#F7FAFA' }}>
              <tr>
                <th className="w-8 border-b border-[#CFE3E6]"></th>
                <th className="text-left px-2 py-1.5 border-b border-[#CFE3E6]">Hóspede</th>
                <th className="text-left px-2 py-1.5 border-b border-[#CFE3E6]">Check-In</th>
                <th className="text-left px-2 py-1.5 border-b border-[#CFE3E6]">Check-Out</th>
                <th className="text-left px-2 py-1.5 border-b border-[#CFE3E6]">Quarto Atual</th>
                <th className="text-left px-2 py-1.5 border-b border-[#CFE3E6]">Mudar para o quarto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-[#F7FAFA]">
                  <td className="text-center"><input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="px-2 py-1">{r.guest_name}</td>
                  <td className="px-2 py-1">{r.check_in}</td>
                  <td className="px-2 py-1">{r.check_out}</td>
                  <td className="px-2 py-1">{r.room_number}</td>
                  <td className="px-2 py-1">
                    <RoomSelect reservation={r} value={target[r.id] || ''} onChange={(v) => setTarget((t) => ({ ...t, [r.id]: v }))} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Sem reservas com quarto atribuído.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#F7FAFA] border-t border-[#CFE3E6]">
          <button onClick={aplicar} disabled={applying || ![...checked].some((id) => target[id])}
            className="flex items-center gap-2 text-[12px] font-semibold text-[#041F24] disabled:opacity-40 disabled:cursor-default hover:text-black">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0"
              style={{ background: applying ? '#7FA9B1' : '#5C8891' }}><Check size={13} /></span>
            {applying ? 'A aplicar…' : 'Efetuar a Mudança de Quarto para Reservas Selecionadas'}
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#041F24] hover:text-black flex-shrink-0">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B0392B] text-white">
              <X size={9} strokeWidth={3} />
            </span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
