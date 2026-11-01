import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Toolbar } from '../posconfig/kit';
import PmsReservationDetailDialog from './PmsReservationDetailDialog';
import PmsNewReservationDialog from './PmsNewReservationDialog';
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
  // O quarto e o dia onde se carregou, à espera de virarem reserva.
  const [aCriar, setACriar] = useState<any | null>(null);

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

  // As TIPOLOGIAS, para o diálogo de reserva. O mapa já sabe a tipologia do
  // quarto onde se carregou, por isso a reserva nasce com ela escolhida.
  const { data: rtData } = useQuery({
    queryKey: ['pms', 'room-types'],
    queryFn: async () => (await apiClient.get('pms/room-types/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const roomTypes: any[] = Array.isArray(rtData) ? rtData : rtData?.results || [];

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
        { label: '← 14 dias', icon: '◀', color: '#3B82F6', onClick: () => setWeekStart((d) => addDays(d, -DAYS_VISIBLE)) },
        { label: '14 dias →', icon: '▶', color: '#3B82F6', onClick: () => setWeekStart((d) => addDays(d, DAYS_VISIBLE)) },
        { label: 'Hoje', icon: '🕐', color: '#3B82F6', onClick: () => setWeekStart(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }) },
        { label: 'Atualizar', icon: '⟳', onClick: () => refetch() },
      ]} />
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-[11px] w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#EEF1F5] border border-[#E6E8EC] px-2 py-1 text-left min-w-[130px] z-10">Quarto</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="border border-[#E6E8EC] px-1 py-1 min-w-[60px] font-normal text-[#6B7280]">
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
                      className="border border-[#E6E8EC] px-1 py-1 text-white text-[10px] font-semibold cursor-pointer truncate hover:brightness-110"
                      style={{ background: res.color_tag || STATUS_COLOR[res.status] || '#3B82F6' }}
                      title={`${res.confirmation} · ${res.guest_name} · ${res.check_in} → ${res.check_out}`}>
                      {res.guest_name}
                    </td>,
                  );
                  dayIdx += span;
                } else {
                  // A CÉLULA VAZIA É O SÍTIO ONDE SE PLANEIA.
                  //
                  // Era um buraco: clicar nela não fazia nada. Um mapa de
                  // planeamento onde só se consegue ABRIR o que já existe não é
                  // um mapa de planeamento — é um relatório em forma de grelha, e
                  // para marcar uma estadia era preciso sair daqui, ir às
                  // reservas, criar, escolher o quarto outra vez e voltar.
                  //
                  // Agora carrega-se no cruzamento do quarto com o dia e a
                  // reserva nasce com os dois já escolhidos — que é a única razão
                  // para se estar a olhar para este ecrã.
                  const esteDia = dayIso;
                  const esteQuarto = room;
                  cells.push(
                    <td key={dayIdx}
                      onClick={() => setACriar({
                        check_in: esteDia,
                        check_out: fmtISO(addDays(new Date(`${esteDia}T00:00:00`), 1)),
                        room: esteQuarto.id,
                        room_number: esteQuarto.number,
                        room_type: esteQuarto.room_type,
                      })}
                      title={`Marcar reserva — quarto ${esteQuarto.number}, ${esteDia}`}
                      className="border border-[#E6E8EC] px-1 py-1 cursor-pointer hover:bg-[#FDF4D9]" />,
                  );
                  dayIdx++;
                }
              }
              return (
                <tr key={room.id}>
                  <td className="sticky left-0 bg-white border border-[#E6E8EC] px-2 py-1 font-semibold z-10">
                    {room.number} <span className="text-[#6B7280] font-normal">({room.room_type_name})</span>
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
        {/* Um ecrã que só faz alguma coisa se lhe carregarem no sítio certo tem de
            DIZER qual é o sítio. Sem esta linha, a diferença entre "ainda não
            faz nada" e "faz, mas tem de se descobrir" é invisível. */}
        <div className="px-2 py-1 border-t text-[11px]" style={{ borderColor: '#EDEDED', color: '#6B7280' }}>
          Carregue num dia livre de um quarto para marcar uma reserva; numa barra colorida para abrir a que lá está.
        </div>
        {unassigned.length > 0 && (
          <div className="p-2 text-[11px] text-[#6B7280] border-t border-[#F1F2F4]">
            {unassigned.length} reserva(s) sem quarto atribuído neste período (não aparecem no mapa) — atribua um quarto na ficha da reserva.
          </div>
        )}
      </div>

      {selId && selRes && (
        <PmsReservationDetailDialog reservation={selRes} hotelName={hotelName}
          onClose={() => setSelId(null)} onChanged={() => refetch()} />
      )}

      {aCriar && (
        <PmsNewReservationDialog roomTypes={roomTypes} inicial={aCriar}
          onClose={() => setACriar(null)}
          onCreated={() => { setACriar(null); refetch(); }} />
      )}
    </div>
  );
}
