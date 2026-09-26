import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Copy, LogIn, LogOut, XCircle, Repeat, Bed, BedDouble, Wallet, ChevronDown, ChevronUp,
  Building2, Printer, RefreshCw, Save, Trash2, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar } from '../../ui/dialogo';
import { RADIUS, SHADOW } from '../../config/theme';
import PmsFolioPanel from './PmsFolioPanel';
import PmsNewReservationDialog from './PmsNewReservationDialog';
import PmsQuickAssignDialog from './PmsQuickAssignDialog';
import PmsBulkRoomChangeDialog from './PmsBulkRoomChangeDialog';
import PmsReservationDetailDialog from './PmsReservationDetailDialog';
import PmsSaveSearchDialog from './PmsSaveSearchDialog';
import PmsCheckInDialog from './PmsCheckInDialog';
import { STATUS_LABEL, STATUS_COLOR, SOURCE_LABEL } from './reservationStatus';

const SAVED_KEY = 'pms_saved_searches';

const fmtDT = (iso: string) => iso ? new Date(iso).toLocaleString('pt-PT', {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
}) : '—';
const fmtD = (iso: string) => iso ? new Date(iso).toLocaleDateString('pt-PT', {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
}) : '—';
const COLS = '8% 8% 24% 18% 24% 18%';

/** Uma reserva = um bloco rico (não uma linha fina de tabela clássica) — é
 * assim que o PMS de referência mostra, diferente do estilo de grelha do POS. */
function ReservationRow({ r, hotelName, selected, onSelect, onCheckIn, onCheckOut, onCancel, onVerConta }: any) {
  return (
    <div onClick={onSelect}
      className={`grid border-b border-[#EEF4F5] cursor-pointer text-[12px] ${selected ? 'bg-[#F7FAFA]' : 'hover:bg-[#FFFFFF]'}`}
      style={{ gridTemplateColumns: COLS }}>
      <div className="px-3 py-3 flex items-start gap-2 text-[#041F24]">
        <Building2 size={14} className="text-[#7FA9B1] flex-shrink-0 mt-0.5" />
        <span className="truncate">{hotelName || '—'}</span>
      </div>
      <div className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-2 gap-1 w-fit">
          <button title="Check-in" disabled={r.status !== 'OPTION' && r.status !== 'BOOKED'} onClick={() => onCheckIn(r)}
            className="w-7 h-7 rounded flex items-center justify-center bg-[#F7FAFA] text-[#062A31] disabled:opacity-30 disabled:bg-[#F7FAFA]"><LogIn size={14} /></button>
          <button title="Check-out" disabled={r.status !== 'CHECKED_IN'} onClick={() => onCheckOut(r.id)}
            className="w-7 h-7 rounded flex items-center justify-center bg-[#F7FAFA] text-[#062A31] disabled:opacity-30 disabled:bg-[#F7FAFA]"><LogOut size={14} /></button>
          <button title="Cancelar" disabled={r.status === 'CHECKED_OUT' || r.status === 'CANCELLED'} onClick={() => onCancel(r.id)}
            className="w-7 h-7 rounded flex items-center justify-center bg-[#F7FAFA] text-[#8C2B1F] disabled:opacity-30 disabled:bg-[#F7FAFA]"><XCircle size={14} /></button>
          <button title="Ver Conta" onClick={() => onVerConta(r)}
            className="w-7 h-7 rounded flex items-center justify-center bg-[#F7FAFA] text-[#5C8891]"><Wallet size={14} /></button>
        </div>
      </div>
      <div className="px-3 py-3 leading-tight">
        <div className="text-[10px] text-gray-400">{fmtDT(r.created_at)}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-bold text-[15px]">{r.confirmation}</span>
          <span className="text-[10px] text-white font-semibold px-2 py-0.5 rounded" style={{ background: STATUS_COLOR[r.status] || '#5C8891' }}>
            {STATUS_LABEL[r.status] || r.status}
          </span>
        </div>
        <div className="text-[11px] text-gray-600">{r.room_type_name}{r.rate_plan_code ? ` · ${r.rate_plan_code}` : ''} · Pax {r.adults}/{r.children}</div>
        <div className="mt-0.5">
          <span className="text-[#062A31]">{fmtD(r.check_in)}</span> <span className="text-gray-400">→</span> <span className="text-[#8C2B1F]">{fmtD(r.check_out)}</span>
        </div>
        {Number(r.rate) > 0 && <div className="font-bold text-[13px] mt-0.5">{Number(r.rate).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} Kz</div>}
      </div>
      <div className="px-3 py-3 leading-tight">
        <div className="font-semibold">{r.guest_name}</div>
        {r.guest_tax_id && <div className="text-[10px] text-gray-500">NIF {r.guest_tax_id}</div>}
        {r.segment_name && <div className="text-[10px] text-gray-500">{r.segment_name}{r.channel_name ? ` · ${r.channel_name}` : ''}</div>}
      </div>
      <div className="px-3 py-3 leading-tight">
        <div>{r.room_number ? `Quarto ${r.room_number}` : 'Sem quarto atribuído'}</div>
        {r.block_code && <div className="text-[10px] text-gray-500">Bloco {r.block_code}</div>}
        {r.voucher && <div className="text-[10px] text-gray-500">Voucher {r.voucher}</div>}
        {r.is_guaranteed && <div className="text-[10px] text-[#062A31]">Garantido</div>}
      </div>
      <div className="px-3 py-3 leading-tight" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onVerConta(r)} className="text-[11px] px-2 py-1 border border-[#CFE3E6] bg-white hover:bg-[#F7FAFA] rounded-[6px] transition-colors">Ver Conta</button>
        <div className="text-[10px] text-gray-500 mt-1">{r.folios_count || 0} conta(s) ativa(s)</div>
        {r.folio_balance != null && (
          <div className={`font-bold ${Number(r.folio_balance) > 0 ? 'text-[#8C2B1F]' : 'text-[#062A31]'}`}>{r.folio_balance}</div>
        )}
      </div>
    </div>
  );
}

const naoConstruido = (label: string) => aviso(`"${label}" ainda não está construído nesta fase do PMS.`);

/** Botão da barra inferior — plano, sem moldura em relevo (esse era o estilo
 * clássico do ERP antigo; o PMS usa ícone em círculo colorido + texto). */
function ToolBtn({ icon: Icon, label, onClick, disabled, color = '#041F24' }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 px-2 py-1.5 text-[12px] font-semibold text-[#041F24] disabled:opacity-40 disabled:cursor-default hover:bg-[#EEF4F5]">
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: disabled ? '#CFE3E6' : color }}>
        <Icon size={13} />
      </span>
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px]">
      <span className="text-[#062A31] font-semibold whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}
const inputCls = 'border border-[#7FA9B1] px-1.5 py-1 text-[11px] bg-white rounded-[6px]';
const selCls = 'border border-[#7FA9B1] px-1.5 py-1 text-[11px] bg-white min-w-[130px] rounded-[6px]';

function loadSaved(): { name: string; filters: any }[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}

export default function PmsReservationsView({ autoMode, onCloseDialog }: { autoMode?: boolean; onCloseDialog?: () => void } = {}) {
  const qc = useQueryClient();

  // ---------- Pesquisa livre / hóspede ----------
  const [q, setQ] = useState('');
  const [guestQuery, setGuestQuery] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [createdOn, setCreatedOn] = useState(false);
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  // ---------- Datas / tipo ----------
  const [dateMode, setDateMode] = useState<'fixed' | 'period'>('fixed');
  const [ciOn, setCiOn] = useState(false);
  const [coOn, setCoOn] = useState(false);
  const [ciFrom, setCiFrom] = useState('');
  const [ciTo, setCiTo] = useState('');
  const [coFrom, setCoFrom] = useState('');
  const [coTo, setCoTo] = useState('');
  const [source, setSource] = useState('');

  // ---------- Categoria / quarto ----------
  const [roomType, setRoomType] = useState('');
  const [roomQuery, setRoomQuery] = useState('');
  const [semQuarto, setSemQuarto] = useState(false);
  const [ratePlan, setRatePlan] = useState('');
  const [allotment, setAllotment] = useState('');

  // ---------- Comercial ----------
  const [segment, setSegment] = useState('');
  const [subSegment, setSubSegment] = useState('');
  const [channel, setChannel] = useState('');
  const [isGuaranteed, setIsGuaranteed] = useState(false);
  const [voucher, setVoucher] = useState('');
  const [status, setStatus] = useState('');

  // ---------- Visualização ----------
  const [apenasAuto, setApenasAuto] = useState(!!autoMode);
  const [autoUpdate, setAutoUpdate] = useState(!!autoMode);
  const [ocultarAposPesquisa, setOcultarAposPesquisa] = useState(false);
  const [avancadaAberta, setAvancadaAberta] = useState(true);
  const [showAutoDialog, setShowAutoDialog] = useState(false);

  const [selId, setSelId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showBulkChange, setShowBulkChange] = useState(false);
  const [showQuickAssign, setShowQuickAssign] = useState(false);
  const [showFolio, setShowFolio] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState<any>(null);
  const [showFuncoes, setShowFuncoes] = useState(false);
  const [copying, setCopying] = useState(false);

  // ---------- Pesquisas guardadas ----------
  const [savedName, setSavedName] = useState('');
  const [saved, setSaved] = useState(loadSaved());
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // ---------- Ordenação / paginação ----------
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'A-Z' | 'Z-A'>('Z-A');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data: myHotels } = useQuery({
    queryKey: ['auth', 'hotels'],
    queryFn: async () => (await apiClient.get('auth/hotels/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const hotels: any[] = myHotels?.hotels || [];
  // Mesma chave que o rodapé do PmsShell usa — trocar aqui ou lá fica sincronizado.
  const [hotelId, setHotelId] = useState(() => localStorage.getItem('erp_hotel') || '');
  const hotelName = hotels.find((h: any) => String(h.id) === hotelId)?.name || hotels[0]?.name || '';

  const { data: roomTypes } = useQuery({
    queryKey: ['pms', 'room-types'],
    queryFn: async () => (await apiClient.get('pms/room-types/')).data,
  });
  const rtList = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];

  const { data: ratePlans } = useQuery({
    queryKey: ['pms', 'rate-plans', roomType],
    queryFn: async () => (await apiClient.get('pms/rate-plans/', { params: { room_type: roomType || undefined } })).data,
  });
  const rpList = Array.isArray(ratePlans) ? ratePlans : ratePlans?.results || [];

  const { data: blocks } = useQuery({ queryKey: ['pms', 'blocks'], queryFn: async () => (await apiClient.get('pms/blocks/')).data });
  const blockList = Array.isArray(blocks) ? blocks : blocks?.results || [];

  const { data: segments } = useQuery({ queryKey: ['pos', 'segments'], queryFn: async () => (await apiClient.get('pos/config/segments/')).data });
  const segList = (Array.isArray(segments) ? segments : segments?.results || []).filter((s: any) => s.for_pms !== false);
  const { data: subSegments } = useQuery({ queryKey: ['pos', 'subsegments'], queryFn: async () => (await apiClient.get('pos/config/subsegments/')).data });
  const subList = (Array.isArray(subSegments) ? subSegments : subSegments?.results || [])
    .filter((s: any) => s.for_pms !== false && (!segment || String(s.segment) === segment));
  const { data: channels } = useQuery({ queryKey: ['pos', 'channels'], queryFn: async () => (await apiClient.get('pos/config/channels/')).data });
  const chList = (Array.isArray(channels) ? channels : channels?.results || []).filter((c: any) => c.for_pms !== false);

  const params: any = {
    q: q || undefined, confirmation: confirmation || undefined, status: status || undefined,
    source: apenasAuto ? 'ONLINE' : (source || undefined),
    room_type: roomType || undefined, room: roomQuery || undefined, no_room: semQuarto ? '1' : undefined,
    block: allotment || undefined, rate_plan: ratePlan || undefined,
    segment: segment || undefined, sub_segment: subSegment || undefined, channel: channel || undefined,
    is_guaranteed: isGuaranteed ? '1' : undefined, voucher: voucher || undefined,
  };
  if (guestQuery) params.q = params.q ? `${params.q} ${guestQuery}` : guestQuery;
  if (ciOn) {
    if (dateMode === 'fixed' && ciFrom) { params.check_in_from = ciFrom; params.check_in_to = ciFrom; }
    else { if (ciFrom) params.check_in_from = ciFrom; if (ciTo) params.check_in_to = ciTo; }
  }
  if (coOn) {
    if (dateMode === 'fixed' && coFrom) { params.check_out_from = coFrom; params.check_out_to = coFrom; }
    else { if (coFrom) params.check_out_from = coFrom; if (coTo) params.check_out_to = coTo; }
  }
  if (createdOn) { if (createdFrom) params.created_from = createdFrom; if (createdTo) params.created_to = createdTo; }

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['pms', 'reservations', params],
    queryFn: async () => (await apiClient.get('pms/reservations/', { params })).data,
    refetchInterval: autoUpdate ? 30000 : false,
  });
  const rawRows = Array.isArray(data) ? data : data?.results || [];

  const SORT_ACCESSOR: Record<string, (r: any) => any> = {
    created_at: (r) => r.created_at, check_in: (r) => r.check_in, check_out: (r) => r.check_out,
    guest_name: (r) => r.guest_name, confirmation: (r) => r.confirmation,
  };
  const sortedRows = [...rawRows].sort((a, b) => {
    const av = SORT_ACCESSOR[sortField](a), bv = SORT_ACCESSOR[sortField](b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'A-Z' ? cmp : -cmp;
  });
  const totalPaginas = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const rows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const sel = rawRows.find((r: any) => r.id === selId);

  const pesquisar = () => {
    setPage(1);
    refetch();
    if (ocultarAposPesquisa) setAvancadaAberta(false);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['pms'] });

  const doCheckOut = async (id: number) => {
    try { await apiClient.post(`pms/reservations/${id}/check_out/`, {}); invalidate(); }
    catch (e) { notifyError(e); }
  };
  const doCancel = async (id: number) => {
    if (!(await confirmar('Cancelar esta reserva?', 'Confirmar', 'perigo'))) return;
    try { await apiClient.post(`pms/reservations/${id}/cancel/`, {}); invalidate(); }
    catch (e) { notifyError(e); }
  };
  const doCopy = async () => {
    if (!sel) return;
    if (!(await confirmar(`Copiar a reserva ${sel.confirmation} (mesmo hóspede, categoria e datas)?`, 'Copiar reserva'))) return;
    setCopying(true);
    try {
      await apiClient.post('pms/reservations/', {
        guest: sel.guest, room_type: sel.room_type, check_in: sel.check_in, check_out: sel.check_out,
        adults: sel.adults, children: sel.children, rate: sel.rate, rate_plan: sel.rate_plan,
        segment: sel.segment, sub_segment: sel.sub_segment, channel: sel.channel,
        is_guaranteed: sel.is_guaranteed, status: 'BOOKED',
      });
      invalidate();
    } catch (e) { notifyError(e); } finally { setCopying(false); }
  };

  // Impressão via iframe escondido (não janela nova) — uma janela nova traz sempre
  // a moldura do navegador (barra de endereço, abas) para dentro da pré-visualização
  // de impressão; um iframe só imprime o conteúdo, como nos sistemas de referência.
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const imprimir = () => {
    const linhas = sortedRows.map((r: any) =>
      `<tr><td>${esc(r.confirmation)}</td><td>${esc(r.guest_name)}</td><td>${esc(r.room_type_name)}</td>` +
      `<td>${esc(r.check_in)}</td><td>${esc(r.check_out)}</td><td>${esc(STATUS_LABEL[r.status] || r.status)}</td></tr>`).join('');
    const html = `<html><head><title>Reservas — ${esc(hotelName)}</title><style>
      body{font-family:sans-serif;font-size:12px;margin:16px}
      h3{margin:0 0 12px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #999;padding:4px 6px;text-align:left}
      th{background:#F0F0F0}
    </style></head><body>` +
      `<h3>Reservas — ${esc(hotelName)}</h3><table>` +
      `<tr><th>Confirmação</th><th>Hóspede</th><th>Categoria</th><th>Check-In</th><th>Check-Out</th><th>Estado</th></tr>${linhas}</table>` +
      `</body></html>`;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentWindow?.document;
    if (!doc) { document.body.removeChild(frame); return; }
    doc.open(); doc.write(html); doc.close();
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => document.body.removeChild(frame), 1000);
    };
  };

  const confirmarGravarPesquisa = (nome: string) => {
    if (!nome) return;
    const filtros = { q, guestQuery, confirmation, dateMode, ciOn, coOn, ciFrom, ciTo, coFrom, coTo,
      source, roomType, roomQuery, semQuarto, ratePlan, allotment, segment, subSegment, channel,
      isGuaranteed, voucher, status };
    const novas = [...saved.filter((s) => s.name !== nome), { name: nome, filters: filtros }];
    localStorage.setItem(SAVED_KEY, JSON.stringify(novas));
    setSaved(novas);
    setSavedName(nome);
    setShowSaveDialog(false);
  };
  const apagarPesquisa = () => {
    if (!savedName) return;
    const novas = saved.filter((s) => s.name !== savedName);
    localStorage.setItem(SAVED_KEY, JSON.stringify(novas));
    setSaved(novas);
    setSavedName('');
  };
  const aplicarPesquisa = (nome: string) => {
    setSavedName(nome);
    const s = saved.find((x) => x.name === nome);
    if (!s) return;
    const f = s.filters;
    setQ(f.q || ''); setGuestQuery(f.guestQuery || ''); setConfirmation(f.confirmation || '');
    setDateMode(f.dateMode || 'fixed'); setCiOn(!!f.ciOn); setCoOn(!!f.coOn);
    setCiFrom(f.ciFrom || ''); setCiTo(f.ciTo || ''); setCoFrom(f.coFrom || ''); setCoTo(f.coTo || '');
    setSource(f.source || ''); setRoomType(f.roomType || ''); setRoomQuery(f.roomQuery || '');
    setSemQuarto(!!f.semQuarto); setRatePlan(f.ratePlan || ''); setAllotment(f.allotment || '');
    setSegment(f.segment || ''); setSubSegment(f.subSegment || ''); setChannel(f.channel || '');
    setIsGuaranteed(!!f.isGuaranteed); setVoucher(f.voucher || ''); setStatus(f.status || '');
  };

  return (
    <>
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F7FAFA] border-b border-[#CFE3E6] text-[11px]">
        <label className="flex items-center gap-2">
          <span className="font-semibold text-[#062A31]">Hotel:</span>
          {hotels.length > 1 ? (
            <select value={hotelId || String(hotels[0]?.id)}
              onChange={(e) => { setHotelId(e.target.value); localStorage.setItem('erp_hotel', e.target.value); }}
              className={selCls + ' min-w-[180px]'}>
              {hotels.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-[#7FA9B1] px-1.5 py-1 min-w-[180px]">
              <Building2 size={12} className="text-[#5C8891]" /> {hotelName || '—'}
            </div>
          )}
        </label>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#062A31]">Pesquisas:</span>
          <select value={savedName} onChange={(e) => e.target.value ? aplicarPesquisa(e.target.value) : setSavedName('')} className={selCls}>
            <option value="">(Nova pesquisa)</option>
            {saved.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <button onClick={() => setShowSaveDialog(true)} title="Nova pesquisa" className="w-6 h-6 flex items-center justify-center rounded-full bg-[#062A31] text-white hover:brightness-110 transition-[filter]"><Plus size={13} /></button>
          <button onClick={() => setShowSaveDialog(true)} className="flex items-center gap-1 px-2.5 py-1 border border-[#CFE3E6] bg-white hover:bg-[#F7FAFA] rounded-[6px] transition-colors"><Save size={12} /> Gravar</button>
          <button onClick={apagarPesquisa} disabled={!savedName} className="flex items-center gap-1 px-2.5 py-1 border border-[#CFE3E6] bg-white hover:bg-[#F7FAFA] disabled:opacity-40 rounded-[6px] transition-colors"><Trash2 size={12} className="text-[#B0392B]" /> Apagar</button>
        </div>
      </div>
      <button onClick={() => setAvancadaAberta((o) => !o)}
        className="flex items-center justify-end gap-1 px-3 py-1 bg-[#F7FAFA] border-b border-[#CFE3E6] text-[11px] font-semibold text-[#041F24] w-full hover:bg-[#EEF4F5]">
        Pesquisa Avançada {avancadaAberta ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {avancadaAberta && (
        <div className="flex gap-4 p-3 bg-[#F7FAFA] border-b border-[#EEF4F5]">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[170px]">
            <div className="text-[10px] font-bold uppercase text-[#5C8891] mb-0.5">Pesquisa</div>
            <Field label="Pesquisa livre:"><input value={q} onChange={(e) => setQ(e.target.value)} className={inputCls + ' w-full'} /></Field>
            <Field label="Hóspede:"><input value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} className={inputCls + ' w-full'} /></Field>
            <Field label="Nº Reserva:"><input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={inputCls + ' w-full'} /></Field>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={createdOn} onChange={(e) => setCreatedOn(e.target.checked)} /> De (Criação):
              <input type="date" disabled={!createdOn} value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className={inputCls} />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="invisible"><input type="checkbox" /></span> Até (Criação):
              <input type="date" disabled={!createdOn} value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className={inputCls} />
            </label>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[190px]">
            <div className="text-[10px] font-bold uppercase text-[#5C8891] mb-0.5">Datas</div>
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
              <select value={source} onChange={(e) => setSource(e.target.value)} className={selCls}>
                <option value="">(Todos)</option>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={ciOn && dateMode === 'fixed' && ciFrom === new Date().toISOString().slice(0, 10)}
                onChange={(e) => { if (e.target.checked) { setDateMode('fixed'); setCiOn(true); setCiFrom(new Date().toISOString().slice(0, 10)); } else setCiOn(false); }} />
              Check-In Hoje
            </label>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[170px]">
            <div className="text-[10px] font-bold uppercase text-[#5C8891] mb-0.5">Quarto / Tarifa</div>
            <Field label="Categoria:">
              <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {rtList.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </Field>
            <div className="flex items-end gap-2">
              <Field label="Quarto:"><input value={roomQuery} onChange={(e) => setRoomQuery(e.target.value)} className={inputCls + ' flex-1 min-w-0'} /></Field>
              <label className="flex items-center gap-1 pb-1 flex-shrink-0"><input type="checkbox" checked={semQuarto} onChange={(e) => setSemQuarto(e.target.checked)} /> sem:</label>
            </div>
            <Field label="Package:">
              <select value={ratePlan} onChange={(e) => setRatePlan(e.target.value)} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {rpList.map((rp: any) => <option key={rp.id} value={rp.id}>{rp.code}</option>)}
              </select>
            </Field>
            <Field label="Allotment:">
              <select value={allotment} onChange={(e) => setAllotment(e.target.value)} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {blockList.map((b: any) => <option key={b.id} value={b.id}>{b.code}</option>)}
              </select>
            </Field>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[170px]">
            <div className="text-[10px] font-bold uppercase text-[#5C8891] mb-0.5">Comercial</div>
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
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[190px]">
            <div className="text-[10px] font-bold uppercase text-[#5C8891] mb-0.5">Visualização</div>
            <Field label="Estado:">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={selCls + ' w-full'}>
                <option value="">(Todos)</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer" title="Reservas com origem Online (channel/booking automático), sem intervenção da receção.">
                <input type="checkbox" checked={apenasAuto} onChange={(e) => setApenasAuto(e.target.checked)} /> Apenas reservas automáticas
              </label>
              <button onClick={imprimir} className="flex items-center gap-1.5 px-2 py-1 border border-[#CFE3E6] bg-white hover:bg-[#F7FAFA] rounded-[6px] transition-colors ml-auto"><Printer size={13} /> Imprimir</button>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={autoUpdate} onChange={(e) => setAutoUpdate(e.target.checked)} /> Atualização automática
              </label>
              {!autoMode && (
                <button onClick={() => setShowAutoDialog(true)}
                  className="flex items-center gap-1.5 px-2 py-1 border border-[#CFE3E6] bg-white hover:bg-[#F7FAFA] rounded-[6px] transition-colors ml-auto">
                  <RefreshCw size={13} /> Auto
                </button>
              )}
            </div>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={ocultarAposPesquisa} onChange={(e) => setOcultarAposPesquisa(e.target.checked)} /> Ocultar filtros após pesquisa</label>
          </div>

          <button onClick={pesquisar}
            className="w-[110px] flex-shrink-0 flex flex-col items-center justify-center gap-1 text-white font-bold text-[13px] hover:brightness-110 transition-[filter]"
            style={{ background: '#062A31', borderRadius: RADIUS.md, boxShadow: SHADOW.soft }}>
            <RefreshCw size={20} /> Pesquisar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white">
        <div className="grid text-[11px] font-semibold text-[#062A31] border-b border-[#EEF4F5] bg-[#F7FAFA] sticky top-0 z-10"
          style={{ gridTemplateColumns: COLS }}>
          <div className="px-3 py-2">Hotel</div>
          <div className="px-3 py-2">Ações</div>
          <div className="px-3 py-2">Resumo</div>
          <div className="px-3 py-2">Entidades</div>
          <div className="px-3 py-2">Informações</div>
          <div className="px-3 py-2">Pagamento</div>
        </div>
        {isLoading ? <div className="p-4 text-gray-400 text-[12px]">A carregar…</div> : rows.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-[12px]">Nenhum registo encontrado.</div>
        ) : rows.map((r: any) => (
          <ReservationRow key={r.id} r={r} hotelName={hotelName} selected={selId === r.id}
            onSelect={() => { setSelId(r.id); setShowDetail(true); }} onCheckIn={setCheckInTarget} onCheckOut={doCheckOut} onCancel={doCancel}
            onVerConta={(row: any) => { setSelId(row.id); setShowFolio(true); }} />
        ))}
      </div>

      <div className="flex items-center gap-3 px-3 py-1 border-t border-[#CFE3E6] bg-[#F7FAFA] text-[11px] flex-wrap">
        <label className="flex items-center gap-1">Ordenar:
          <select value={sortField} onChange={(e) => setSortField(e.target.value)} className={selCls + ' min-w-0'}>
            <option value="created_at">Data de criação</option>
            <option value="check_in">Check-In</option>
            <option value="check_out">Check-Out</option>
            <option value="guest_name">Hóspede</option>
            <option value="confirmation">Confirmação</option>
          </select>
        </label>
        <select value={sortDir} onChange={(e) => setSortDir(e.target.value as any)} className={selCls + ' min-w-0'}>
          <option value="A-Z">A-Z</option>
          <option value="Z-A">Z-A</option>
        </select>
        <label className="flex items-center gap-1">Nº registos a visualizar:
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className={selCls + ' min-w-0'}>
            <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="disabled:opacity-30"><ChevronsLeft size={14} /></button>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-30"><ChevronUp size={14} className="rotate-[-90deg]" /></button>
          <span>Página {page} de {totalPaginas}</span>
          <button disabled={page >= totalPaginas} onClick={() => setPage(page + 1)} className="disabled:opacity-30"><ChevronUp size={14} className="rotate-90" /></button>
          <button disabled={page >= totalPaginas} onClick={() => setPage(totalPaginas)} className="disabled:opacity-30"><ChevronsRight size={14} /></button>
        </div>
        <span className="ml-auto text-gray-500">{sortedRows.length === 0 ? 'Não foram encontrados dados.' : `${sortedRows.length} registo(s)`}</span>
      </div>

      <div className="flex items-center gap-1 p-1.5 border-t border-[#CFE3E6] bg-[#F7FAFA] relative">
        {!autoMode && <ToolBtn icon={BedDouble} label="Nova reserva" color="#5C8891" onClick={() => setShowNew(true)} />}
        <ToolBtn icon={Copy} label={copying ? 'A copiar…' : 'Copiar reserva'} disabled={!sel || copying} onClick={doCopy} />
        <div className="relative">
          <button onClick={() => setShowFuncoes((o) => !o)} disabled={!sel}
            className="flex items-center gap-1 px-2 py-1.5 text-[12px] font-semibold text-[#041F24] disabled:opacity-40 hover:bg-[#EEF4F5]">
            Funções <ChevronDown size={12} />
          </button>
          {showFuncoes && sel && (
            <>
              <div className="fixed inset-0 z-[8000]" onClick={() => setShowFuncoes(false)} />
              <div className="absolute bottom-full left-0 mb-1.5 z-[8001] min-w-[220px] bg-white border border-[#EEF4F5] py-1 overflow-hidden" style={{ borderRadius: RADIUS.md, boxShadow: SHADOW.panel }}>
                {[
                  ['Instruções de Faturação', false], ['Encargos Fixos', false], ['Depósitos', false],
                  ['Vouchers', false], ['Comissões', false], ['Informação do pagamento', true],
                  ['Recriar conta', false], ['Cartão de Hóspede', false], ['Key Pass', false],
                  ['Edit Statistics Codes', false],
                ].map(([label, real]: any) => (
                  <button key={label} onClick={() => { setShowFuncoes(false); real ? setShowFolio(true) : naoConstruido(label); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[#F7FAFA] ${real ? '' : 'text-gray-400'}`}>
                    {real ? <Wallet size={13} /> : <span className="w-[13px]" />} {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <ToolBtn icon={Repeat} label="Mudanças de Quartos" onClick={() => setShowBulkChange(true)} />
        <ToolBtn icon={Bed} label="Atribuição rápida de quartos" color="#5C8891" onClick={() => setShowQuickAssign(true)} />
        {autoMode && onCloseDialog && (
          <button onClick={onCloseDialog} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#041F24] hover:text-black ml-auto">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B0392B] text-white"><XCircle size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        )}
      </div>
    </div>

      {showNew && (
        <PmsNewReservationDialog roomTypes={rtList} onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); invalidate(); }} />
      )}
      {showBulkChange && <PmsBulkRoomChangeDialog onClose={() => { setShowBulkChange(false); invalidate(); }} />}
      {showQuickAssign && <PmsQuickAssignDialog onClose={() => { setShowQuickAssign(false); invalidate(); }} />}
      {showFolio && sel && (
        <PmsFolioPanel reservationId={sel.id} onClose={() => setShowFolio(false)} />
      )}
      {showDetail && sel && (
        <PmsReservationDetailDialog reservation={sel} hotelName={hotelName}
          onClose={() => setShowDetail(false)} onChanged={invalidate} />
      )}
      {showSaveDialog && (
        <PmsSaveSearchDialog initial={savedName} onCancel={() => setShowSaveDialog(false)} onConfirm={confirmarGravarPesquisa} />
      )}
      {checkInTarget && (
        <PmsCheckInDialog reservation={checkInTarget} onClose={() => setCheckInTarget(null)}
          onDone={() => { setCheckInTarget(null); invalidate(); }} />
      )}
      {showAutoDialog && !autoMode && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
          <div className="w-[97vw] h-[92vh] bg-[#F7FAFA] border border-[#5C8891] shadow-2xl rounded-[16px] overflow-hidden flex flex-col">
            <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#041F24' }}>
              Reservation Search (automatic reservations)
              <div className="flex items-center gap-2">
                <button className="text-white/70 hover:text-white" title="Janelas"><Copy size={13} /></button>
                <button onClick={() => setShowAutoDialog(false)} title="Fechar"
                  className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
                  <XCircle size={12} strokeWidth={3} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <PmsReservationsView autoMode onCloseDialog={() => setShowAutoDialog(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
