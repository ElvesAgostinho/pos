import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { CalendarClock, Plus, Armchair, X } from 'lucide-react';
import { usePosReservations, useCreatePosReservation, useSeatReservation, useCancelPosReservation, useOutlets, useTables } from '../../hooks/usePosMgmt';

const ST: Record<string, string> = { BOOKED: 'text-[#1e3f66] font-bold', SEATED: 'text-green-700 font-bold', CANCELLED: 'text-red-600', NO_SHOW: 'text-orange-600' };

export default function POSReservationsView() {
  const { data: outlets = [] } = useOutlets();
  const [outlet, setOutlet] = useState<number | undefined>();
  const { data: reservations = [] } = usePosReservations(outlet ? { outlet } : undefined);
  const { data: tables = [] } = useTables(outlet);
  const create = useCreatePosReservation();
  const seat = useSeatReservation();
  const cancel = useCancelPosReservation();
  const empty = { guest_name: '', phone: '', party_size: '2', reserved_for: '' };
  const [draft, setDraft] = useState<any>(empty);

  const add = () => {
    if (!outlet) { alert('Selecione um outlet.'); return; }
    if (!draft.guest_name || !draft.reserved_for) { alert('Preencha nome e data/hora.'); return; }
    create.mutate({ outlet, guest_name: draft.guest_name, phone: draft.phone, party_size: Number(draft.party_size) || 2, reserved_for: draft.reserved_for },
      { onSuccess: () => setDraft(empty), onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data)) });
  };
  const doSeat = (r: any) => {
    const free = tables.filter((t: any) => t.status === 'FREE');
    seat.mutate({ id: r.id, table: r.table || free[0]?.id }, { onError: (e: any) => alert(e?.response?.data?.detail || 'Erro') });
  };

  return (
    <ClassicWindow title="Reservas de Mesa (POS · Motor 3)" icon={<CalendarClock size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{reservations.length} reserva(s) · sentar ocupa a mesa</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <select value={outlet || ''} onChange={(e) => setOutlet(e.target.value ? Number(e.target.value) : undefined)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— outlet —</option>{outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <input placeholder="Nome" value={draft.guest_name} onChange={(e) => setDraft({ ...draft, guest_name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Telefone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <input placeholder="Pax" type="number" value={draft.party_size} onChange={(e) => setDraft({ ...draft, party_size: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <input type="datetime-local" value={draft.reserved_for} onChange={(e) => setDraft({ ...draft, reserved_for: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Reservar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={reservations}
            columns={[
              { header: 'Hóspede', accessor: 'guest_name', width: '22%' },
              { header: 'Pax', accessor: 'party_size', width: '8%' },
              { header: 'Para', accessor: (r: any) => new Date(r.reserved_for).toLocaleString('pt-PT'), width: '24%' },
              { header: 'Mesa', accessor: (r: any) => r.table_label || '—', width: '10%' },
              { header: 'Estado', accessor: (r: any) => <span className={ST[r.status] || ''}>{r.status_display}</span>, width: '16%' },
              { header: 'Ações', accessor: (r: any) => (
                <div className="flex gap-2">
                  {r.status === 'BOOKED' && <button title="Sentar" onClick={() => doSeat(r)} className="text-green-700 hover:text-green-900"><Armchair size={14} /></button>}
                  {r.status === 'BOOKED' && <button title="Cancelar" onClick={() => cancel.mutate({ id: r.id })} className="text-red-600 hover:text-red-800"><X size={13} /></button>}
                </div>), width: '20%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
