import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { useFnbEvents } from '../../../hooks/useFnb';

const EVENT_TYPES: Record<string, string> = {
  BANQUET: 'Banquete', WEDDING: 'Casamento', CONFERENCE: 'Conferência', COFFEE_BREAK: 'Coffee Break',
  COCKTAIL: 'Cocktail', BUFFET: 'Buffet', OTHER: 'Outro',
};
const STATUS: Record<string, string> = {
  INQUIRY: 'Pedido', CONFIRMED: 'Confirmado', IN_PROGRESS: 'Em curso', DONE: 'Concluído', CANCELLED: 'Cancelado',
};
const STATUS_TONE: Record<string, string> = {
  INQUIRY: 'text-gray-600', CONFIRMED: 'text-blue-700', IN_PROGRESS: 'text-amber-700', DONE: 'text-green-700', CANCELLED: 'text-red-600',
};
const AOA = (n: any) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kz';
const empty = { name: '', event_type: 'BANQUET', event_date: '', pax: '', location: '', estimated_value: '', contact_name: '', status: 'INQUIRY' };

export default function FnbEventsView() {
  const { query, create, update, remove } = useFnbEvents();
  const events = query.data ?? [];
  const [f, setF] = useState<any>(empty);

  const add = () => {
    if (!f.name || !f.event_date) return;
    create.mutate({ ...f, pax: Number(f.pax) || 0, estimated_value: Number(f.estimated_value) || 0 }, { onSuccess: () => setF(empty) });
  };

  return (
    <ClassicWindow
      title="Eventos & Banquetes (BEO)"
      icon={<CalendarClock size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Eventos: {events.length} · Valor estimado: {AOA(events.reduce((s: number, e: any) => s + Number(e.estimated_value || 0), 0))}</div>}
    >
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Nome do evento" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input type="number" placeholder="Pax" value={f.pax} onChange={(e) => setF({ ...f, pax: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <input placeholder="Local" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <input type="number" placeholder="Valor est." value={f.estimated_value} onChange={(e) => setF({ ...f, estimated_value: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <input placeholder="Contacto" value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <ClassicButton icon={Plus} label="Registar Evento" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id" data={events}
            columns={[
              { header: 'Data', accessor: 'event_date', width: '11%' },
              { header: 'Evento', accessor: 'name', width: '22%' },
              { header: 'Tipo', accessor: (r: any) => EVENT_TYPES[r.event_type] || r.event_type, width: '13%' },
              { header: 'Pax', accessor: 'pax', width: '6%' },
              { header: 'Local', accessor: 'location', width: '14%' },
              { header: 'Valor', accessor: (r: any) => AOA(r.estimated_value), width: '13%' },
              { header: 'Estado', accessor: (r: any) => (
                <select value={r.status} onClick={(e) => e.stopPropagation()} onChange={(e) => update.mutate({ id: r.id, data: { status: e.target.value } })}
                  className={`bg-transparent border-none text-[11px] font-bold ${STATUS_TONE[r.status]}`}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              ), width: '13%' },
              { header: '', accessor: (r: any) => <button onClick={() => { if (confirm(`Apagar o evento ${r.name}?`)) remove.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
