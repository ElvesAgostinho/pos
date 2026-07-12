import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { BedDouble, Plus, LogIn, LogOut, X } from 'lucide-react';
import { useReservations, useCreateReservation, useCheckIn, useCheckOut, useCancelReservation, useGuests, useRoomTypes, useRooms } from '../../hooks/usePms';

const ST: Record<string, string> = {
  BOOKED: 'text-[#1e3f66] font-bold', CHECKED_IN: 'text-green-700 font-bold',
  CHECKED_OUT: 'text-gray-500', CANCELLED: 'text-red-600', NO_SHOW: 'text-orange-600',
};

export default function ReservationsView() {
  const { data: reservations = [] } = useReservations();
  const { data: guests = [] } = useGuests();
  const { data: roomTypes = [] } = useRoomTypes();
  const { data: rooms = [] } = useRooms();
  const create = useCreateReservation();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const cancel = useCancelReservation();
  const empty = { guest: '', room_type: '', check_in: '', check_out: '', rate: '' };
  const [draft, setDraft] = useState<any>(empty);

  const add = () => {
    if (!draft.guest || !draft.room_type || !draft.check_in || !draft.check_out) { alert('Preencha hóspede, tipo de quarto e datas.'); return; }
    create.mutate({ guest: Number(draft.guest), room_type: Number(draft.room_type), check_in: draft.check_in, check_out: draft.check_out, rate: draft.rate || 0 },
      { onSuccess: () => setDraft(empty), onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data || e.message)) });
  };

  const doCheckIn = (r: any) => {
    const free = rooms.filter((x: any) => x.status === 'VACANT_CLEAN' && x.room_type === r.room_type);
    const roomId = free[0]?.id;
    if (!roomId) { alert('Sem quartos livres/limpos deste tipo.'); return; }
    checkIn.mutate({ id: r.id, room: roomId }, { onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data)) });
  };
  const doCheckOut = (r: any) => checkOut.mutate(r.id, { onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data?.detail || e.message)) });

  return (
    <ClassicWindow title="Reservas (PMS)" icon={<BedDouble size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{reservations.length} reserva(s) · check-in atribui quarto livre e abre folio</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <select value={draft.guest} onChange={(e) => setDraft({ ...draft, guest: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— hóspede —</option>{guests.map((g: any) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
          </select>
          <select value={draft.room_type} onChange={(e) => setDraft({ ...draft, room_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— tipo de quarto —</option>{roomTypes.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="text-gray-600">Entrada<input type="date" value={draft.check_in} onChange={(e) => setDraft({ ...draft, check_in: e.target.value })} className="border border-[#a0a0a0] p-1 ml-1" /></label>
          <label className="text-gray-600">Saída<input type="date" value={draft.check_out} onChange={(e) => setDraft({ ...draft, check_out: e.target.value })} className="border border-[#a0a0a0] p-1 ml-1" /></label>
          <input placeholder="Diária" type="number" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <ClassicButton icon={Plus} label="Nova Reserva" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={reservations}
            columns={[
              { header: 'Confirmação', accessor: 'confirmation', width: '13%' },
              { header: 'Hóspede', accessor: 'guest_name', width: '18%' },
              { header: 'Tipo', accessor: 'room_type_name', width: '13%' },
              { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '8%' },
              { header: 'Entrada', accessor: 'check_in', width: '11%' },
              { header: 'Saída', accessor: 'check_out', width: '11%' },
              { header: 'Estado', accessor: (r: any) => <span className={ST[r.status] || ''}>{r.status_display}</span>, width: '12%' },
              { header: 'Ações', accessor: (r: any) => (
                <div className="flex gap-2">
                  {r.status === 'BOOKED' && <button title="Check-in" onClick={() => doCheckIn(r)} className="text-green-700 hover:text-green-900"><LogIn size={13} /></button>}
                  {r.status === 'CHECKED_IN' && <button title="Check-out" onClick={() => doCheckOut(r)} className="text-[#1e3f66] hover:text-[#16304a]"><LogOut size={13} /></button>}
                  {['BOOKED', 'CHECKED_IN'].includes(r.status) && <button title="Cancelar" onClick={() => cancel.mutate(r.id)} className="text-red-600 hover:text-red-800"><X size={13} /></button>}
                </div>), width: '14%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
