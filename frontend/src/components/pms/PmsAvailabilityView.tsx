import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bed, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsRight, ChevronsLeft, Building2,
  Plus, BedDouble, Calendar, RefreshCw,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import PmsBlockPickerDialog from './PmsBlockPickerDialog';
import PmsNewReservationDialog from './PmsNewReservationDialog';

// Colunas 1 e 2 do rádio "Modo" — a ordem importa (o layout é 2 colunas x 4 linhas).
const MODOS: [string, string][] = [
  ['Gráfico', 'Plano Preços'], ['Lista', 'Prev. anual'], ['Lista2', 'Recursos'], ['Lista3', 'Painel Controlo'],
];

// A cor de cada estado — igual ao que uma reserva realmente pode ser neste PMS
// (pms.Reservation.STATUS) mais o Allotment (retido por um Bloco, ainda sem
// reserva própria). "FdS" e "Day Use" ficam na legenda por fidelidade visual,
// mas não têm dados nesta fase — nunca aparecem coloridos no gráfico porque
// nenhum lançamento real os produz (não é gaveta vazia disfarçada de dado).
const LEGEND: { key: string; label: string; color: string }[] = [
  { key: 'free', label: 'Livres', color: '#5C8891' },
  { key: 'booked', label: 'Reservado', color: '#FDECEA' },
  { key: 'fds', label: 'FdS', color: '#5C8891' },
  { key: 'option', label: 'Opção', color: '#7FA9B1' },
  { key: 'waitlist', label: 'Lista Espera', color: '#062A31' },
  { key: 'dayuse', label: 'Day Use', color: '#7FA9B1' },
  { key: 'overbook', label: 'Overbook', color: '#B0392B' },
  { key: 'allotment', label: 'Allotment', color: '#5C8891' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
};
const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });

function PanelHead({ children }: { children: any }) {
  return <div className="px-2 py-1 font-bold text-[11px] border-b border-[#CFE3E6] bg-[#F7FAFA]">{children}</div>;
}

export default function PmsAvailabilityView() {
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(plusDays(todayISO(), 6));
  const [roomType, setRoomType] = useState('');
  const [modo, setModo] = useState('Gráfico');
  const [treeOpen, setTreeOpen] = useState(true);
  const [catOpen, setCatOpen] = useState(true);
  const [allotment, setAllotment] = useState<any>(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showNewRes, setShowNewRes] = useState(false);
  const [includeAllotment, setIncludeAllotment] = useState(false);
  const [onlyGuaranteed, setOnlyGuaranteed] = useState(false);

  const { data: myHotels } = useQuery({
    queryKey: ['auth', 'hotels'],
    queryFn: async () => (await apiClient.get('auth/hotels/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const hotelName = myHotels?.hotels?.[0]?.name || '';

  const nDias = Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1;
  const mover = (n: number) => { setDateFrom(plusDays(dateFrom, n)); setDateTo(plusDays(dateTo, n)); };

  const { data: roomTypes } = useQuery({
    queryKey: ['pms', 'room-types'],
    queryFn: async () => (await apiClient.get('pms/room-types/')).data,
  });
  const list = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pms', 'availability', dateFrom, dateTo, roomType, allotment?.id, includeAllotment, onlyGuaranteed],
    queryFn: async () => (await apiClient.get('pms/availability/', {
      params: {
        date_from: dateFrom, date_to: dateTo, room_type: roomType || undefined, block: allotment?.id || undefined,
        include_allotment: includeAllotment ? '1' : undefined, only_guaranteed: onlyGuaranteed ? '1' : undefined,
      },
    })).data,
  });

  const series = (roomType ? data?.by_category?.[0]?.days : data?.total) || [];
  const chartData = series.map((d: any) => ({
    dia: fmt(d.date), Livres: d.free, Reservado: d.booked, Opção: d.option,
    'Lista Espera': d.waitlist, Overbook: d.overbook, Allotment: d.allotment,
  }));

  return (
    <div className="flex h-full bg-white">
      {/* Categorias dos Hotéis */}
      {catOpen ? (
        <div className="w-[240px] border-r border-[#7FA9B1] bg-white flex flex-col flex-shrink-0">
          <div className="px-2 py-1.5 font-bold text-[11px] border-b border-[#CFE3E6] bg-[#F7FAFA] flex items-center justify-between">
            Categorias dos Hotéis
            <button onClick={() => setCatOpen(false)} title="Encolher" className="text-[#7FA9B1] hover:text-[#041F24]">
              <ChevronsLeft size={13} />
            </button>
          </div>
          <button onClick={() => setTreeOpen((o) => !o)}
            className="text-left px-2 py-1.5 text-[12px] font-bold flex items-center gap-1 bg-[#7FA9B1] text-black">
            {treeOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} className="rotate-90" />}
            <Building2 size={13} /> {hotelName || '—'}
          </button>
          {treeOpen && (
            <>
              <button onClick={() => setRoomType('')}
                className={`text-left pl-8 pr-3 py-1.5 text-[12px] ${!roomType ? 'bg-[#062A31] text-white' : 'hover:bg-[#F7FAFA]'}`}>
                (Todas as categorias)
              </button>
              {list.map((rt: any) => (
                <button key={rt.id} onClick={() => setRoomType(String(rt.id))}
                  className={`text-left pl-8 pr-3 py-1.5 text-[12px] flex items-center gap-1.5 ${roomType === String(rt.id) ? 'bg-[#062A31] text-white' : 'text-[#062A31] hover:bg-[#F7FAFA]'}`}>
                  <Bed size={12} /> {rt.name}
                </button>
              ))}
            </>
          )}
        </div>
      ) : (
        <button onClick={() => setCatOpen(true)} title="Mostrar Categorias dos Hotéis"
          className="w-[18px] border-r border-[#7FA9B1] bg-[#F7FAFA] flex-shrink-0 flex items-start justify-center pt-2 hover:bg-[#F7FAFA]">
          <ChevronsRight size={13} className="text-[#7FA9B1]" />
        </button>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex gap-3 p-2 bg-[#F7FAFA] border-b border-[#7FA9B1] text-[11px] items-stretch">
          {/* Modo */}
          <div className="border border-[#CFE3E6] bg-white flex-shrink-0">
            <PanelHead>Modo</PanelHead>
            <div className="p-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {MODOS.map(([a, b]) => [a, b].map((m) => (
                <label key={m} className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <input type="radio" name="modo" checked={modo === m}
                    onChange={() => { setModo(m); if (m !== 'Gráfico') aviso(`Modo "${m}" ainda não está construído — só "Gráfico" funciona nesta fase.`); }} />
                  {m}
                </label>
              )))}
            </div>
          </div>

          {/* Critérios */}
          <div className="border border-[#CFE3E6] bg-white flex-1 flex">
            <div className="flex-1">
              <PanelHead>Critérios</PanelHead>
              <div className="p-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2">
                    <span className="w-8">De:</span>
                    <span className="relative flex-1">
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        className="border border-[#7FA9B1] p-1 pr-6 bg-white w-full" />
                      <Calendar size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#5C8891] pointer-events-none" />
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-8">Até:</span>
                    <span className="relative flex-1">
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="border border-[#7FA9B1] p-1 pr-6 bg-white w-full" />
                      <Calendar size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#5C8891] pointer-events-none" />
                    </span>
                  </label>
                  <div className="flex gap-1 mt-0.5">
                    <button onClick={() => mover(-nDias)}
                      className="flex-1 flex items-center justify-center gap-1 text-white font-bold py-1.5" style={{ background: '#041F24' }}>
                      <ChevronLeft size={13} /> Anterior
                    </button>
                    <button onClick={() => mover(nDias)}
                      className="flex-1 flex items-center justify-center gap-1 text-white font-bold py-1.5" style={{ background: '#041F24' }}>
                      Próx. <ChevronRight size={13} />
                    </button>
                  </div>
                  <div className="text-center italic text-gray-500">(Dias: {nDias})</div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2">
                    <span className="w-[68px]">Allotment:</span>
                    <span className="relative flex-1">
                      <input readOnly value={allotment ? allotment.code : '(Todos)'}
                        className="border border-[#7FA9B1] p-1 pr-6 bg-[#F7FAFA] w-full" />
                      <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#5C8891] pointer-events-none" />
                    </span>
                    <button onClick={() => setShowBlockPicker(true)} title="Procurar bloco"
                      className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#041F24] text-white"><Plus size={13} /></button>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={includeAllotment} onChange={(e) => setIncludeAllotment(e.target.checked)} />
                    Incluir allotment
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={onlyGuaranteed} disabled={!includeAllotment}
                      onChange={(e) => setOnlyGuaranteed(e.target.checked)} />
                    Apenas allotments garantidos
                  </label>
                </div>
              </div>
            </div>

            <button onClick={() => refetch()}
              className="w-[110px] flex-shrink-0 flex flex-col items-center justify-center gap-1 text-white font-bold text-[13px] m-2"
              style={{ background: '#041F24' }}>
              <RefreshCw size={20} /> Pesquisar
            </button>
          </div>
        </div>

        <div className="flex-1 p-3 overflow-auto">
          {modo !== 'Gráfico' ? (
            <div className="text-gray-400 text-[12px] text-center py-10">Modo "{modo}" ainda não construído — mude para "Gráfico".</div>
          ) : isLoading ? <div className="text-gray-400 text-[12px]">A carregar…</div> : (
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={chartData} barCategoryGap="8%" barGap={0}>
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} axisLine={{ stroke: '#041F24' }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={{ stroke: '#041F24' }} />
                <Tooltip />
                <Bar dataKey="Livres" stackId="a" fill="#5C8891" stroke="#062A31" strokeWidth={1}>
                  <LabelList dataKey="Livres" position="insideTop" style={{ fontWeight: 700, fontSize: 15, fill: '#041F24' }}
                    formatter={(v: any) => (v ? String(v) : '')} />
                </Bar>
                <Bar dataKey="Reservado" stackId="a" fill="#FDECEA" stroke="#B0392B" strokeWidth={1}>
                  <LabelList dataKey="Reservado" position="top" style={{ fontWeight: 700, fontSize: 12, fill: '#041F24' }}
                    formatter={(v: any) => (v ? String(v) : '')} />
                </Bar>
                <Bar dataKey="Opção" stackId="a" fill="#7FA9B1" stroke="#5C8891" strokeWidth={1} />
                <Bar dataKey="Lista Espera" stackId="a" fill="#062A31" stroke="#041F24" strokeWidth={1} />
                <Bar dataKey="Allotment" stackId="a" fill="#5C8891" stroke="#062A31" strokeWidth={1} />
                <Bar dataKey="Overbook" stackId="a" fill="#B0392B" stroke="#B0392B" strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {/* Legenda — 8 cores fiéis ao PMS de referência; "FdS" e "Day Use" ainda
              não têm nenhum lançamento real por trás nesta fase (não inventam dados). */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-2 text-[11px] text-[#041F24]">
            {LEGEND.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 inline-block" style={{ background: l.color }} /> {l.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-2 py-1.5 border-t border-[#CFE3E6] bg-[#F7FAFA] text-[11px] text-gray-600">
          <button onClick={() => setShowNewRes(true)} className="flex items-center gap-2 text-[#041F24] hover:text-black">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: '#5C8891' }}>
              <BedDouble size={14} />
            </span>
            Criar Reserva
          </button>
          <span>{list.length} categoria(s) de quarto</span>
        </div>
      </div>

      {showBlockPicker && (
        <PmsBlockPickerDialog onClose={() => setShowBlockPicker(false)}
          onSelect={(b) => { setAllotment(b); setShowBlockPicker(false); }} />
      )}
      {showNewRes && (
        <PmsNewReservationDialog roomTypes={list} onClose={() => setShowNewRes(false)}
          onCreated={() => { setShowNewRes(false); refetch(); }} />
      )}
    </div>
  );
}
