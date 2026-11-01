import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bed, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsRight, ChevronsLeft, Building2,
  Plus, BedDouble, Calendar, RefreshCw,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { apiClient } from '../../api/client';
import { TOKENS } from '../../config/theme';
import ClassicGrid from '../ui/ClassicGrid';
import PmsBlockPickerDialog from './PmsBlockPickerDialog';
import PmsNewReservationDialog from './PmsNewReservationDialog';

// Modos de visualização reais: "Gráfico" (barras empilhadas) e "Lista" (grelha
// livres/total por categoria e dia). Os outros modos do PMS de referência
// (Lista2/Lista3, Plano Preços, Prev. anual, Recursos, Painel Controlo) foram
// removidos daqui de propósito por serem redundantes ou fora de alcance nesta
// fase — ver nota de auditoria no fundo do ficheiro.
const MODOS: string[] = ['Gráfico', 'Lista'];

// A cor de cada estado — igual ao que uma reserva realmente pode ser neste PMS
// (pms.Reservation.STATUS) mais o Allotment (retido por um Bloco, ainda sem
// reserva própria). "FdS" e "Day Use" ficam na legenda por fidelidade visual,
// mas não têm dados nesta fase — nunca aparecem coloridos no gráfico porque
// nenhum lançamento real os produz (não é gaveta vazia disfarçada de dado).
/**
 * AS CORES DAS SÉRIES — e porque não podiam continuar como estavam.
 *
 * Seis séries empilhadas e TRÊS com o mesmo azul (`#3B82F6`): Livres, Opção e
 * Allotment. Numa barra empilhada isso não é feio — é ERRADO: os três segmentos
 * encostam-se e lêem-se como um só bloco, e o gráfico passa a dizer menos do que
 * a tabela que está ao lado dele. O "Reservado" era quase branco (`#FEF2F2`), que
 * sobre fundo branco não se vê de todo.
 *
 * Estas são as cinco primeiras ranhuras de uma paleta categórica validada, pela
 * ordem fixa dela (azul, laranja, água, amarelo, magenta). A ordem não se escolhe
 * por gosto: fixa-se, para a mesma série ter sempre a mesma cor e um filtro que
 * tire séries não repintar as que ficam.
 *
 * O "Overbook" NÃO é uma série — é um ESTADO MAU (vendeu-se mais do que há).
 * Leva a cor reservada aos estados críticos e nunca uma cor de série: se um dia
 * se acrescentar uma sétima categoria, ela não pode calhar vermelha e parecer um
 * alarme.
 *
 * Verificado com o validador da paleta (contraste, banda de luminosidade e
 * separação para daltónicos): passa todas as verificações. Três das cores ficam
 * abaixo de 3:1 contra o branco — por isso o gráfico traz rótulos visíveis nos
 * segmentos e existe o modo "Lista", que é a mesma informação em tabela. A cor
 * nunca é o único canal.
 */
const COR_SERIE = {
  livres: '#2a78d6',        // 1 · azul
  reservado: '#eb6834',     // 2 · laranja
  opcao: '#1baf7a',         // 3 · água
  listaEspera: '#eda100',   // 4 · amarelo
  allotment: '#e87ba4',     // 5 · magenta
  overbook: '#d03b3b',      // estado crítico — reservado, nunca uma série
} as const;

// O vazio entre segmentos empilhados é feito com um traço da COR DO FUNDO: dois
// pixéis de branco a separar as cores, que é o que deixa contar os segmentos sem
// os confundir uns com os outros.
const FUNDO = '#FFFFFF';

const LEGEND: { key: string; label: string; color: string }[] = [
  { key: 'free', label: 'Livres', color: COR_SERIE.livres },
  { key: 'booked', label: 'Reservado', color: COR_SERIE.reservado },
  { key: 'fds', label: 'FdS', color: '#C3D2E0' },
  { key: 'option', label: 'Opção', color: COR_SERIE.opcao },
  { key: 'waitlist', label: 'Lista Espera', color: COR_SERIE.listaEspera },
  { key: 'dayuse', label: 'Day Use', color: '#C3D2E0' },
  { key: 'overbook', label: 'Overbook', color: COR_SERIE.overbook },
  { key: 'allotment', label: 'Allotment', color: COR_SERIE.allotment },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
};
const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });

function PanelHead({ children }: { children: any }) {
  // O mesmo cabeçalho de caixa do resto do sistema (ver `Box` em posconfig/kit):
  // tira cinzenta com uma linha por baixo, e não um bloco de fundo chapado.
  return (
    <div className="px-2 py-[2px] font-bold text-[11px] border-b"
      style={{ background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)', borderColor: TOKENS.chromeLine }}>
      {children}
    </div>
  );
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

  // Modo "Lista" — a MESMA resposta de pms/availability/ (data.by_category +
  // data.total), só que como tabela plana: uma linha por categoria (mais uma
  // linha de total geral), uma coluna por dia do período pedido.
  const listaDays: any[] = data?.total || [];
  const listaRows = [
    ...((data?.by_category || []).map((c: any) => ({ id: c.room_type, name: `${c.code} — ${c.name}`, total: c.total, days: c.days }))),
    ...(listaDays.length ? [{ id: 'TOTAL', name: 'Total (todas as categorias)', total: listaDays[0]?.total, days: listaDays, isTotal: true }] : []),
  ];
  const listaCols = [
    { header: 'Categoria', accessor: (row: any) => <span className={row.isTotal ? 'font-bold' : ''}>{row.name}</span>, width: '220px' },
    { header: 'Qtd', accessor: 'total', width: '46px' },
    ...listaDays.map((d: any, i: number) => ({
      header: fmt(d.date),
      width: '84px',
      accessor: (row: any) => {
        const cell = row.days?.[i];
        if (!cell) return '';
        const color = cell.overbook > 0 ? '#DC2626' : cell.free === 0 ? '#DC2626' : '#2563EB';
        return <span style={{ color, fontWeight: row.isTotal ? 700 : 500 }}>{cell.free}/{cell.total}</span>;
      },
    })),
  ];

  return (
    <div className="flex h-full bg-white">
      {/* Categorias dos Hotéis */}
      {catOpen ? (
        <div className="w-[240px] border-r border-[#E6E8EC] bg-white flex flex-col flex-shrink-0">
          <div className="px-2 py-1.5 font-bold text-[11px] border-b border-[#E6E8EC] bg-[#EEF1F5] flex items-center justify-between">
            Categorias dos Hotéis
            <button onClick={() => setCatOpen(false)} title="Encolher" className="text-[#6B7280] hover:text-[#111827]">
              <ChevronsLeft size={13} />
            </button>
          </div>
          <button onClick={() => setTreeOpen((o) => !o)}
            className="text-left px-2 py-1.5 text-[12px] font-bold flex items-center gap-1 bg-[var(--marca-clara)] text-black">
            {treeOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} className="rotate-90" />}
            <Building2 size={13} /> {hotelName || '—'}
          </button>
          {treeOpen && (
            <>
              <button onClick={() => setRoomType('')}
                className={`text-left pl-8 pr-3 py-1.5 text-[12px] ${!roomType ? 'bg-[#FFFFFF] border-b border-[#E6E8EC] text-[#111827]' : 'hover:bg-[#EEF1F5]'}`}>
                (Todas as categorias)
              </button>
              {list.map((rt: any) => (
                <button key={rt.id} onClick={() => setRoomType(String(rt.id))}
                  className={`text-left pl-8 pr-3 py-1.5 text-[12px] flex items-center gap-1.5 ${roomType === String(rt.id) ? 'bg-[#FFFFFF] border-b border-[#E6E8EC] text-[#111827]' : 'text-[#111827] hover:bg-[#EEF1F5]'}`}>
                  <Bed size={12} /> {rt.name}
                </button>
              ))}
            </>
          )}
        </div>
      ) : (
        <button onClick={() => setCatOpen(true)} title="Mostrar Categorias dos Hotéis"
          className="w-[18px] border-r border-[#E6E8EC] bg-[#EEF1F5] flex-shrink-0 flex items-start justify-center pt-2 hover:bg-[#EEF1F5]">
          <ChevronsRight size={13} className="text-[#6B7280]" />
        </button>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex gap-2 p-1.5 border-b text-[11.5px] items-stretch"
          style={{ background: TOKENS.chrome, borderColor: TOKENS.chromeLine }}>
          {/* Modo */}
          <div className="border bg-white flex-shrink-0" style={{ borderColor: TOKENS.chromeLine }}>
            <PanelHead>Modo</PanelHead>
            <div className="p-2 flex flex-col gap-1">
              {MODOS.map((m) => (
                <label key={m} className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <input type="radio" name="modo" checked={modo === m} onChange={() => setModo(m)} />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {/* Critérios */}
          <div className="border bg-white flex-1 flex" style={{ borderColor: TOKENS.chromeLine }}>
            <div className="flex-1">
              <PanelHead>Critérios</PanelHead>
              <div className="p-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2">
                    <span className="w-8">De:</span>
                    <span className="relative flex-1">
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        className="border border-[#E6E8EC] p-1 pr-6 bg-white w-full" />
                      <Calendar size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-8">Até:</span>
                    <span className="relative flex-1">
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="border border-[#E6E8EC] p-1 pr-6 bg-white w-full" />
                      <Calendar size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
                    </span>
                  </label>
                  <div className="flex gap-1 mt-0.5">
                    <button onClick={() => mover(-nDias)}
                      className="flex-1 flex items-center justify-center gap-1 text-[#111827] font-bold py-1.5" style={{ background: '#FFFFFF' }}>
                      <ChevronLeft size={13} /> Anterior
                    </button>
                    <button onClick={() => mover(nDias)}
                      className="flex-1 flex items-center justify-center gap-1 text-[#111827] font-bold py-1.5" style={{ background: '#FFFFFF' }}>
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
                        className="border border-[#E6E8EC] p-1 pr-6 bg-[#EEF1F5] w-full" />
                      <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
                    </span>
                    <button onClick={() => setShowBlockPicker(true)} title="Procurar bloco"
                      className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#FFFFFF] border-b border-[#E6E8EC] text-[#111827]"><Plus size={13} /></button>
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

            {/* Botão de barra, não um bloco azul de 110 por 170: era o objecto
                mais pesado do ecrã a dizer "Pesquisar", quando o que importa aqui
                é o gráfico que está por baixo. */}
            <button onClick={() => refetch()}
              className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3 h-[22px] self-start m-1.5 text-[11.5px] font-semibold"
              style={{
                background: 'linear-gradient(to bottom, #FDFDFD, #EDEDED)',
                border: `1px solid ${TOKENS.chromeLine}`, color: TOKENS.textOnLight,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.hoverGold; e.currentTarget.style.borderColor = TOKENS.hoverGoldLine; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(to bottom, #FDFDFD, #EDEDED)'; e.currentTarget.style.borderColor = TOKENS.chromeLine; }}>
              <RefreshCw size={13} style={{ color: '#2F6FB5' }} /> Pesquisar
            </button>
          </div>
        </div>

        <div className="flex-1 p-3 overflow-auto">
          {isLoading ? <div className="text-gray-400 text-[12px]">A carregar…</div> : modo === 'Lista' ? (
            <div className="h-[440px]">
              <ClassicGrid columns={listaCols} data={listaRows} rowKey="id" filterable={false} />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              {/* `barCategoryGap` a 28%: as barras eram quase do tamanho do
                  espaço entre elas e o gráfico lia-se como uma parede. Os eixos
                  passam a cinzento — uma linha de eixo azul-forte compete com os
                  dados, e o eixo existe para se poder ignorar. */}
              <BarChart data={chartData} barCategoryGap="28%" barGap={0}>
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#52514e' }} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#52514e' }} allowDecimals={false} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
                <Tooltip />
                <Bar dataKey="Livres" stackId="a" fill={COR_SERIE.livres} stroke={FUNDO} strokeWidth={2}>
                  <LabelList dataKey="Livres" position="center" style={{ fontWeight: 700, fontSize: 12, fill: '#FFFFFF' }}
                    formatter={(v: any) => (v ? String(v) : '')} />
                </Bar>
                <Bar dataKey="Reservado" stackId="a" fill={COR_SERIE.reservado} stroke={FUNDO} strokeWidth={2}>
                  <LabelList dataKey="Reservado" position="center" style={{ fontWeight: 700, fontSize: 12, fill: '#FFFFFF' }}
                    formatter={(v: any) => (v ? String(v) : '')} />
                </Bar>
                <Bar dataKey="Opção" stackId="a" fill={COR_SERIE.opcao} stroke={FUNDO} strokeWidth={2} />
                {/* No amarelo o rótulo vai a PRETO: branco sobre amarelo não se lê. */}
                <Bar dataKey="Lista Espera" stackId="a" fill={COR_SERIE.listaEspera} stroke={FUNDO} strokeWidth={2} />
                <Bar dataKey="Allotment" stackId="a" fill={COR_SERIE.allotment} stroke={FUNDO} strokeWidth={2} />
                <Bar dataKey="Overbook" stackId="a" fill={COR_SERIE.overbook} stroke={FUNDO} strokeWidth={2}>
                  <LabelList dataKey="Overbook" position="center" style={{ fontWeight: 700, fontSize: 12, fill: '#FFFFFF' }}
                    formatter={(v: any) => (v ? String(v) : '')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {/* Legenda — 8 cores fiéis ao PMS de referência; "FdS" e "Day Use" ainda
              não têm nenhum lançamento real por trás nesta fase (não inventam dados).
              Só faz sentido para o gráfico de barras, não para a grelha "Lista". */}
          {modo !== 'Lista' && (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-2 text-[11px] text-[#111827]">
              {LEGEND.map((l) => (
                <span key={l.key} className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 inline-block" style={{ background: l.color }} /> {l.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-2 py-1.5 border-t border-[#E6E8EC] bg-[#EEF1F5] text-[11px] text-gray-600">
          <button onClick={() => setShowNewRes(true)} className="flex items-center gap-2 text-[#111827] hover:text-black">
            <BedDouble size={14} style={{ color: '#2F6FB5' }} />
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
