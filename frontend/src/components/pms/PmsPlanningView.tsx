import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Toolbar } from '../posconfig/kit';
import PmsReservationDetailDialog from './PmsReservationDetailDialog';
import { STATUS_COLOR } from './reservationStatus';

/** Planning — mapa de ocupação estilo Gantt: quartos em linha, dias em
    coluna, cada reserva atribuída a um quarto vira uma barra colorida a
    cobrir check_in→check_out. Construído inteiramente sobre pms/rooms/ e
    pms/reservations/ (filtros check_in_to/check_out_from já existentes no
    ReservationViewSet) — sem endpoint novo. */
const DAYS_VISIBLE = 14;
const fmtISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

export default function PmsPlanningView() {
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [selId, setSelId] = useState<number | null>(null);

  const { data: myHotels } = useQuery({
    queryKey: ['auth', 'hotels'],
    queryFn: async () => (await apiClient.get('auth/hotels/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const hotels: any[] = myHotels?.hotels || [];
  const hotelName = hotels.find((h: any) => String(h.id) === (localStorage.getItem('erp_hotel') || ''))?.name || hotels[0]?.name || '';

  const days = Array.from({ length: DAYS_VISIBLE }, (_, i) => addDays(weekStart, i));
  const rangeStart = fmtISO(weekStart);
  const rangeEnd = fmtISO(addDays(weekStart, DAYS_VISIBLE - 1));

  const { data: roomsData } = useQuery({ queryKey: ['pms', 'rooms'], queryFn: async () => (await apiClient.get('pms/rooms/')).data });
  const rooms: any[] = Array.isArray(roomsData) ? roomsData : roomsData?.results || [];

  const { data: resData, refetch } = useQuery({
    queryKey: ['pms', 'reservations', 'planning', rangeStart, rangeEnd],
    queryFn: async () => (await apiClient.get('pms/reservations/', {
      params: { check_in_to: rangeEnd, check_out_from: rangeStart },
    })).data,
  });
  const allRes: any[] = (Array.isArray(resData) ? resData : resData?.results || [])
    .filter((r: any) => !['CANCELLED', 'NO_SHOW'].includes(r.status));
  const assigned = allRes.filter((r: any) => r.room_number);
  const unassigned = allRes.filter((r: any) => !r.room_number);

  const byRoom: Record<string, any[]> = {};
  for (const r of assigned) (byRoom[r.room_number] = byRoom[r.room_number] || []).push(r);
  for (const list of Object.values(byRoom)) list.sort((a: any, b: any) => a.check_in.localeCompare(b.check_in));

  const { data: selRes } = useQuery({
    queryKey: ['pms', 'reservations', selId],
    queryFn: async () => (await apiClient.get(`pms/reservations/${selId}/`)).data,
    enabled: !!selId,
  });

  return (
    <div className="flex flex-col h-full bg-white">
      <Toolbar actions={[
        { label: '← 14 dias', icon: '◀', color: '#5C8891', onClick: () => setWeekStart((d) => addDays(d, -DAYS_VISIBLE)) },
        { label: '14 dias →', icon: '▶', color: '#5C8891', onClick: () => setWeekStart((d) => addDays(d, DAYS_VISIBLE)) },
        { label: 'Hoje', icon: '🕐', color: '#5C8891', onClick: () => setWeekStart(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }) },
        { label: 'Atualizar', icon: '⟳', color: '#062A31', onClick: () => refetch() },
      ]} />
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-[11px] w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#F7FAFA] border border-[#CFE3E6] px-2 py-1 text-left min-w-[130px] z-10">Quarto</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="border border-[#CFE3E6] px-1 py-1 min-w-[60px] font-normal text-[#5C8891]">
                  {d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room: any) => {
              const resList = byRoom[room.number] || [];
              const cells: any[] = [];
              let dayIdx = 0;
              while (dayIdx < DAYS_VISIBLE) {
                const dayIso = fmtISO(days[dayIdx]);
                const res = resList.find((r: any) => r.check_in <= dayIso && r.check_out > dayIso);
                if (res) {
                  let span = 0;
                  let j = dayIdx;
                  while (j < DAYS_VISIBLE && fmtISO(days[j]) < res.check_out) { span++; j++; }
                  cells.push(
                    <td key={dayIdx} colSpan={span} onClick={() => setSelId(res.id)}
                      className="border border-[#CFE3E6] px-1 py-1 text-white text-[10px] font-semibold cursor-pointer truncate hover:brightness-110"
                      style={{ background: res.color_tag || STATUS_COLOR[res.status] || '#5C8891' }}
                      title={`${res.confirmation} · ${res.guest_name} · ${res.check_in} → ${res.check_out}`}>
                      {res.guest_name}
                    </td>,
                  );
                  dayIdx += span;
                } else {
                  cells.push(<td key={dayIdx} className="border border-[#CFE3E6] px-1 py-1" />);
                  dayIdx++;
                }
              }
              return (
                <tr key={room.id}>
                  <td className="sticky left-0 bg-white border border-[#CFE3E6] px-2 py-1 font-semibold z-10">
                    {room.number} <span className="text-[#7FA9B1] font-normal">({room.room_type_name})</span>
                  </td>
                  {cells}
                </tr>
              );
            })}
            {rooms.length === 0 && (
              <tr><td colSpan={DAYS_VISIBLE + 1} className="text-center text-gray-400 py-6">Sem quartos criados.</td></tr>
            )}
          </tbody>
        </table>
        {unassigned.length > 0 && (
          <div className="p-2 text-[11px] text-[#5C8891] border-t border-[#EEF4F5]">
            {unassigned.length} reserva(s) sem quarto atribuído neste período (não aparecem no mapa) — atribua um quarto na ficha da reserva.
          </div>
        )}
      </div>

      {selId && selRes && (
        <PmsReservationDetailDialog reservation={selRes} hotelName={hotelName}
          onClose={() => setSelId(null)} onChanged={() => refetch()} />
      )}
    </div>
  );
}
