import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Copy, Plus, Minus, ChevronUp, ChevronDown } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import PmsEntityPickerDialog from './PmsEntityPickerDialog';
import PmsBlockPickerDialog from './PmsBlockPickerDialog';
import PmsShowFreeRoomsDialog from './PmsShowFreeRoomsDialog';
import { SOURCE_LABEL } from './reservationStatus';

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function Panel({ title, children, className = '' }: { title: string; children: any; className?: string }) {
  return (
    <div className={`border border-[#CFE3E6] bg-white flex flex-col ${className}`}>
      <div className="px-2 py-1 font-bold text-[11px] border-b border-[#CFE3E6] bg-[#F7FAFA] flex-shrink-0">{title}</div>
      <div className="p-2 flex flex-col gap-1.5 text-[11px] flex-1 overflow-auto">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-[110px] flex-shrink-0 text-[#041F24]">{label}</span>
      {children}
    </label>
  );
}
const inp = 'border border-[#7FA9B1] p-1 bg-white flex-1 min-w-0';

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
  const [guest, setGuest] = useState<any>(reservation ? {
    id: reservation.guest, name: reservation.guest_name, tax_id: reservation.guest_tax_id, code: '',
    is_vip: reservation.guest_is_vip, vip_discount_percent: reservation.guest_vip_discount_percent,
  } : null);
  const [showEntity, setShowEntity] = useState(false);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eta, setEta] = useState(reservation?.eta || '');
  const [etd, setEtd] = useState(reservation?.etd || '');
  const [lockRoom, setLockRoom] = useState(!!reservation?.lock_room);
  const [colorTag, setColorTag] = useState(reservation?.color_tag || '');

  const nights = Math.max(Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000), 0);

  const { data: ratePlans } = useQuery({
    queryKey: ['pms', 'rate-plans', roomType],
    queryFn: async () => (await apiClient.get('pms/rate-plans/', { params: { room_type: roomType || undefined } })).data,
    enabled: !!roomType,
  });
  const rpList = Array.isArray(ratePlans) ? ratePlans : ratePlans?.results || [];
  const ratePlan = rpList.find((rp: any) => String(rp.id) === ratePlanId);
  const roomTypeObj = roomTypes.find((rt: any) => String(rt.id) === roomType);
  const baseRate = Number(ratePlan ? ratePlan.price_per_night : (roomTypeObj ? roomTypeObj.base_rate : 0)) || 0;
  // Cliente VIP: o MESMO desconto automático que o POS já aplica nos tickets
  // (ver pos/views.py, cust.is_vip/vip_discount_percent) — aqui sobre a
  // diária, só quando o preço não é manual (o preço manual é sempre a
  // decisão final do rececionista).
  const vipPct = Number(guest?.vip_discount_percent || 0);
  const autoRate = guest?.is_vip && vipPct > 0 ? Math.round(baseRate * (1 - vipPct / 100) * 100) / 100 : baseRate;
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
        eta: eta || undefined, etd: etd || undefined, lock_room: lockRoom, color_tag: colorTag || undefined,
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
      <div className="w-[1180px] max-w-[97vw] bg-[#F7FAFA] border border-[#5C8891] shadow-2xl rounded-[16px] overflow-hidden flex flex-col" style={{ height: 'min(88vh, 800px)' }}>
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#041F24' }}>
          {editing ? `${reservation.confirmation}, ${reservation.guest_name}, - Reserva` : 'Nova Reserva'}
          <div className="flex items-center gap-2">
            <button className="text-white/70 hover:text-white" title="Janelas"><Copy size={13} /></button>
            <button onClick={onClose} title="Fechar"
              className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
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
                <span className="flex-1 border border-[#7FA9B1] p-1 bg-white">{nights}</span>
                <div className="flex flex-col">
                  <button onClick={() => setCheckOut(plusDays(checkOut, 1))} className="border border-[#7FA9B1] border-b-0 px-1 bg-white hover:bg-[#F7FAFA]"><ChevronUp size={10} /></button>
                  <button onClick={() => nights > 1 && setCheckOut(plusDays(checkOut, -1))} className="border border-[#7FA9B1] px-1 bg-white hover:bg-[#F7FAFA]"><ChevronDown size={10} /></button>
                </div>
              </div>
            </Row>
            <Row label="Hora Chegada:">
              <input type="time" value={eta} onChange={(e) => setEta(e.target.value)} className={inp} title="Hora prevista de chegada — só informativo." />
            </Row>
            <Row label="Hora Saída:">
              <input type="time" value={etd} onChange={(e) => setEtd(e.target.value)} className={inp} title="Hora prevista de saída — só informativo." />
            </Row>
            <Row label="TipoReserva:">
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inp}>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Row>
            {/* "Estado Adicional" e "Tipo de oferta" removidos de propósito: o
                único estado real de uma reserva é Reservation.status (Opção/
                Reservada/Check-in/Check-out/Cancelada/No-show/Lista de Espera),
                já coberto pelo resto do ecrã — um 2º campo de "estado" ou uma
                lista de "ofertas" sem modelo por trás só inventaria dados. */}
          </Panel>

          {/* Entidades */}
          <Panel title="Entidades">
            {!guest ? (
              <div className="text-[#8C2B1F] font-bold flex-1">Por favor adicione um hóspede ou grupo!</div>
            ) : (
              <div className="flex-1">
                <div className="font-semibold">{guest.name}</div>
                <div className="text-[10px] text-gray-500">{guest.code}{guest.tax_id ? ` · NIF ${guest.tax_id}` : ''}</div>
              </div>
            )}
            <button onClick={() => setShowEntity(true)}
              className="flex items-center justify-center gap-1.5 py-1 bg-[#F7FAFA] border border-[#CFE3E6] hover:bg-[#EEF4F5] font-semibold">
              <Plus size={13} /> Adicionar
            </button>
            {guest?.is_vip && (
              <div className="px-2 py-1 font-semibold text-[#062A31]" style={{ background: '#CFE3E6' }}>
                ★ Cliente VIP{Number(guest.vip_discount_percent) > 0 ? ` — desconto automático ${guest.vip_discount_percent}%` : ''}
              </div>
            )}
            {/* "Pessoa de contacto" removido de propósito: exigiria um campo novo
                no mdm.Customer (Master Data partilhado por todo o ERP, fora dos
                ficheiros desta auditoria) só para guardar um nome de contacto de
                empresa — sem consumidor real (nenhum relatório/ecrã usa isto). */}
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
                <div className="px-2 py-1.5 font-semibold" style={{ background: '#CFE3E6' }}>Livres: {availDay.free}</div>
                <div className="px-2 py-1.5 font-semibold" style={{ background: '#CFE3E6' }}>Opção: {availDay.option}</div>
                <div className="px-2 py-1.5 font-semibold" style={{ background: '#B0392B' }}>Ocupado: {availDay.booked}</div>
                <div className="px-2 py-1.5 font-semibold" style={{ background: '#CFE3E6' }}>Lista Espera: {availDay.waitlist}</div>
              </>
            )}
          </Panel>

          {/* Ocupação */}
          <Panel title="Ocupação">
            <Row label="Quartos:"><input readOnly value={1} className={inp + ' bg-[#F7FAFA]'} title="Uma reserva = um quarto, nesta fase do PMS." /></Row>
            {/* "Upgrade de categoria" removido de propósito: o mesmo resultado
                (pôr o hóspede numa categoria melhor) já se faz mudando
                "Categoria" abaixo — rastrear "veio de X, subiu para Y" como
                campo à parte não tem nenhum relatório/ecrã que o consuma. */}
            <Row label="Categoria:">
              <select value={roomType} onChange={(e) => { setRoomType(e.target.value); setRatePlanId(''); setRoom(null); }} className={inp + ' font-semibold'}>
                <option value="">Escolha…</option>
                {roomTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </Row>
            <Row label="Allotment:">
              <div className="flex gap-1 flex-1">
                <input readOnly value={allotment ? allotment.code : '(nenhum)'} className={inp} />
                {allotment && <button onClick={() => setAllotment(null)} className="border border-[#7FA9B1] px-1.5 bg-white">×</button>}
                <button onClick={() => setShowBlockPicker(true)} title="Procurar bloco"
                  className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#041F24] text-white"><Plus size={13} /></button>
              </div>
            </Row>
            <Row label="Quarto:">
              <div className="flex gap-1 flex-1">
                <input readOnly value={room ? room.number : ''} className={inp} />
                <button onClick={() => setShowRoomPicker(true)} disabled={!roomType} title="Mostrar quartos livres"
                  className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#062A31] text-white disabled:opacity-40"><Plus size={13} /></button>
                <button onClick={() => setRoom(null)} disabled={!room} title="Limpar"
                  className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#B0392B] text-white disabled:opacity-40"><Minus size={13} /></button>
              </div>
            </Row>
            <label className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 cursor-pointer" title="Impede que 'Atribuição rápida' e 'Mudança de Quartos em Massa' movam esta reserva de quarto.">
                <input type="checkbox" checked={lockRoom} onChange={(e) => setLockRoom(e.target.checked)} /> Não Mudar Qrt:
              </span>
              {!editing && (
                <span className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} /> Walk-in:
                </span>
              )}
            </label>
            {/* "Tipos de limpeza" removido de propósito: não existe nenhuma
                taxonomia de tipos de limpeza no sistema — um pedido de limpeza
                específico para este quarto já tem um caminho real: a Tarefa
                de limpeza (PmsTasksView, HousekeepingTask), que já existe e
                já aparece no mapa de quartos. Duplicar aqui um 2º picklist
                sem dados por trás só inventaria uma opção. */}
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
            {/* "Lista Preços" removido de propósito: é a MESMA coisa que
                "Package" acima (o preço vem sempre do RatePlan escolhido, ver
                pms/models.py RatePlan) — um 2º seletor fixo em "RACK" seria a
                mesma informação duplicada e sem efeito.
                "Desconto"/"Regra de Desconto" removidos de propósito: o motor
                de promoções/descontos real do sistema (commercial.Promotion)
                é escopado a artigos de F&B/retalho (Item/ItemCategory de um
                Outlet), não a diárias de quarto — usá-lo aqui seria forçar um
                encaixe fora do seu domínio. O desconto automático que FAZ
                sentido para uma reserva (cliente VIP) já está aplicado acima,
                em "Entidades", com o mesmo campo que o POS usa
                (mdm.Customer.is_vip/vip_discount_percent). */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={manualPrice} onChange={(e) => { setManualPrice(e.target.checked); if (e.target.checked) setRate(String(autoRate ?? '')); }} /> Preço Manual
            </label>
            <Row label="Preço:">
              <input type="number" value={effectiveRate} disabled={!manualPrice} onChange={(e) => setRate(e.target.value)} className={manualPrice ? inp : inp + ' bg-[#F7FAFA]'} />
            </Row>
          </Panel>

          {/* Outros */}
          <Panel title="Outros">
            {/* "Garantia automática" (regra tipo "garante sempre reservas do
                canal X") removida de propósito: não existe motor de regras —
                "Garantido" abaixo já é o campo real (Reservation.is_guaranteed)
                e o rececionista decide caso a caso. */}
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={isGuaranteed} onChange={(e) => setIsGuaranteed(e.target.checked)} /> Garantido</label>
            <Row label="Cor:">
              <div className="flex items-center gap-1.5 flex-1">
                {['', '#B0392B', '#B08B2C', '#062A31', '#5C8891', '#7FA9B1'].map((c) => (
                  <button key={c || 'none'} type="button" onClick={() => setColorTag(c)} title={c || '(nenhuma)'}
                    className={`w-6 h-6 rounded-full border-2 flex-shrink-0 ${colorTag === c ? 'border-[#041F24]' : 'border-[#CFE3E6]'}`}
                    style={{ background: c || '#FFFFFF' }}>
                    {!c && <X size={12} className="text-gray-400 m-auto" />}
                  </button>
                ))}
              </div>
            </Row>
            {/* "Código VIP" removido daqui de propósito: não é um código à parte
                — é o mesmo mdm.Customer.is_vip/vip_discount_percent do hóspede
                escolhido, já mostrado acima em "Entidades" (com o desconto
                automático aplicado ao preço). Repeti-lo aqui como um 2º
                seletor desligado seria a mesma informação duas vezes. */}
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
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="border border-[#7FA9B1] p-1 bg-white flex-1" />
            </label>
          </Panel>
        </div>

        <div className="flex justify-end gap-2 px-3 py-1.5 bg-[#F7FAFA] border-t border-[#CFE3E6] flex-shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#041F24] hover:text-black px-2">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B0392B] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: '#062A31' }}>
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
