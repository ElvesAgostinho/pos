import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, X, Hand } from 'lucide-react';
import { apiClient } from '../../api/client';
import ClassicGrid from '../ui/ClassicGrid';


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
  const [atribSel, setAtribSel] = useState<number[]>([]);

  // As características são as deste hotel (pms.RoomAttribute) — não uma lista
  // escrita no código: cada propriedade define as suas.
  const { data: atributos = [] } = useQuery({
    queryKey: ['pms', 'room-attributes'],
    queryFn: async () => {
      try {
        const r = await apiClient.get('pms/room-attributes/', { params: { active: 1 } });
        return (r.data?.results || r.data || []) as any[];
      } catch { return []; }
    },
  });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['pms', 'rooms', 'free', de, ate, cat, atribSel.join(',')],
    queryFn: async () => (await apiClient.get('pms/rooms/free/', {
      params: {
        date_from: de, date_to: ate, room_type: cat || undefined,
        attributes: atribSel.length ? atribSel.join(',') : undefined,
      },
    })).data,
  });
  const rows = (Array.isArray(data) ? data : []).filter((r: any) => r.is_free
    && (!q || r.number.toLowerCase().includes(q.toLowerCase())));
  const sel = rows.find((r: any) => r.id === selId);

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[1000px] max-h-[75vh] bg-[#F3F4F6] border border-[#D7DBDF] shadow-xl rounded-[16px] overflow-hidden flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#17375E' }}>
          Mostrar quartos livres
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B42318] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-2 bg-white border-b border-[#EBEEF0] flex flex-wrap items-end gap-3 text-[12px]">
          <label className="flex flex-col gap-0.5">De:
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="border border-[#D7DBDF] p-1 bg-white" />
          </label>
          <label className="flex flex-col gap-0.5">Até:
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="border border-[#D7DBDF] p-1 bg-white" />
          </label>
          <label className="flex flex-col gap-0.5">Categoria:
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="border border-[#D7DBDF] p-1 bg-white min-w-[160px]">
              <option value="">(Todas)</option>
              {roomTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </label>
          {/* ATRIBUTOS — "um com varanda e vista mar". O servidor exige TODAS as
              marcadas (e não uma qualquer delas), que é o que a recepção quer
              quando o hóspede pede duas coisas ao mesmo tempo. */}
          {atributos.length > 0 && (
            <div className="flex flex-col gap-0.5 min-w-[180px]">
              <span>Atributos:</span>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 border border-[#D7DBDF] bg-white p-1 max-h-[58px] overflow-auto">
                {atributos.map((a: any) => (
                  <label key={a.id} className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                    <input type="checkbox" checked={atribSel.includes(a.id)}
                      onChange={(e) => setAtribSel(e.target.checked
                        ? [...atribSel, a.id] : atribSel.filter((x) => x !== a.id))} />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="flex flex-col gap-0.5 flex-1 min-w-[140px]">Pesquisar:
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº do quarto…" className="border border-[#D7DBDF] p-1 bg-white" />
          </label>
          <button onClick={() => refetch()}
            className="w-[130px] flex-shrink-0 flex items-center justify-center gap-2 text-white font-bold text-[13px] py-2"
            style={{ background: '#17375E' }}>
            <RefreshCw size={16} /> Pesquisar
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          {isFetching ? <div className="p-4 text-gray-400 text-[12px]">A carregar…</div> : (
            <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined}
              onRowClick={(r: any) => setSelId(r.id)} onRowDoubleClick={(r: any) => onSelect(r)}
              // As colunas "Camas Extra", "C.O. Esperado hoje", "Inspeccionado",
              // "Fumador", "Alérgico" e "Mobilidade reduzida" saíram daqui: vinham
              // todas vazias por construção (um `() => ''`), o que é pior do que
              // não as ter — uma coluna "Fumador" sempre em branco faz parecer que
              // nenhum quarto é de fumadores. O que elas queriam dizer é agora uma
              // coisa só e real: as CARACTERÍSTICAS do quarto (pms.RoomAttribute),
              // que o hotel define e pelas quais se pode filtrar aqui em cima.
              columns={[
                { header: 'Categoria', accessor: 'room_type_code', width: '10%' },
                { header: 'Quarto', accessor: 'number', width: '8%' },
                { header: 'Estado', accessor: (r: any) => r.status_display, width: '14%' },
                { header: 'Características',
                  accessor: (r: any) => (r.attributes || []).join(' · ') || '—', width: '38%' },
                { header: 'Próxima Reserva', accessor: (r: any) => r.next_reservation || '—', width: '16%' },
                { header: 'LIMPO', accessor: (r: any) => r.status === 'VACANT_CLEAN' ? '✔' : '', width: '8%' },
              ]} />
          )}
        </div>
        <div className="flex justify-between items-center px-3 py-1.5 bg-[#F3F4F6] border-t border-[#D7DBDF]">
          <button disabled={!sel} onClick={() => sel && onSelect(sel)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1A1D21] disabled:text-gray-400 hover:text-black disabled:hover:text-gray-400">
            <Hand size={13} /> Selecionar
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1A1D21] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B42318] text-white">
              <X size={9} strokeWidth={3} />
            </span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
