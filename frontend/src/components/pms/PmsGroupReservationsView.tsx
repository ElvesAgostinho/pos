import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Copy, ChevronDown, ChevronUp, Building2, RefreshCw, Save, Trash2,
  ChevronsLeft, ChevronsRight, FileSpreadsheet, Eye, X, BedDouble,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import ClassicGrid from '../ui/ClassicGrid';
import PmsBlockEditorDialog from './PmsBlockEditorDialog';
import PmsNewReservationDialog from './PmsNewReservationDialog';
import PmsSaveSearchDialog from './PmsSaveSearchDialog';

const naoConstruido = (label: string) => aviso(`"${label}" ainda não está construído nesta fase do PMS.`);
const SAVED_KEY = 'pms_saved_searches_group';

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px]">
      <span className="text-[#444] font-semibold whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}
const inputCls = 'border border-[#a0a0a0] px-1.5 py-1 text-[11px] bg-white';
const selCls = 'border border-[#a0a0a0] px-1.5 py-1 text-[11px] bg-white';
const disabledSel = selCls + ' text-gray-400';

function ToolBtn({ icon: Icon, label, onClick, disabled, color = '#3c3c3c' }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 px-2 py-1.5 text-[12px] font-semibold text-[#333] disabled:opacity-40 disabled:cursor-default hover:bg-[#e4e4e4]">
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: disabled ? '#b8b8b8' : color }}>
        <Icon size={13} />
      </span>
      {label}
    </button>
  );
}

function loadSaved(): { name: string; filters: any }[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}

/** "Pickup" de um bloco — as reservas individuais já feitas contra ele. */
function PickupDialog({ block, onClose }: { block: any; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['pms', 'block', block.id, 'pickup'],
    queryFn: async () => (await apiClient.get(`pms/blocks/${block.id}/pickup/`)).data,
  });
  const rows = data || [];
  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[820px] max-h-[75vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
          Pickup — {block.code} · {block.description}
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Confirmação', accessor: 'confirmation', width: '15%' },
            { header: 'Hóspede', accessor: 'guest_name', width: '22%' },
            { header: 'Categoria', accessor: 'room_type_name', width: '18%' },
            { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '10%' },
            { header: 'Check-in', accessor: 'check_in', width: '13%' },
            { header: 'Check-out', accessor: 'check_out', width: '13%' },
            { header: 'Estado', accessor: 'status_display', width: '9%' },
          ]} />
          {rows.length === 0 && <div className="p-6 text-center text-gray-400 text-[12px]">Ainda sem reservas individuais contra este bloco.</div>}
        </div>
      </div>
    </div>
  );
}

/** Reservas de Grupo — o mesmo estilo de pesquisa das Reservas, aplicado a
 * pms.Block (um bloco de quartos para um grupo/empresa/evento). */
export default function PmsGroupReservationsView() {
  const [q, setQ] = useState('');
  const [guestQuery, setGuestQuery] = useState('');
  const [codigo, setCodigo] = useState('');
  const [dateMode, setDateMode] = useState<'fixed' | 'period'>('fixed');
  const [ciOn, setCiOn] = useState(false);
  const [coOn, setCoOn] = useState(false);
  const [ciFrom, setCiFrom] = useState('');
  const [ciTo, setCiTo] = useState('');
  const [coFrom, setCoFrom] = useState('');
  const [coTo, setCoTo] = useState('');
  const [minRooms, setMinRooms] = useState('');
  const [minAdults, setMinAdults] = useState('');
  const [roomType, setRoomType] = useState('');
  const [segment, setSegment] = useState('');
  const [subSegment, setSubSegment] = useState('');
  const [channel, setChannel] = useState('');
  const [isGuaranteed, setIsGuaranteed] = useState(false);
  const [voucher, setVoucher] = useState('');
  const [ratePlan, setRatePlan] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [ocultarAposPesquisa, setOcultarAposPesquisa] = useState(false);
  const [avancadaAberta, setAvancadaAberta] = useState(true);

  const [selId, setSelId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [showPickup, setShowPickup] = useState<any>(null);

  const [savedName, setSavedName] = useState('');
  const [saved, setSaved] = useState(loadSaved());
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data: myHotels } = useQuery({
    queryKey: ['auth', 'hotels'],
    queryFn: async () => (await apiClient.get('auth/hotels/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const hotels: any[] = myHotels?.hotels || [];
  const [hotelId, setHotelId] = useState(() => localStorage.getItem('erp_hotel') || '');
  const hotelName = hotels.find((h: any) => String(h.id) === hotelId)?.name || hotels[0]?.name || '';

  const { data: roomTypes } = useQuery({ queryKey: ['pms', 'room-types'], queryFn: async () => (await apiClient.get('pms/room-types/')).data });
  const rtList = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];
  const { data: ratePlans } = useQuery({ queryKey: ['pms', 'rate-plans'], queryFn: async () => (await apiClient.get('pms/rate-plans/')).data });
  const rpList = Array.isArray(ratePlans) ? ratePlans : ratePlans?.results || [];
  const { data: segments } = useQuery({ queryKey: ['pos', 'segments'], queryFn: async () => (await apiClient.get('pos/config/segments/')).data });
  const segList = (Array.isArray(segments) ? segments : segments?.results || []).filter((s: any) => s.for_pms !== false);
  const { data: subSegments } = useQuery({ queryKey: ['pos', 'subsegments'], queryFn: async () => (await apiClient.get('pos/config/subsegments/')).data });
  const subList = (Array.isArray(subSegments) ? subSegments : subSegments?.results || [])
    .filter((s: any) => s.for_pms !== false && (!segment || String(s.segment) === segment));
  const { data: channels } = useQuery({ queryKey: ['pos', 'channels'], queryFn: async () => (await apiClient.get('pos/config/channels/')).data });
  const chList = (Array.isArray(channels) ? channels : channels?.results || []).filter((c: any) => c.for_pms !== false);

  const params: any = {
    q: [q, guestQuery, codigo].filter(Boolean).join(' ') || undefined,
    room_type: roomType || undefined, segment: segment || undefined, sub_segment: subSegment || undefined,
    channel: channel || undefined, rate_plan: ratePlan || undefined,
    is_guaranteed: isGuaranteed ? '1' : undefined, voucher: voucher || undefined,
    min_rooms: minRooms || undefined,
  };
  if (ciOn) {
    if (dateMode === 'fixed' && ciFrom) { params.check_in_from = ciFrom; params.check_in_to = ciFrom; }
    else { if (ciFrom) params.check_in_from = ciFrom; if (ciTo) params.check_in_to = ciTo; }
  }
  if (coOn) {
    if (dateMode === 'fixed' && coFrom) { params.check_out_from = coFrom; params.check_out_to = coFrom; }
    else { if (coFrom) params.check_out_from = coFrom; if (coTo) params.check_out_to = coTo; }
  }

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['pms', 'blocks', 'search', params],
    queryFn: async () => (await apiClient.get('pms/blocks/', { params })).data,
    refetchInterval: autoUpdate ? 30000 : false,
  });
  const rows = Array.isArray(data) ? data : data?.results || [];
  const totalPaginas = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const sel = rows.find((r: any) => r.id === selId);

  const pesquisar = () => { setPage(1); refetch(); if (ocultarAposPesquisa) setAvancadaAberta(false); };

  const exportarExcel = () => {
    const cab = ['Código', 'Descrição', 'Entidade', 'De', 'Até', 'Quartos', 'Garantido', 'Valor Contrato'];
    const linhas = rows.map((b: any) => [b.code, b.description, b.main_entity_name || b.group_name || '', b.valid_from, b.valid_to,
      b.total_rooms, b.is_guaranteed ? 'Sim' : 'Não', b.contract_value].join('\t'));
    const csv = [cab.join('\t'), ...linhas].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reservas_de_grupo_${hotelName || 'pms'}.xls`; a.click();
    URL.revokeObjectURL(url);
  };

  const confirmarGravarPesquisa = (nome: string) => {
    const filtros = { q, guestQuery, codigo, dateMode, ciOn, coOn, ciFrom, ciTo, coFrom, coTo,
      minRooms, roomType, segment, subSegment, channel, isGuaranteed, voucher, ratePlan };
    const novas = [...saved.filter((s) => s.name !== nome), { name: nome, filters: filtros }];
    localStorage.setItem(SAVED_KEY, JSON.stringify(novas));
    setSaved(novas); setSavedName(nome); setShowSaveDialog(false);
  };
  const apagarPesquisa = () => {
    if (!savedName) return;
    const novas = saved.filter((s) => s.name !== savedName);
    localStorage.setItem(SAVED_KEY, JSON.stringify(novas));
    setSaved(novas); setSavedName('');
  };
  const aplicarPesquisa = (nome: string) => {
    setSavedName(nome);
    const s = saved.find((x) => x.name === nome);
    if (!s) return;
    const f = s.filters;
    setQ(f.q || ''); setGuestQuery(f.guestQuery || ''); setCodigo(f.codigo || '');
    setDateMode(f.dateMode || 'fixed'); setCiOn(!!f.ciOn); setCoOn(!!f.coOn);
    setCiFrom(f.ciFrom || ''); setCiTo(f.ciTo || ''); setCoFrom(f.coFrom || ''); setCoTo(f.coTo || '');
    setMinRooms(f.minRooms || ''); setRoomType(f.roomType || ''); setSegment(f.segment || '');
    setSubSegment(f.subSegment || ''); setChannel(f.channel || ''); setIsGuaranteed(!!f.isGuaranteed);
    setVoucher(f.voucher || ''); setRatePlan(f.ratePlan || '');
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f4f4f4] border-b border-[#c0c0c0] text-[11px]">
        <label className="flex items-center gap-2">
          <span className="font-semibold text-[#444]">Hotel:</span>
          {hotels.length > 1 ? (
            <select value={hotelId || String(hotels[0]?.id)}
              onChange={(e) => { setHotelId(e.target.value); localStorage.setItem('erp_hotel', e.target.value); }}
              className={selCls + ' min-w-[180px]'}>
              {hotels.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-[#a0a0a0] px-1.5 py-1 min-w-[180px]">
              <Building2 size={12} className="text-[#666]" /> {hotelName || '—'}
            </div>
          )}
        </label>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#444]">Pesquisas:</span>
          <select value={savedName} onChange={(e) => e.target.value ? aplicarPesquisa(e.target.value) : setSavedName('')} className={selCls}>
            <option value="">(Nova pesquisa)</option>
            {saved.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <button onClick={() => setShowSaveDialog(true)} title="Nova pesquisa" className="w-6 h-6 flex items-center justify-center rounded-full bg-[#3c3c3c] text-white"><Plus size={13} /></button>
          <button onClick={() => setShowSaveDialog(true)} className="flex items-center gap-1 px-2 py-1 border border-[#a0a0a0] bg-white hover:bg-[#eee]"><Save size={12} /> Gravar</button>
          <button onClick={apagarPesquisa} disabled={!savedName} className="flex items-center gap-1 px-2 py-1 border border-[#a0a0a0] bg-white hover:bg-[#eee] disabled:opacity-40"><Trash2 size={12} className="text-[#c0392b]" /> Apagar</button>
        </div>
      </div>
      <button onClick={() => setAvancadaAberta((o) => !o)}
        className="flex items-center justify-end gap-1 px-3 py-1 bg-[#e9edf1] border-b border-[#c0c7d0] text-[11px] font-semibold text-[#333] w-full hover:bg-[#dfe5eb]">
        Pesquisa Avançada {avancadaAberta ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {avancadaAberta && (
        <div className="flex gap-3 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0]">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[170px]">
            <Field label="Pesquisa livre:"><input value={q} onChange={(e) => setQ(e.target.value)} className={inputCls + ' w-full'} /></Field>
            <Field label="Hóspede:"><input value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} className={inputCls + ' w-full'} /></Field>
            <Field label="Incluir:">
              <div className="flex gap-1">
                <select disabled className={disabledSel + ' flex-1'} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Incluir'); }}>
                  <option>(nenhum)</option>
                </select>
                <input disabled placeholder="—" className={inputCls + ' w-16 text-gray-400'} />
              </div>
            </Field>
            <Field label="Nº Reserva:"><input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código do bloco" className={inputCls + ' w-full'} /></Field>
            <label className="flex items-center gap-1.5 text-gray-400 cursor-not-allowed" title="Ainda não está construído nesta fase do PMS." onClick={() => naoConstruido('Incluir hóspedes adicionais')}>
              <input type="checkbox" disabled /> Incluir hóspedes adicionais
            </label>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[190px]">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1"><input type="radio" checked={dateMode === 'fixed'} onChange={() => setDateMode('fixed')} /> Fixo</label>
              <label className="flex items-center gap-1"><input type="radio" checked={dateMode === 'period'} onChange={() => setDateMode('period')} /> Período</label>
            </div>
            <div className="flex items-center gap-1">
              <input type="checkbox" checked={ciOn} onChange={(e) => setCiOn(e.target.checked)} />
              <span className="w-[62px]">Check-In:</span>
              <input type="date" disabled={!ciOn} value={ciFrom} onChange={(e) => setCiFrom(e.target.value)} className={inputCls} />
              {dateMode === 'period' && <input type="date" disabled={!ciOn} value={ciTo} onChange={(e) => setCiTo(e.target.value)} className={inputCls} />}
            </div>
            <div className="flex items-center gap-1">
              <input type="checkbox" checked={coOn} onChange={(e) => setCoOn(e.target.checked)} />
              <span className="w-[62px]">Check-Out:</span>
              <input type="date" disabled={!coOn} value={coFrom} onChange={(e) => setCoFrom(e.target.value)} className={inputCls} />
              {dateMode === 'period' && <input type="date" disabled={!coOn} value={coTo} onChange={(e) => setCoTo(e.target.value)} className={inputCls} />}
            </div>
            <Field label="TipoReserva:">
              <select disabled className={disabledSel + ' w-full'} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('TipoReserva'); }}>
                <option>Normal</option>
              </select>
            </Field>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={ciOn && dateMode === 'fixed' && ciFrom === new Date().toISOString().slice(0, 10)}
                onChange={(e) => { if (e.target.checked) { setDateMode('fixed'); setCiOn(true); setCiFrom(new Date().toISOString().slice(0, 10)); } else setCiOn(false); }} />
              Check-In Hoje
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">Mín. quartos:
                <input type="number" min={0} value={minRooms} onChange={(e) => setMinRooms(e.target.value)} className={inputCls + ' w-14'} />
              </label>
              <label className="flex items-center gap-1 text-gray-400 cursor-not-allowed" title="Ainda não está construído nesta fase do PMS." onClick={() => naoConstruido('Mín. adultos')}>
                Mín. adultos:
                <input disabled value={minAdults} onChange={(e) => setMinAdults(e.target.value)} className={inputCls + ' w-14 text-gray-400'} />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[170px]">
            <Field label="Categoria:">
              <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {rtList.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </Field>
            <Field label="Quarto:">
              <div className="flex items-center gap-2">
                <input disabled placeholder="—" className={inputCls + ' flex-1 text-gray-400'} title="Ainda não está construído nesta fase do PMS." onFocus={(e) => { e.target.blur(); naoConstruido('Quarto'); }} />
                <label className="flex items-center gap-1 text-gray-400">sem: <input type="checkbox" disabled /></label>
              </div>
            </Field>
            <Field label="Package:">
              <select disabled className={disabledSel + ' w-full'} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Package'); }}>
                <option>(Todos)</option>
              </select>
            </Field>
            <Field label="Lista Preços:">
              <select disabled className={disabledSel + ' w-full'} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Lista de Preços'); }}>
                <option>(Todos)</option>
              </select>
            </Field>
            <Field label="Allotment:">
              <select disabled className={disabledSel + ' w-full'} title="O próprio bloco é o allotment." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Allotment'); }}>
                <option>(Todos)</option>
              </select>
            </Field>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[170px]">
            <Field label="Segmento:">
              <select value={segment} onChange={(e) => { setSegment(e.target.value); setSubSegment(''); }} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {segList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Sub-Segmento:">
              <select value={subSegment} onChange={(e) => setSubSegment(e.target.value)} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {subList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Canal de Dist.:">
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {chList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={isGuaranteed} onChange={(e) => setIsGuaranteed(e.target.checked)} /> Garantido</label>
            <Field label="Voucher:"><input value={voucher} onChange={(e) => setVoucher(e.target.value)} className={inputCls + ' w-full'} /></Field>
            <Field label="Tipo de oferta:">
              <select disabled className={disabledSel + ' w-full'} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Tipo de oferta'); }}>
                <option>(Todos)</option>
              </select>
            </Field>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[190px]">
            <Field label="Canal online:">
              <select disabled className={disabledSel + ' w-full'} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Canal online'); }}>
                <option>(Todos)</option>
              </select>
            </Field>
            <Field label="Rate Code:">
              <select value={ratePlan} onChange={(e) => setRatePlan(e.target.value)} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {rpList.map((rp: any) => <option key={rp.id} value={rp.id}>{rp.code}</option>)}
              </select>
            </Field>
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 text-gray-400 cursor-not-allowed" title="Ainda não está construído nesta fase do PMS." onClick={() => naoConstruido('Apenas reservas automáticas')}>
                <input type="checkbox" disabled /> Apenas reservas automáticas
              </label>
              <button onClick={exportarExcel} className="flex items-center gap-1.5 px-2 py-1 border border-[#a0a0a0] bg-white hover:bg-[#eee] ml-auto"><FileSpreadsheet size={13} /> Excel</button>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={autoUpdate} onChange={(e) => setAutoUpdate(e.target.checked)} /> Atualização automática
              </label>
              <button onClick={() => setAutoUpdate((v) => !v)}
                className={`flex items-center gap-1.5 px-2 py-1 border border-[#a0a0a0] ml-auto ${autoUpdate ? 'bg-[#2b7a3b] text-white' : 'bg-white hover:bg-[#eee]'}`}>
                <RefreshCw size={13} /> Auto
              </button>
            </div>
            <Field label="Modo Visualização:">
              <select className={selCls + ' w-full'} defaultValue="Detalhado" onChange={(e) => { if (e.target.value !== 'Detalhado') { naoConstruido(e.target.value); e.target.value = 'Detalhado'; } }}>
                <option>Detalhado</option>
                <option>Compacto</option>
              </select>
            </Field>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={ocultarAposPesquisa} onChange={(e) => setOcultarAposPesquisa(e.target.checked)} /> Ocultar filtros após pesquisa</label>
          </div>

          <button onClick={pesquisar}
            className="w-[110px] flex-shrink-0 flex flex-col items-center justify-center gap-1 text-white font-bold text-[13px]"
            style={{ background: '#2b2b2b' }}>
            <RefreshCw size={20} /> Pesquisar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white">
        <div className="grid text-[11px] font-semibold text-[#555] border-b border-[#d0d0d0] bg-[#f7f7f7] sticky top-0 z-10"
          style={{ gridTemplateColumns: '8% 8% 24% 20% 22% 18%' }}>
          <div className="px-3 py-2">Hotel</div>
          <div className="px-3 py-2">Ações</div>
          <div className="px-3 py-2">Resumo</div>
          <div className="px-3 py-2">Entidades</div>
          <div className="px-3 py-2">Informações</div>
          <div className="px-3 py-2">Pagamento</div>
        </div>
        {isLoading ? <div className="p-4 text-gray-400 text-[12px]">A carregar…</div> : pageRows.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-[12px]">Nenhum registo encontrado.</div>
        ) : pageRows.map((b: any) => (
          <div key={b.id} onClick={() => setSelId(b.id)}
            className={`grid border-b border-[#e3e3e3] cursor-pointer text-[12px] ${selId === b.id ? 'bg-[#e4f0ff]' : 'hover:bg-[#f7fafd]'}`}
            style={{ gridTemplateColumns: '8% 8% 24% 20% 22% 18%' }}>
            <div className="px-3 py-3 flex items-start gap-2 text-[#333]">
              <Building2 size={14} className="text-[#8a95a3] flex-shrink-0 mt-0.5" /><span className="truncate">{hotelName || '—'}</span>
            </div>
            <div className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
              <button title="Ver Pickup" onClick={() => setShowPickup(b)}
                className="w-7 h-7 rounded flex items-center justify-center bg-[#eaf1fb] text-blue-700"><Eye size={14} /></button>
            </div>
            <div className="px-3 py-3 leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[15px]">{b.code}</span>
                {b.is_guaranteed && <span className="text-[10px] text-white font-semibold px-2 py-0.5 rounded bg-[#3ea34e]">Garantido</span>}
              </div>
              <div className="text-[11px] text-gray-600">{b.description}</div>
              <div className="mt-0.5">
                <span className="text-green-700">{b.valid_from}</span> <span className="text-gray-400">→</span> <span className="text-red-600">{b.valid_to}</span>
                <span className="text-gray-400"> · {b.nights} noite(s)</span>
              </div>
            </div>
            <div className="px-3 py-3 leading-tight">
              <div className="font-semibold">{b.main_entity_name || b.group_name || '—'}</div>
              {b.contact_name && <div className="text-[10px] text-gray-500">{b.contact_name}</div>}
              {b.default_voucher && <div className="text-[10px] text-gray-500">Voucher {b.default_voucher}</div>}
            </div>
            <div className="px-3 py-3 leading-tight">
              <div>{b.total_rooms || 0} quarto(s) bloqueado(s)</div>
              <div className="text-[10px] text-gray-500">{b.reservations_count || 0} reserva(s) pickup</div>
              {b.default_rate_plan_code && <div className="text-[10px] text-gray-500">{b.default_rate_plan_code}</div>}
            </div>
            <div className="px-3 py-3 leading-tight">
              {Number(b.contract_value) > 0
                ? <div className="font-bold">{Number(b.contract_value).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} Kz</div>
                : <span className="text-gray-400">—</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 px-3 py-1 border-t border-[#c0c0c0] bg-[#f4f4f4] text-[11px] flex-wrap">
        <label className="flex items-center gap-1">Nº registos a visualizar:
          <select value={pageSize} disabled className={selCls + ' min-w-0 opacity-60'}><option>{pageSize}</option></select>
        </label>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="disabled:opacity-30"><ChevronsLeft size={14} /></button>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-30">◀</button>
          <span>Página {page} de {totalPaginas}</span>
          <button disabled={page >= totalPaginas} onClick={() => setPage(page + 1)} className="disabled:opacity-30">▶</button>
          <button disabled={page >= totalPaginas} onClick={() => setPage(totalPaginas)} className="disabled:opacity-30"><ChevronsRight size={14} /></button>
        </div>
        <span className="ml-auto text-gray-500">{rows.length === 0 ? 'Não foram encontrados dados.' : `${rows.length} registo(s)`}</span>
      </div>

      <div className="flex items-center gap-1 p-1.5 border-t border-[#c0c0c0] bg-[#f4f4f4]">
        <ToolBtn icon={BedDouble} label="Nova Reserva" color="#3ea34e" onClick={() => setShowNew(true)} />
        <span className="w-px h-5 bg-[#c0c0c0] mx-1" />
        <ToolBtn icon={Copy} label="Copiar reserva" disabled={!sel} onClick={() => setShowCopy(true)} />
      </div>

      {showNew && (
        <PmsNewReservationDialog roomTypes={rtList} onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refetch(); }} />
      )}
      {showCopy && sel && (
        <PmsBlockEditorDialog copyFrom={sel} onClose={() => setShowCopy(false)} onSaved={() => { setShowCopy(false); refetch(); }} />
      )}
      {showPickup && <PickupDialog block={showPickup} onClose={() => setShowPickup(null)} />}
      {showSaveDialog && (
        <PmsSaveSearchDialog initial={savedName} onCancel={() => setShowSaveDialog(false)} onConfirm={confirmarGravarPesquisa} />
      )}
    </div>
  );
}
