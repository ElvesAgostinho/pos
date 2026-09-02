import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, X, Hand } from 'lucide-react';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import ClassicGrid from '../ui/ClassicGrid';

const naoConstruido = (label: string) => aviso(`"${label}" ainda não está construído nesta fase do PMS.`);

/** "Mostrar quartos livres" — usado a partir do "+" ao lado de Quarto, na Nova
 * Reserva. Cruza o inventário real (`pms.Room`) com as reservas vivas no
 * período (`pms/rooms/free/`) — não é uma lista estática. */
export default function PmsShowFreeRoomsDialog({ roomTypes, dateFrom, dateTo, roomType, onClose, onSelect }: {
  roomTypes: any[]; dateFrom: string; dateTo: string; roomType: string;
  onClose: () => void; onSelect: (room: any) => void;
}) {
  const [de, setDe] = useState(dateFrom);
  const [ate, setAte] = useState(dateTo);
  const [cat, setCat] = useState(roomType);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<number | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['pms', 'rooms', 'free', de, ate, cat],
    queryFn: async () => (await apiClient.get('pms/rooms/free/', {
      params: { date_from: de, date_to: ate, room_type: cat || undefined },
    })).data,
  });
  const rows = (Array.isArray(data) ? data : []).filter((r: any) => r.is_free
    && (!q || r.number.toLowerCase().includes(q.toLowerCase())));
  const sel = rows.find((r: any) => r.id === selId);

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[1000px] max-h-[75vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
          Mostrar quartos livres
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-2 bg-white border-b border-[#d0d0d0] flex flex-wrap items-end gap-3 text-[12px]">
          <label className="flex flex-col gap-0.5">De:
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white" />
          </label>
          <label className="flex flex-col gap-0.5">Até:
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white" />
          </label>
          <label className="flex flex-col gap-0.5">Categoria:
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white min-w-[160px]">
              <option value="">(Todas)</option>
              {roomTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-gray-400 cursor-not-allowed" title="Ainda não está construído nesta fase do PMS."
            onClick={() => naoConstruido('Atributos')}>
            <input type="checkbox" disabled /> Atributos
          </label>
          <label className="flex flex-col gap-0.5 flex-1 min-w-[140px]">Pesquisar:
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº do quarto…" className="border border-[#a0a0a0] p-1 bg-white" />
          </label>
          <button onClick={() => refetch()}
            className="w-[130px] flex-shrink-0 flex items-center justify-center gap-2 text-white font-bold text-[13px] py-2"
            style={{ background: '#2b2b2b' }}>
            <RefreshCw size={16} /> Pesquisar
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          {isFetching ? <div className="p-4 text-gray-400 text-[12px]">A carregar…</div> : (
            <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined}
              onRowClick={(r: any) => setSelId(r.id)} onRowDoubleClick={(r: any) => onSelect(r)}
              columns={[
                { header: 'Categoria', accessor: 'room_type_code', width: '10%' },
                { header: 'Quarto', accessor: 'number', width: '10%' },
                { header: 'Camas Extra', accessor: () => '—', width: '10%' },
                { header: 'C.O. Esperado hoje', accessor: () => '—', width: '13%' },
                { header: 'Próxima Reserva', accessor: (r: any) => r.next_reservation || '—', width: '13%' },
                { header: 'LIMPO', accessor: (r: any) => r.status === 'VACANT_CLEAN' ? '✔' : '', width: '8%' },
                { header: 'Inspeccionado', accessor: () => '', width: '10%' },
                { header: 'Fumador', accessor: () => '', width: '8%' },
                { header: 'Alérgico', accessor: () => '', width: '8%' },
                { header: 'Mobilidade reduzida', accessor: () => '', width: '10%' },
              ]} />
          )}
        </div>
        <div className="flex justify-between items-center px-3 py-1.5 bg-[#e8e8e8] border-t border-[#c0c0c0]">
          <button disabled={!sel} onClick={() => sel && onSelect(sel)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] disabled:text-gray-400 hover:text-black disabled:hover:text-gray-400">
            <Hand size={13} /> Selecionar
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white">
              <X size={9} strokeWidth={3} />
            </span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
