import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Toolbar, Glyph } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import PmsReservationDetailDialog from './PmsReservationDetailDialog';

/** Estado Hotel — painel do dia da receção: chegadas, saídas, ocupação e o
    mapa de quartos. Tudo a partir de GET pms/frontdesk/hotel-status/ (só
    leitura, agregado sobre Room/Reservation já existentes). */
const ROOM_STATUS_STYLE: Record<string, string> = {
  VACANT_CLEAN: 'bg-[#EAF6EC] border-[#4C8C5A] text-[#1F5C2C]',
  VACANT_DIRTY: 'bg-[#FFF6E0] border-[#C89B2C] text-[#7A5C0E]',
  OCCUPIED: 'bg-[#FDECEA] border-[#B0392B] text-[#8C2B1F]',
  OOO: 'bg-[#F1F1F1] border-[#9AA0A3] text-gray-500',
};

function StatCard({ label, value, sub, icon }: { label: string; value: any; sub?: string; icon: string }) {
  return (
    <div className="border border-[#CFE3E6] p-3 flex items-center gap-3 bg-white">
      <span className="text-[#062A31]"><Glyph icon={icon} size={22} /></span>
      <div className="min-w-0">
        <div className="text-[10px] text-[#5C8891] uppercase font-semibold tracking-tight">{label}</div>
        <div className="text-[18px] font-bold text-[#062A31] truncate">
          {value}{sub && <span className="text-[11px] font-normal text-[#5C8891] ml-1">({sub})</span>}
        </div>
      </div>
    </div>
  );
}

export default function PmsHotelStatusView() {
  const qc = useQueryClient();
  const [selId, setSelId] = useState<number | null>(null);

  const { data: myHotels } = useQuery({
    queryKey: ['auth', 'hotels'],
    queryFn: async () => (await apiClient.get('auth/hotels/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const hotels: any[] = myHotels?.hotels || [];
  const hotelId = localStorage.getItem('erp_hotel') || '';
  const hotelName = hotels.find((h: any) => String(h.id) === hotelId)?.name || hotels[0]?.name || '';

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['pms', 'frontdesk', 'hotel-status'],
    queryFn: async () => (await apiClient.get('pms/frontdesk/hotel-status/')).data,
  });

  const { data: selRes } = useQuery({
    queryKey: ['pms', 'reservations', selId],
    queryFn: async () => (await apiClient.get(`pms/reservations/${selId}/`)).data,
    enabled: !!selId,
  });

  const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); };

  const occ = data?.occupancy || { occupied: 0, total: 0, pct: 0 };
  const rooms: any[] = data?.rooms || [];

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto p-3" style={{ background: '#F7FAFA' }}>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <StatCard label="Chegadas Hoje" value={data?.arrivals_count ?? '—'} icon="🏛" />
          <StatCard label="Saídas Hoje" value={data?.departures_count ?? '—'} icon="🕐" />
          <StatCard label="Ocupação" value={`${occ.occupied}/${occ.total}`} sub={`${occ.pct}%`} icon="🛏" />
          <StatCard label="Data" value={data?.date ? new Date(`${data.date}T00:00:00`).toLocaleDateString('pt-PT') : '—'} icon="📊" />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="border border-[#CFE3E6] bg-white">
            <div className="px-2 py-1 font-bold text-[11px] bg-[#F7FAFA] border-b border-[#CFE3E6]">
              Chegadas de Hoje ({data?.arrivals_count ?? 0})
            </div>
            <div style={{ height: 210 }}>
              <ClassicGrid rowKey="id" data={data?.arrivals || []} onRowClick={(r: any) => setSelId(r.id)} columns={[
                { header: 'Confirmação', accessor: 'confirmation', width: '22%' },
                { header: 'Hóspede', accessor: 'guest_name', width: '30%' },
                { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '15%' },
                { header: 'Categoria', accessor: 'room_type_name', width: '18%' },
                { header: 'Estado', accessor: 'status_display', width: '15%' },
              ]} />
            </div>
          </div>
          <div className="border border-[#CFE3E6] bg-white">
            <div className="px-2 py-1 font-bold text-[11px] bg-[#F7FAFA] border-b border-[#CFE3E6]">
              Saídas de Hoje ({data?.departures_count ?? 0})
            </div>
            <div style={{ height: 210 }}>
              <ClassicGrid rowKey="id" data={data?.departures || []} onRowClick={(r: any) => setSelId(r.id)} columns={[
                { header: 'Confirmação', accessor: 'confirmation', width: '22%' },
                { header: 'Hóspede', accessor: 'guest_name', width: '30%' },
                { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '15%' },
                { header: 'Categoria', accessor: 'room_type_name', width: '18%' },
                { header: 'Estado', accessor: 'status_display', width: '15%' },
              ]} />
            </div>
          </div>
        </div>

        <div className="font-bold text-[12px] text-[#062A31] mb-2">Mapa de Quartos</div>
        <div className="grid grid-cols-8 gap-2 bg-white p-2 border border-[#CFE3E6]">
          {rooms.map((r: any) => (
            <button key={r.id} onClick={() => r.reservation && setSelId(r.reservation.id)}
              title={r.reservation ? `${r.reservation.confirmation} · ${r.reservation.guest_name}` : r.status_display}
              className={`border p-2 text-left text-[11px] ${ROOM_STATUS_STYLE[r.status] || ''} ${r.reservation ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}>
              <div className="font-bold text-[13px]">{r.number}</div>
              <div className="text-[10px] truncate">{r.room_type_name}</div>
              <div className="text-[9px] mt-1 font-semibold">{r.status_display}</div>
              {r.reservation && <div className="text-[9px] truncate mt-0.5">{r.reservation.guest_name}</div>}
            </button>
          ))}
          {rooms.length === 0 && !isLoading && <div className="col-span-8 text-center text-gray-400 py-6">Sem quartos criados.</div>}
        </div>
      </div>
      <Toolbar actions={[{ label: 'Atualizar', icon: '⟳', color: '#062A31', onClick: refresh }]} />

      {selId && selRes && (
        <PmsReservationDetailDialog reservation={selRes} hotelName={hotelName}
          onClose={() => setSelId(null)} onChanged={refresh} />
      )}
    </div>
  );
}
