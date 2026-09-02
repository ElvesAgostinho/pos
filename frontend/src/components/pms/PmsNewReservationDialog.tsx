import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Copy, Plus, Minus, ChevronUp, ChevronDown } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import PmsEntityPickerDialog from './PmsEntityPickerDialog';
import PmsBlockPickerDialog from './PmsBlockPickerDialog';
import PmsShowFreeRoomsDialog from './PmsShowFreeRoomsDialog';

const naoConstruido = (label: string) => aviso(`"${label}" ainda não está construído nesta fase do PMS.`);
const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const SOURCE_LABEL: Record<string, string> = { DIRECT: 'Normal', ONLINE: 'Online', BLOCK: 'Bloco/Grupo' };

function Panel({ title, children, className = '' }: { title: string; children: any; className?: string }) {
  return (
    <div className={`border border-[#c0c7d0] bg-white flex flex-col ${className}`}>
      <div className="px-2 py-1 font-bold text-[11px] border-b border-[#c0c7d0] bg-[#eef1f4] flex-shrink-0">{title}</div>
      <div className="p-2 flex flex-col gap-1.5 text-[11px] flex-1 overflow-auto">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-[110px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );
}
const inp = 'border border-[#a0a0a0] p-1 bg-white flex-1 min-w-0';
const disabledInp = 'border border-[#a0a0a0] p-1 bg-[#f0f0f0] text-gray-400 flex-1 min-w-0 cursor-not-allowed';

/** Nova Reserva — usado tanto em Reservas como em Disponibilidade ("Criar Reserva").
 * Traz o seu próprio cabeçalho (não é um popup genérico) — igual ao resto dos
 * ecrãs do PMS. Os campos que ainda não têm motor por trás ficam visíveis mas
 * desativados, com aviso claro, em vez de fingir que gravam alguma coisa. */
export default function PmsNewReservationDialog({ roomTypes, reservation, onClose, onCreated }: {
  roomTypes: any[]; reservation?: any; onClose: () => void; onCreated: () => void;
}) {
  const editing = !!reservation;
  const [checkIn, setCheckIn] = useState(reservation?.check_in || todayISO());
  const [checkOut, setCheckOut] = useState(reservation?.check_out || plusDays(todayISO(), 1));
  const [source, setSource] = useState(reservation?.source || 'DIRECT');
  const [roomType, setRoomType] = useState(reservation?.room_type ? String(reservation.room_type) : '');
  const [room, setRoom] = useState<any>(reservation?.room_number ? { id: reservation.room, number: reservation.room_number } : null);
  const [allotment, setAllotment] = useState<any>(reservation?.block_code ? { id: reservation.block, code: reservation.block_code } : null);
  const [adults, setAdults] = useState(reservation?.adults ?? 1);
  const [children, setChildren] = useState(reservation?.children ?? 0);
  const [ratePlanId, setRatePlanId] = useState(reservation?.rate_plan ? String(reservation.rate_plan) : '');
  const [manualPrice, setManualPrice] = useState(editing);
  const [rate, setRate] = useState(reservation?.rate ? String(reservation.rate) : '');
  const [isGuaranteed, setIsGuaranteed] = useState(!!reservation?.is_guaranteed);
  const [segment, setSegment] = useState(reservation?.segment ? String(reservation.segment) : '');
  const [subSegment, setSubSegment] = useState(reservation?.sub_segment ? String(reservation.sub_segment) : '');
  const [channel, setChannel] = useState(reservation?.channel ? String(reservation.channel) : '');
  const [notes, setNotes] = useState(reservation?.notes || '');
  const [walkIn, setWalkIn] = useState(false);
  const [guest, setGuest] = useState<any>(reservation ? { id: reservation.guest, name: reservation.guest_name, tax_id: reservation.guest_tax_id, code: '' } : null);
  const [showEntity, setShowEntity] = useState(false);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const nights = Math.max(Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000), 0);

  const { data: ratePlans } = useQuery({
    queryKey: ['pms', 'rate-plans', roomType],
    queryFn: async () => (await apiClient.get('pms/rate-plans/', { params: { room_type: roomType || undefined } })).data,
    enabled: !!roomType,
  });
  const rpList = Array.isArray(ratePlans) ? ratePlans : ratePlans?.results || [];
  const ratePlan = rpList.find((rp: any) => String(rp.id) === ratePlanId);
  const roomTypeObj = roomTypes.find((rt: any) => String(rt.id) === roomType);
  const autoRate = ratePlan ? ratePlan.price_per_night : (roomTypeObj ? roomTypeObj.base_rate : 0);
  const effectiveRate = manualPrice ? rate : String(autoRate ?? '');

  const { data: segments } = useQuery({ queryKey: ['pos', 'segments'], queryFn: async () => (await apiClient.get('pos/config/segments/')).data });
  const segList = (Array.isArray(segments) ? segments : segments?.results || []).filter((s: any) => s.for_pms !== false);
  const { data: subSegments } = useQuery({ queryKey: ['pos', 'subsegments'], queryFn: async () => (await apiClient.get('pos/config/subsegments/')).data });
  const subList = (Array.isArray(subSegments) ? subSegments : subSegments?.results || [])
    .filter((s: any) => s.for_pms !== false && (!segment || String(s.segment) === segment));
  const { data: channels } = useQuery({ queryKey: ['pos', 'channels'], queryFn: async () => (await apiClient.get('pos/config/channels/')).data });
  const chList = (Array.isArray(channels) ? channels : channels?.results || []).filter((c: any) => c.for_pms !== false);

  const { data: avail } = useQuery({
    queryKey: ['pms', 'availability', checkIn, roomType],
    queryFn: async () => (await apiClient.get('pms/availability/', {
      params: { date_from: checkIn, date_to: checkIn, room_type: roomType || undefined },
    })).data,
    enabled: !!checkIn,
  });
  const availDay = avail?.total?.[0];

  const save = async () => {
    if (!guest || !roomType || !checkIn || !checkOut || checkOut <= checkIn) {
      aviso('Preencha hóspede, categoria e datas (Check-Out depois do Check-In).'); return;
    }
    if (walkIn && !room) {
      aviso('Walk-in precisa de um quarto atribuído (use o "+" junto de Quarto).'); return;
    }
    setSaving(true);
    try {
      const payload = {
        guest: guest.id, room_type: Number(roomType), room: room?.id || undefined, block: allotment?.id || undefined,
        check_in: checkIn, check_out: checkOut, adults, children,
        rate_plan: ratePlanId || undefined, rate: effectiveRate || 0,
        segment: segment || undefined, sub_segment: subSegment || undefined, channel: channel || undefined,
        is_guaranteed: isGuaranteed, source, notes: notes || undefined,
      };
      if (editing) {
        await apiClient.patch(`pms/reservations/${reservation.id}/`, payload);
      } else {
        const { data: created } = await apiClient.post('pms/reservations/', { ...payload, status: 'BOOKED' });
        if (walkIn) await apiClient.post(`pms/reservations/${created.id}/check_in/`, { room: room.id });
      }
      onCreated();
    } catch (e) { notifyError(e); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[1180px] max-w-[97vw] bg-[#f0f0f0] border border-[#8a8a8a] shadow-2xl flex flex-col" style={{ height: 'min(88vh, 800px)' }}>
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
          {editing ? `${reservation.confirmation}, ${reservation.guest_name}, - Reserva` : 'Nova Reserva'}
          <div className="flex items-center gap-2">
            <button className="text-white/70 hover:text-white" title="Janelas"><Copy size={13} /></button>
            <button onClick={onClose} title="Fechar"
              className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 grid grid-cols-3 gap-2 auto-rows-fr">
          {/* Datas e Estado */}
          <Panel title="Datas e Estado">
            <Row label="Check-In:"><input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inp} /></Row>
            <Row label="Check-Out:"><input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inp} /></Row>
            <Row label="Noites:">
              <div className="flex items-center gap-1 flex-1">
                <span className="flex-1 border border-[#a0a0a0] p-1 bg-white">{nights}</span>
                <div className="flex flex-col">
                  <button onClick={() => setCheckOut(plusDays(checkOut, 1))} className="border border-[#a0a0a0] border-b-0 px-1 bg-white hover:bg-[#eee]"><ChevronUp size={10} /></button>
                  <button onClick={() => nights > 1 && setCheckOut(plusDays(checkOut, -1))} className="border border-[#a0a0a0] px-1 bg-white hover:bg-[#eee]"><ChevronDown size={10} /></button>
                </div>
              </div>
            </Row>
            <Row label="Hora Chegada:">
              <input disabled value="—" title="Ainda não está construído nesta fase do PMS." onFocus={(e) => { e.target.blur(); naoConstruido('Hora Chegada'); }} className={disabledInp} />
            </Row>
            <Row label="Hora Saída:">
              <input disabled value="—" title="Ainda não está construído nesta fase do PMS." onFocus={(e) => { e.target.blur(); naoConstruido('Hora Saída'); }} className={disabledInp} />
            </Row>
            <Row label="TipoReserva:">
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inp}>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Row>
            <Row label="Estado Adicional:">
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Estado Adicional'); }}>
                <option>(nenhum)</option>
              </select>
            </Row>
            <Row label="Tipo de oferta:">
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Tipo de oferta'); }}>
                <option>(nenhum)</option>
              </select>
            </Row>
          </Panel>

          {/* Entidades */}
          <Panel title="Entidades">
            {!guest ? (
              <div className="text-red-600 font-bold flex-1">Por favor adicione um hóspede ou grupo!</div>
            ) : (
              <div className="flex-1">
                <div className="font-semibold">{guest.name}</div>
                <div className="text-[10px] text-gray-500">{guest.code}{guest.tax_id ? ` · NIF ${guest.tax_id}` : ''}</div>
              </div>
            )}
            <button onClick={() => setShowEntity(true)}
              className="flex items-center justify-center gap-1.5 py-1 bg-[#e8e8e8] border border-[#c0c0c0] hover:bg-[#ddd] font-semibold">
              <Plus size={13} /> Adicionar
            </button>
            <Row label="Pessoa de contacto:">
              <input disabled value="—" title="Ainda não está construído nesta fase do PMS." onFocus={(e) => { e.target.blur(); naoConstruido('Pessoa de contacto'); }} className={disabledInp} />
            </Row>
          </Panel>

          {/* Disponibilidade */}
          <Panel title="Disponibilidade">
            <div className="mb-1">Incluir Allotments: <b>Não</b></div>
            {!roomType ? (
              <div className="text-gray-400">Escolha uma categoria para ver a disponibilidade.</div>
            ) : !availDay ? (
              <div className="text-gray-400">A carregar…</div>
            ) : (
              <>
                <div className="px-2 py-1.5 font-semibold" style={{ background: '#8ef0b0' }}>Livres: {availDay.free}</div>
                <div className="px-2 py-1.5 font-semibold" style={{ background: '#7fe0ea' }}>Opção: {availDay.option}</div>
                <div className="px-2 py-1.5 font-semibold" style={{ background: '#f5a3a3' }}>Ocupado: {availDay.booked}</div>
                <div className="px-2 py-1.5 font-semibold" style={{ background: '#f7cf8f' }}>Lista Espera: {availDay.waitlist}</div>
              </>
            )}
          </Panel>

          {/* Ocupação */}
          <Panel title="Ocupação">
            <Row label="Quartos:"><input readOnly value={1} className={inp + ' bg-[#f4f4f4]'} title="Uma reserva = um quarto, nesta fase do PMS." /></Row>
            <Row label="Upg. de:">
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Upgrade de categoria'); }}>
                <option>(nenhum)</option>
              </select>
            </Row>
            <Row label="Categoria:">
              <select value={roomType} onChange={(e) => { setRoomType(e.target.value); setRatePlanId(''); setRoom(null); }} className={inp + ' font-semibold'}>
                <option value="">Escolha…</option>
                {roomTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </Row>
            <Row label="Allotment:">
              <div className="flex gap-1 flex-1">
                <input readOnly value={allotment ? allotment.code : '(nenhum)'} className={inp} />
                {allotment && <button onClick={() => setAllotment(null)} className="border border-[#a0a0a0] px-1.5 bg-white">×</button>}
                <button onClick={() => setShowBlockPicker(true)} title="Procurar bloco"
                  className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#3c3c3c] text-white"><Plus size={13} /></button>
              </div>
            </Row>
            <Row label="Quarto:">
              <div className="flex gap-1 flex-1">
                <input readOnly value={room ? room.number : ''} className={inp} />
                <button onClick={() => setShowRoomPicker(true)} disabled={!roomType} title="Mostrar quartos livres"
                  className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#3c8f52] text-white disabled:opacity-40"><Plus size={13} /></button>
                <button onClick={() => setRoom(null)} disabled={!room} title="Limpar"
                  className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#c0392b] text-white disabled:opacity-40"><Minus size={13} /></button>
              </div>
            </Row>
            <label className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-gray-400 cursor-not-allowed" title="Ainda não está construído nesta fase do PMS." onClick={() => naoConstruido('Não Mudar Qrt')}>
                <input type="checkbox" disabled /> Não Mudar Qrt:
              </span>
              {!editing && (
                <span className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} /> Walk-in:
                </span>
              )}
            </label>
            <button onClick={() => naoConstruido('Tipos de limpeza')} className="mt-auto py-1 bg-[#e8e8e8] border border-[#c0c0c0] hover:bg-[#ddd] text-gray-500">
              Tipos de limpeza
            </button>
          </Panel>

          {/* Package e Preço */}
          <Panel title="Package e Preço">
            <Row label="Adultos:">
              <input type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))} className={inp} />
            </Row>
            <Row label="Crianças:">
              <input type="number" min={0} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))} className={inp} />
            </Row>
            <Row label="Package:">
              <select value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} disabled={!roomType} className={inp}>
                <option value="">(nenhum)</option>
                {rpList.map((rp: any) => <option key={rp.id} value={rp.id}>{rp.code} ({rp.board})</option>)}
              </select>
            </Row>
            <Row label="Lista Preços:">
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Lista de Preços'); }}>
                <option>RACK</option>
              </select>
            </Row>
            <Row label="Desconto:">
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Desconto'); }}>
                <option>(nenhum)</option>
              </select>
            </Row>
            <Row label="Regra de Desc.:">
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Regra de Desconto'); }}>
                <option>(nenhum)</option>
              </select>
            </Row>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={manualPrice} onChange={(e) => { setManualPrice(e.target.checked); if (e.target.checked) setRate(String(autoRate ?? '')); }} /> Preço Manual
            </label>
            <Row label="Preço:">
              <input type="number" value={effectiveRate} disabled={!manualPrice} onChange={(e) => setRate(e.target.value)} className={manualPrice ? inp : inp + ' bg-[#f4f4f4]'} />
            </Row>
          </Panel>

          {/* Outros */}
          <Panel title="Outros">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={isGuaranteed} onChange={(e) => setIsGuaranteed(e.target.checked)} /> Garantido</label>
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Garantia automática'); }}>
                <option>Todos</option>
              </select>
            </div>
            <Row label="Cor:">
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Cor'); }}>
                <option>(nenhum)</option>
              </select>
            </Row>
            <Row label="Código VIP:">
              <select disabled className={disabledInp} title="Ainda não está construído nesta fase do PMS." onMouseDown={(e) => { e.preventDefault(); naoConstruido('Código VIP'); }}>
                <option>(nenhum)</option>
              </select>
            </Row>
            <Row label="Segmento:">
              <select value={segment} onChange={(e) => { setSegment(e.target.value); setSubSegment(''); }} className={inp}>
                <option value="">(nenhum)</option>
                {segList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Row>
            <Row label="Sub-Segmento:">
              <select value={subSegment} onChange={(e) => setSubSegment(e.target.value)} className={inp}>
                <option value="">(nenhum)</option>
                {subList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Row>
            <Row label="Canal de Dist.:">
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inp}>
                <option value="">(nenhum)</option>
                {chList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Row>
            <label className="flex flex-col gap-0.5 flex-1">Notas:
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="border border-[#a0a0a0] p-1 bg-white flex-1" />
            </label>
          </Panel>
        </div>

        <div className="flex justify-end gap-2 px-3 py-1.5 bg-[#e8e8e8] border-t border-[#c0c0c0] flex-shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] hover:text-black px-2">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: '#2b7a3b' }}>
            {saving ? 'A gravar…' : 'Gravar'}
          </button>
        </div>
      </div>

      {showEntity && (
        <PmsEntityPickerDialog onClose={() => setShowEntity(false)}
          onSelect={(e) => { setGuest(e); setShowEntity(false); }} />
      )}
      {showBlockPicker && (
        <PmsBlockPickerDialog onClose={() => setShowBlockPicker(false)}
          onSelect={(b) => { setAllotment(b); setShowBlockPicker(false); }} />
      )}
      {showRoomPicker && (
        <PmsShowFreeRoomsDialog roomTypes={roomTypes} dateFrom={checkIn} dateTo={checkOut} roomType={roomType}
          onClose={() => setShowRoomPicker(false)} onSelect={(r) => { setRoom(r); setShowRoomPicker(false); }} />
      )}
    </div>
  );
}
