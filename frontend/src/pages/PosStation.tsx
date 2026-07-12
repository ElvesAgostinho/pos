import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Coins, ArrowLeft, Trash2, Printer, Check, Power, Lock, Unlock, User, RefreshCw,
  Table2, BedDouble, MapPin, Truck, Send, Clock, LayoutGrid, X, TrendingUp, TrendingDown,
  LogOut, CreditCard, Banknote, Waves, Split, Users, ArrowRightLeft, CalendarClock, Plus, LogIn, UserPlus, History,
} from 'lucide-react';
import { tokenStore } from '../api/auth';
import { posMgmtApi } from '../api/posmgmt';
import { apiClient } from '../api/client';
import { useCombos } from '../hooks/useCommercial';
import { printFiscalInvoice } from '../components/fiscal/printInvoice';
import { getAppearance } from '../config/appearance';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DEST_ICON: Record<string, any> = { POOL: Waves, BEACH: Waves, SPA: MapPin, GYM: MapPin, EVENT: MapPin };

type Step = 'sector' | 'cash' | 'service' | 'order';
type SrvTab = 'TABLE' | 'ROOM' | 'DESTINATION' | 'RESERV' | 'OPEN' | 'DELIVERY';
type Modal = 'none' | 'pay' | 'cash' | 'split' | 'customer' | 'audit';

// ==========================================================================
// POS Station — frente de loja 5 estrelas. Serve tudo o que o backoffice tem:
// setor, caixa, Mesa/Quarto/Destino, menu+combos, KDS, pagamento com recibo
// fiscal (AGT) automático, e board de entregas (room service / piscina / praia).
// ==========================================================================
export default function PosStation() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const operator = tokenStore.getPosOperator();
  const opName = operator?.name || 'Operador';
  const inval = () => qc.invalidateQueries();

  const [outlet, setOutlet] = useState<number | undefined>();
  const [step, setStep] = useState<Step>('sector');
  const [srvTab, setSrvTab] = useState<SrvTab>('TABLE');
  const [ticketId, setTicketId] = useState<number | undefined>();
  const [cat, setCat] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [selLine, setSelLine] = useState<number | undefined>();
  const [floatVal, setFloatVal] = useState('0');
  const [modal, setModal] = useState<Modal>('none');
  const [tableModal, setTableModal] = useState<any>(null);   // popup ao clicar numa mesa livre
  const [receipt, setReceipt] = useState<{ mode: 'print' | 'void' } | null>(null);  // preview térmico
  const [clock, setClock] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 20000); return () => clearInterval(t); }, []);

  const Q = (k: any[], fn: () => Promise<any>, opts: any = {}): any => useQuery({ queryKey: k, queryFn: fn, ...opts });
  const { data: outlets = [] } = Q(['pos-outlets'], () => posMgmtApi.getOutlets());
  const outletName = outlets.find((o: any) => o.id === outlet)?.name || '';
  const { data: configs = [] } = Q(['pos-cfg', outlet], () => posMgmtApi.getProductConfigs(outlet!), { enabled: !!outlet });
  const { data: payments = [] } = Q(['pos-pay', outlet], () => posMgmtApi.getOutletPayments(outlet!), { enabled: !!outlet });
  const { data: cashSessions = [] } = Q(['pos-cash'], () => posMgmtApi.getCashSessions());
  const { data: tables = [] } = Q(['pos-tables', outlet], () => posMgmtApi.getTables(outlet), { enabled: !!outlet });
  const { data: openTickets = [] } = Q(['pos-open', outlet], () => posMgmtApi.getTickets({ outlet, status: 'OPEN' }), { enabled: !!outlet, refetchInterval: 15000 });
  const { data: ticket } = Q(['pos-ticket', ticketId], () => posMgmtApi.getTicket(ticketId!), { enabled: !!ticketId });
  const { data: combos = [] }: any = useCombos();
  const { data: destinations = [] } = Q(['pos-dest'], async () => (await apiClient.get('pos/service-destinations/', { params: { active: 1 } })).data);
  const { data: rooms = [] } = Q(['pms-rooms'], async () => { try { return (await apiClient.get('pms/rooms/')).data; } catch { return []; } });
  const { data: reservations = [] } = Q(['pos-res', outlet], async () => (await apiClient.get('pos/reservations/', { params: { outlet } })).data, { enabled: !!outlet, refetchInterval: 30000 });

  const session: any = useMemo(() => cashSessions.find((s: any) => s.outlet === outlet && s.status === 'OPEN'), [cashSessions, outlet]);
  useEffect(() => { if (step === 'sector' && outlets.length === 1) setOutlet(outlets[0].id); }, [outlets, step]);
  useEffect(() => { if ((step === 'service' || step === 'order') && !session) setStep('cash'); }, [session, step]);

  const categories = useMemo(() => {
    const g: Record<string, any[]> = {};
    configs.filter((c: any) => c.is_available !== false).forEach((c: any) => {
      const k = (c.item_category || c.pos_category || 'GERAL').toUpperCase();
      (g[k] = g[k] || []).push(c);
    });
    return g;
  }, [configs]);
  const catNames = useMemo(() => { const l = Object.keys(categories); if (combos.length) l.push('MENUS'); return l; }, [categories, combos]);

  // ---- ações ----
  const logout = () => { tokenStore.clearPos(); nav('/pos/login'); };
  const pickSector = (o: any) => { setOutlet(o.id); const s = cashSessions.find((x: any) => x.outlet === o.id && x.status === 'OPEN'); setStep(s ? 'service' : 'cash'); };
  const doOpenCash = async () => {
    try { await posMgmtApi.openCashSession({ outlet, operator_name: opName, opening_float: Number(floatVal) || 0, terminal_name: 'POS-01' } as any); inval(); setStep('service'); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao abrir caixa'); }
  };
  const goOrder = (tid: number) => { setTicketId(tid); setStep('order'); setCat(null); };
  const openForTable = async (t: any) => {
    const ex = openTickets.find((k: any) => k.table === t.id || (k.dest_kind === 'TABLE' && String(k.dest_ref) === String(t.id)));
    if (ex) return goOrder(ex.id);        // mesa ocupada → abre a conta existente (consulta/pagamento)
    setTableModal(t);                     // mesa livre → popup (passante/hóspede + nº pessoas)
  };
  // Confirma o popup: cria a conta com o tipo de cliente e o nº de pessoas.
  const confirmTable = async (t: any, { pax, kind, room }: { pax: number; kind: 'WALKIN' | 'GUEST'; room?: string }) => {
    try {
      const tk = await posMgmtApi.openTicket({ outlet, table: t.id, operator_name: opName, guests: pax } as any);
      await apiClient.post(`pos/tickets/${tk.id}/set_destination/`, { dest_kind: 'TABLE', dest_ref: t.id });
      const customer_name = kind === 'GUEST' ? `Hóspede${room ? ` · Quarto ${room}` : ''}` : 'Passante';
      await apiClient.post(`pos/tickets/${tk.id}/set_customer/`, { customer_name, adults: pax, children: 0 });
      setTableModal(null); inval(); goOrder(tk.id!);
    } catch (e: any) { alert(JSON.stringify(e?.response?.data)); }
  };
  const openForDest = async (kind: string, ref: any, priority = 'NORMAL') => {
    try {
      const tk = await posMgmtApi.openTicket({ outlet, operator_name: opName, guests: 1 } as any);
      await apiClient.post(`pos/tickets/${tk.id}/set_destination/`, { dest_kind: kind, dest_ref: ref, dest_priority: priority });
      inval(); goOrder(tk.id!);
    } catch (e: any) { alert(JSON.stringify(e?.response?.data)); }
  };
  const addItem = async (c: any) => { try { await posMgmtApi.addTicketLine(ticketId!, { item: c.item, quantity: qty }); inval(); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } };
  const addComboFn = async (cb: any) => { try { await posMgmtApi.addCombo(ticketId!, cb.id); inval(); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro no combo'); } };
  const delLine = async (id: number) => { try { await posMgmtApi.deleteTicketLine(id); setSelLine(undefined); inval(); } catch { /* noop */ } };
  const fireKitchen = async () => { try { await posMgmtApi.fireKitchen(ticketId!); inval(); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } };
  const dispatchOrder = async (tid: number) => { await apiClient.post(`pos/tickets/${tid}/dispatch_order/`); inval(); };
  const deliverOrder = async (tid: number) => { await apiClient.post(`pos/tickets/${tid}/deliver/`, { delivered_by: opName }); inval(); };
  const resAction = async (id: number, action: string, body: any = {}) => { try { await apiClient.post(`pos/reservations/${id}/${action}/`, body); inval(); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } };
  const seatReservation = async (res: any) => {
    try { const r = await apiClient.post(`pos/reservations/${res.id}/seat/`, {}); inval(); if (r.data?.ticket_id) goOrder(r.data.ticket_id); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao sentar'); }
  };
  const createReservation = async (payload: any) => { try { await apiClient.post('pos/reservations/', { ...payload, outlet }); inval(); } catch (e: any) { alert(JSON.stringify(e?.response?.data)); } };
  const createGroup = async (ids: number[]) => {
    try { const r = await apiClient.post('pos/table-groups/', { table_ids: ids }); inval(); if (r.data?.ticket_id) goOrder(r.data.ticket_id); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao agrupar'); }
  };
  const ungroup = async (groupId: number) => { try { await apiClient.post(`pos/table-groups/${groupId}/ungroup/`); inval(); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } };

  const printReceipt = async (tid: number) => {
    try {
      const docs = (await apiClient.get('fiscal/documents/', { params: { source_module: 'pos', source_ref: tid } })).data;
      const arr = docs?.results || docs;
      if (arr && arr[0]) await printFiscalInvoice(arr[0].id, true);
      else window.print();   // sem doc fiscal: imprime o talão de conferência
    } catch { /* recibo opcional */ }
  };
  // Confirmação do preview térmico (imprimir ou anular).
  const confirmReceipt = async () => {
    if (!receipt || !ticketId) return;
    if (receipt.mode === 'print') {
      setReceipt(null);
      await printReceipt(ticketId);
    } else {
      try {
        const res = await apiClient.post(`pos/tickets/${ticketId}/credit_note/`, { reason: 'Anulação no POS' });
        setReceipt(null); setTicketId(undefined); setStep('service'); inval();
        alert(`Venda anulada. Nota de Crédito: ${res.data.credit_note || '(sem documento fiscal)'}`);
      } catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao anular'); }
    }
  };

  const lines = ticket?.lines || [];
  const destLabel = (ticket as any)?.dest_label || ticket?.table_label || '—';

  // ======================= SETOR =======================
  if (step === 'sector') return (
    <Shell op={opName} clock={clock} onLogout={logout}>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <div className="text-white/80 text-lg font-semibold tracking-wide">Selecione o seu sector</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-4xl">
          {outlets.map((o: any) => (
            <button key={o.id} onClick={() => pickSector(o)}
              className="h-32 rounded-xl bg-gradient-to-br from-[#17334d] to-[#0e2032] border border-[#2a4a66] hover:border-[#c9a400] text-white flex flex-col items-center justify-center gap-2 shadow-lg transition">
              <LayoutGrid size={30} className="text-[#c9a400]" />
              <span className="text-lg font-bold">{o.name}</span>
              <span className="text-[11px] text-white/50">{o.code}</span>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );

  // ======================= CAIXA =======================
  if (step === 'cash') return (
    <Shell op={opName} clock={clock} onLogout={logout} onBack={() => setStep('sector')} title={outletName}>
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-[#111a26] border border-[#2a4a66] rounded-xl p-8 w-[400px] text-center shadow-2xl">
          <Lock className="mx-auto text-[#c0621d] mb-3" size={40} />
          <div className="text-white text-xl font-bold mb-1">Caixa Fechada</div>
          <div className="text-white/50 text-sm mb-6">{outletName} · {opName}</div>
          <label className="text-white/70 text-sm block mb-1 text-left">Fundo de maneio (abertura)</label>
          <input type="number" value={floatVal} onChange={(e) => setFloatVal(e.target.value)} className="w-full h-14 bg-[#0c141e] text-white text-center text-3xl rounded-lg mb-4 outline-none border border-[#2a4a66]" />
          <button onClick={doOpenCash} className="w-full h-14 bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e] text-white font-bold rounded-lg flex items-center justify-center gap-2"><Unlock size={20} /> Abrir Caixa</button>
        </div>
      </div>
    </Shell>
  );

  // ======================= SERVIÇO / DESTINO (hub) =======================
  if (step === 'service') {
    const tabs: [SrvTab, string, any][] = [
      ['TABLE', 'Mesas', Table2], ['ROOM', 'Quartos', BedDouble], ['DESTINATION', 'Destinos', MapPin],
      ['RESERV', 'Reservas', CalendarClock], ['OPEN', 'Pedidos Abertos', Clock], ['DELIVERY', 'Entregas', Truck],
    ];
    const deliveryOrders = openTickets.filter((k: any) => k.delivery_status && k.delivery_status !== 'NONE');
    return (
      <Shell op={opName} clock={clock} onLogout={logout} onBack={() => setStep('sector')} title={outletName}
        right={<button onClick={() => setModal('cash')} className="h-10 px-3 bg-[#111a26] border border-[#2a4a66] rounded text-[#c9a400] text-sm font-bold flex items-center gap-1.5"><Coins size={16} /> Caixa</button>}>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 bg-[#0c141e] border-r border-[#1c2c3c] flex flex-col py-2">
            {tabs.map(([k, label, Icon]) => (
              <button key={k} onClick={() => setSrvTab(k)}
                className={`h-16 flex flex-col items-center justify-center gap-1 text-[12px] font-semibold ${srvTab === k ? 'bg-[#17334d] text-white border-l-4 border-[#c9a400]' : 'text-white/60 hover:bg-[#111a26]'}`}>
                <Icon size={20} />{label}
                {k === 'DELIVERY' && deliveryOrders.length > 0 && <span className="text-[10px] bg-[#c0621d] text-white rounded-full px-1.5">{deliveryOrders.length}</span>}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={inval} className="h-12 text-white/50 hover:text-white flex items-center justify-center gap-1 text-[12px]"><RefreshCw size={16} /> Atualizar</button>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-[#0e1622]">
            {srvTab === 'TABLE' && (
              <TableFloor tables={tables} openTickets={openTickets} reservations={reservations} opName={opName} clock={clock}
                onOpen={openForTable} onOpenTicket={goOrder} onGroup={createGroup} onUngroup={ungroup} />
            )}
            {srvTab === 'RESERV' && (
              <ReservationsPanel reservations={reservations} tables={tables} onCreate={createReservation}
                onSeat={seatReservation} onAction={resAction} />
            )}
            {srvTab === 'ROOM' && (
              <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                {rooms.map((r: any) => (
                  <button key={r.id} onClick={() => openForDest('ROOM', r.id, 'HIGH')}
                    className="h-24 rounded-lg bg-[#2a3a6a] hover:bg-[#33468a] text-white font-bold flex flex-col items-center justify-center shadow">
                    <BedDouble size={20} className="mb-1 opacity-80" />Quarto {r.number}
                    <span className="text-[10px] font-normal opacity-70">Room Service</span>
                  </button>
                ))}
                {rooms.length === 0 && <Empty text="Sem quartos (PMS) disponíveis." />}
              </div>
            )}
            {srvTab === 'DESTINATION' && (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {destinations.map((d: any) => {
                  const Icon = DEST_ICON[d.dtype] || MapPin;
                  return (
                    <button key={d.id} onClick={() => openForDest('DESTINATION', d.id, d.priority)}
                      className="h-24 rounded-lg bg-[#155e52] hover:bg-[#1a7364] text-white font-bold flex flex-col items-center justify-center shadow text-center px-1">
                      <Icon size={20} className="mb-1 opacity-80" /><span className="leading-tight">{d.name}</span>
                      <span className="text-[10px] font-normal opacity-70">{d.dtype_display}</span>
                    </button>
                  );
                })}
                {destinations.length === 0 && <Empty text="Sem destinos configurados. Configure no Delivery Destination Center." />}
              </div>
            )}
            {srvTab === 'OPEN' && (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {openTickets.map((k: any) => (
                  <button key={k.id} onClick={() => goOrder(k.id)}
                    className="h-24 rounded-lg bg-[#1b2636] border border-[#2a4a66] hover:border-[#c9a400] text-white flex flex-col items-center justify-center shadow px-2">
                    <span className="font-bold">{k.dest_label || k.table_label || k.ticket_number}</span>
                    <span className="text-[#c9a400] text-lg font-bold">{money(k.grand_total)}</span>
                    <span className="text-[10px] opacity-60">{k.ticket_number}</span>
                  </button>
                ))}
                {openTickets.length === 0 && <Empty text="Sem pedidos abertos." />}
              </div>
            )}
            {srvTab === 'DELIVERY' && (
              <div className="space-y-2 max-w-3xl">
                {deliveryOrders.map((k: any) => (
                  <div key={k.id} className="bg-[#1b2636] border border-[#2a4a66] rounded-lg p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-white font-bold flex items-center gap-2"><MapPin size={15} className="text-[#c9a400]" />{k.dest_label} <PriorityTag p={k.dest_priority} /></div>
                      <div className="text-white/50 text-[12px]">{k.ticket_number} · {money(k.grand_total)} · {k.lines?.length || 0} item(s)</div>
                    </div>
                    <span className="text-[12px] text-white/70">{deliveryLabel(k.delivery_status)}</span>
                    <button onClick={() => goOrder(k.id)} className="h-9 px-3 bg-[#333f52] text-white rounded text-[12px]">Abrir</button>
                    {k.delivery_status === 'PENDING' && <button onClick={() => dispatchOrder(k.id)} className="h-9 px-3 bg-[#1565c0] text-white rounded text-[12px] font-bold flex items-center gap-1"><Send size={13} /> Despachar</button>}
                    {k.delivery_status === 'DISPATCHED' && <button onClick={() => deliverOrder(k.id)} className="h-9 px-3 bg-[#2e7d32] text-white rounded text-[12px] font-bold flex items-center gap-1"><Check size={13} /> Entregue</button>}
                  </div>
                ))}
                {deliveryOrders.length === 0 && <Empty text="Sem entregas pendentes." />}
              </div>
            )}
          </div>
        </div>
        {modal === 'cash' && <CashModal session={session} onClose={() => setModal('none')} onClosed={() => { setModal('none'); setStep('cash'); }} inval={inval} />}
        {tableModal && <TablePopup table={tableModal} onClose={() => setTableModal(null)} onConfirm={(opts: any) => confirmTable(tableModal, opts)} />}
      </Shell>
    );
  }

  // ======================= PEDIDO =======================
  return (
    <Shell op={opName} clock={clock} onLogout={logout} onBack={() => setStep('service')} title={outletName}
      right={<div className="flex items-center gap-2">
        <button onClick={() => setModal('customer')} className="h-9 px-3 bg-[#1565c0] text-white rounded text-sm font-bold flex items-center gap-1.5"><UserPlus size={15} />{(ticket as any)?.customer_name ? (ticket as any).customer_name : 'Cliente'}</button>
        <button onClick={() => lines.length && setModal('split')} className="h-9 px-3 bg-[#6a1b9a] text-white rounded text-sm font-bold flex items-center gap-1.5"><Split size={15} />Dividir</button>
        <button onClick={() => setModal('audit')} title="Histórico da mesa" className="h-9 px-2.5 bg-[#33415a] text-white rounded text-sm font-bold flex items-center gap-1.5"><History size={15} /></button>
        <button onClick={() => lines.length && setReceipt({ mode: 'void' })} title="Anular venda (Nota de Crédito)" className="h-9 px-3 bg-[#a01818] text-white rounded text-sm font-bold flex items-center gap-1.5"><X size={15} />Anular</button>
        <div className="bg-[#111a26] border border-[#2a4a66] px-3 py-1.5 rounded text-white text-sm font-bold flex items-center gap-1.5"><MapPin size={14} className="text-[#c9a400]" />{destLabel}</div>
      </div>}>
      <div className="flex flex-1 overflow-hidden">
        {/* Catálogo */}
        <div className="flex-1 p-4 overflow-auto" style={{ background: 'radial-gradient(120% 120% at 0% 0%, #101a28 0%, #0b111b 60%)' }}>
          {cat && <div className="flex items-center gap-2 mb-3"><span className="w-1 h-6 rounded" style={{ background: catColor(cat) }} /><span className="text-white font-bold text-lg tracking-tight">{cat}</span><span className="text-white/40 text-sm">· toque para adicionar {qty > 1 ? `(×${qty})` : ''}</span></div>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            <button onClick={() => { if (cat) setCat(null); else setStep('service'); }}
              className="h-28 rounded-xl flex flex-col items-center justify-center gap-1 text-[#c9a400] border border-[#2a4a66] bg-[#141d2b]/70 hover:bg-[#1b2636] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] active:scale-95 transition">
              <ArrowLeft size={30} /><span className="text-[11px] text-white/50">Voltar</span>
            </button>
            {!cat && catNames.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                className="group relative h-28 rounded-xl overflow-hidden shadow-lg active:scale-95 transition"
                style={{ background: `linear-gradient(145deg, ${catColor(c)} 0%, ${shade(catColor(c), -22)} 100%)` }}>
                <span className="absolute -right-3 -bottom-3 text-[62px] opacity-15 select-none">{catEmoji(c)}</span>
                <div className="absolute inset-0 flex flex-col items-start justify-end p-3">
                  <span className="text-2xl mb-0.5">{catEmoji(c)}</span>
                  <span className="text-white text-[15px] font-bold leading-tight text-left drop-shadow">{c}</span>
                </div>
                <div className="absolute inset-0 ring-1 ring-white/10 rounded-xl group-hover:ring-white/25" />
              </button>
            ))}
            {cat === 'MENUS' && combos.map((cb: any) => (
              <ProductTile key={cb.id} name={cb.name} price={cb.price} color="#b5651d" emoji="🍔" onClick={() => addComboFn(cb)} />
            ))}
            {cat && cat !== 'MENUS' && (categories[cat] || []).map((c: any) => (
              <ProductTile key={c.id} name={c.item_name} price={c.effective_price} image={c.item_image}
                color={c.button_color || catColor(cat)} emoji={catEmoji(cat)} onClick={() => addItem(c)} />
            ))}
          </div>
        </div>
        {/* Comanda */}
        <div className="w-[400px] bg-[#0c141e] flex flex-col border-l border-[#1c2c3c]">
          <div className="grid grid-cols-[46px_1fr_84px] bg-[#17334d] text-white text-sm font-bold px-2 py-2"><span>Qtd</span><span>Descrição</span><span className="text-right">Total</span></div>
          <div className="flex-1 overflow-auto">
            {lines.map((l: any) => (
              <div key={l.id} onClick={() => setSelLine(l.id)} className={`grid grid-cols-[46px_1fr_84px] px-2 py-2 text-sm cursor-pointer border-b border-[#1c2c3c] ${selLine === l.id ? 'bg-[#17334d] text-white' : 'text-white/85'}`}>
                <span>{Number(l.quantity).toFixed(0)}</span>
                <span className="truncate">{l.description}{l.note ? <em className="block text-[10px] text-[#e0a] not-italic">{l.note}</em> : null}</span>
                <span className="text-right">{money(l.line_total)}</span>
              </div>
            ))}
            {lines.length === 0 && <div className="text-center text-white/40 py-12 text-sm">Toque num artigo para adicionar.</div>}
          </div>
          <div className="grid grid-cols-4 gap-px bg-[#1c2c3c]">
            {[1, 2, 3, 4].map((n) => (<button key={n} onClick={() => setQty(n)} className={`h-11 text-lg font-bold ${qty === n ? 'bg-[#c9a400] text-white' : 'bg-[#111a26] text-white/80'}`}>{n}</button>))}
          </div>
          <div className="bg-[#0c141e] text-white px-3 py-2 border-t border-[#1c2c3c]">
            {Number((ticket as any)?.discount_total) > 0 && (
              <div className="flex justify-between text-[12px] text-[#8ccf3a] mb-0.5"><span>Desconto {Number((ticket as any)?.discount_percent)}%{(ticket as any)?.discount_authorized_by ? ` · ${(ticket as any).discount_authorized_by}` : ''}</span><span>− {money((ticket as any)?.discount_total)}</span></div>
            )}
            <div className="text-right"><span className="text-white/50 text-xs mr-2">Total</span><span className="text-3xl font-bold text-[#c9a400]">{money(ticket?.grand_total)}</span></div>
          </div>
          <div className="grid grid-cols-4 gap-px bg-[#1c2c3c]">
            <ActBtn color="#a01818" onClick={() => selLine && delLine(selLine)}><Trash2 size={22} /></ActBtn>
            <ActBtn color="#33415a" onClick={() => lines.length && setReceipt({ mode: 'print' })}><Printer size={22} /></ActBtn>
            <ActBtn color="#111a26" text="#c9a400" onClick={() => lines.length && setModal('pay')}><Coins size={24} /></ActBtn>
            <ActBtn color="#1f7a34" onClick={fireKitchen}><Check size={26} strokeWidth={3} /></ActBtn>
          </div>
        </div>
      </div>
      {modal === 'pay' && <PayModal ticket={ticket} payments={payments} onClose={() => setModal('none')}
        onPaid={async () => { setModal('none'); await printReceipt(ticketId!); setTicketId(undefined); setStep('service'); inval(); }}
        onRoomCharged={(room: string) => { setModal('none'); setTicketId(undefined); setStep('service'); inval(); alert(`Consumo lançado na conta do Quarto ${room}. Fatura no check-out.`); }} inval={inval} />}
      {modal === 'split' && <SplitModal ticket={ticket} payments={payments} tables={tables} onClose={() => setModal('none')}
        onClosed={async () => { setModal('none'); await printReceipt(ticketId!); setTicketId(undefined); setStep('service'); inval(); }} inval={inval} />}
      {modal === 'customer' && <CustomerModal ticket={ticket} onClose={() => setModal('none')} onSaved={() => { setModal('none'); inval(); }} />}
      {modal === 'audit' && <AuditModal ticketId={ticketId} ticketNo={ticket?.ticket_number} onClose={() => setModal('none')} />}
      {modal === 'cash' && <CashModal session={session} onClose={() => setModal('none')} onClosed={() => { setModal('none'); setStep('cash'); }} inval={inval} />}
      {receipt && <ThermalReceiptModal ticket={ticket} lines={lines} mode={receipt.mode} outletName={outletName} destLabel={destLabel}
        onCancel={() => setReceipt(null)} onConfirm={confirmReceipt} />}
    </Shell>
  );
}

// ==================== Popup ao abrir mesa: passante/hóspede + nº pessoas ====================
function TablePopup({ table, onClose, onConfirm }: { table: any; onClose: () => void; onConfirm: (o: any) => void }) {
  const [pax, setPax] = useState<number>(table?.seats || 2);
  const [kind, setKind] = useState<'WALKIN' | 'GUEST'>('WALKIN');
  const [room, setRoom] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-[#16202e] border border-[#2a4a66] rounded-xl w-[420px] text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#2a4a66] flex items-center justify-between">
          <span className="font-bold text-lg">Abrir Mesa {table?.table_number}</span>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">×</button>
        </div>
        <div className="p-4 space-y-4">
          {/* Tipo de cliente */}
          <div>
            <div className="text-[12px] text-white/60 mb-1.5 uppercase">Tipo de cliente</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setKind('WALKIN')} className={`h-14 rounded-lg font-bold text-sm ${kind === 'WALKIN' ? 'bg-[#1565c0] text-white' : 'bg-[#0c141e] text-white/70 border border-[#2a4a66]'}`}>🚶 Passante</button>
              <button onClick={() => setKind('GUEST')} className={`h-14 rounded-lg font-bold text-sm ${kind === 'GUEST' ? 'bg-[#2e7d32] text-white' : 'bg-[#0c141e] text-white/70 border border-[#2a4a66]'}`}>🛏️ Hóspede</button>
            </div>
          </div>
          {kind === 'GUEST' && (
            <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Nº do quarto (para cobrar na conta do quarto)"
              className="w-full h-12 bg-[#0c141e] text-white px-3 rounded-lg border border-[#2a4a66] outline-none" />
          )}
          {/* Nº de pessoas */}
          <div>
            <div className="text-[12px] text-white/60 mb-1.5 uppercase">Nº de pessoas</div>
            <div className="grid grid-cols-8 gap-1.5 mb-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button key={n} onClick={() => setPax(n)} className={`h-11 rounded-lg font-bold ${pax === n ? 'bg-[#c9a400] text-white' : 'bg-[#0c141e] text-white/70 border border-[#2a4a66]'}`}>{n}</button>
              ))}
            </div>
            <input type="number" min={1} value={pax} onChange={(e) => setPax(Math.max(1, Number(e.target.value) || 1))}
              className="w-full h-11 bg-[#0c141e] text-white px-3 rounded-lg border border-[#2a4a66] outline-none text-center" />
          </div>
          <button onClick={() => onConfirm({ pax, kind, room: room.trim() || undefined })}
            className="w-full h-14 bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e] text-white font-bold rounded-lg text-lg">
            Abrir Conta ({pax} {pax === 1 ? 'pessoa' : 'pessoas'})
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Preview de talão térmico (80mm) — antes de imprimir/anular ====================
function ThermalReceiptModal({ ticket, lines, mode, outletName, destLabel, onCancel, onConfirm }:
  { ticket: any; lines: any[]; mode: 'print' | 'void'; outletName: string; destLabel: string; onCancel: () => void; onConfirm: () => void }) {
  const company = getAppearance('companyName') || 'System Mwana Lodge';
  const isVoid = mode === 'void';
  const now = new Date();
  const sub = Number(ticket?.subtotal ?? 0);
  const tax = Number(ticket?.tax_total ?? 0);
  const total = Number(ticket?.grand_total ?? 0);
  const Sep = () => <div className="border-t border-dashed border-gray-400 my-1" />;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70]" onClick={onCancel}>
      <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {/* Talão 80mm */}
        <div className="bg-white text-black shadow-2xl" style={{ width: 300, fontFamily: "'Courier New', monospace", fontSize: 12, padding: '14px 16px' }}>
          <div className="text-center">
            <div className="font-bold text-[15px] uppercase leading-tight">{company}</div>
            <div className="text-[11px]">{outletName}</div>
            <div className="text-[11px] font-bold mt-1">{isVoid ? '*** ANULAÇÃO — NOTA DE CRÉDITO ***' : 'TALÃO DE CONFERÊNCIA'}</div>
          </div>
          <Sep />
          <div className="text-[11px]">
            <div className="flex justify-between"><span>Doc:</span><span>{ticket?.ticket_number || '—'}</span></div>
            <div className="flex justify-between"><span>Data:</span><span>{now.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
            <div className="flex justify-between"><span>Operador:</span><span>{ticket?.operator_name || '—'}</span></div>
            <div className="flex justify-between"><span>Destino:</span><span>{destLabel}</span></div>
            {ticket?.customer_name && <div className="flex justify-between"><span>Cliente:</span><span>{ticket.customer_name}</span></div>}
          </div>
          <Sep />
          <div className="text-[11px]">
            {lines.map((l: any) => (
              <div key={l.id} className="flex justify-between">
                <span className="truncate pr-1">{Number(l.quantity)}x {l.description || l.item_name}</span>
                <span>{money(l.line_total ?? (Number(l.quantity) * Number(l.unit_price || 0)))}</span>
              </div>
            ))}
            {lines.length === 0 && <div className="text-center text-gray-400">— sem linhas —</div>}
          </div>
          <Sep />
          <div className="text-[11px]">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(sub)}</span></div>
            <div className="flex justify-between"><span>IVA</span><span>{money(tax)}</span></div>
            <div className="flex justify-between font-bold text-[14px] mt-0.5"><span>TOTAL</span><span>{money(total)}</span></div>
          </div>
          <Sep />
          <div className="text-center text-[10px] text-gray-600">
            {isVoid ? 'Ao confirmar, é emitida a Nota de Crédito e a venda é anulada.' : 'Documento não fiscal · o recibo fiscal é emitido no pagamento.'}
          </div>
        </div>
        {/* Botões */}
        <div className="flex gap-3 w-[300px]">
          <button onClick={onCancel} className="flex-1 h-14 bg-[#33415a] text-white font-bold rounded-lg text-lg">Cancelar</button>
          <button onClick={onConfirm} className={`flex-1 h-14 text-white font-bold rounded-lg text-lg ${isVoid ? 'bg-[#a01818]' : 'bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e]'}`}>
            {isVoid ? 'Confirmar Anulação' : 'Imprimir'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== catálogo: cores/emoji/tiles ====================
const CAT_PALETTE: Record<string, string> = {
  BEBIDAS: '#1565c0', REFRIGERANTES: '#1976d2', CERVEJAS: '#c9820a', VINHOS: '#7a1f3d', CAFES: '#4a2c1a',
  ENTRADAS: '#2e7d32', SOPAS: '#b5651d', CARNES: '#a01818', PEIXES: '#0e7490', MASSAS: '#b58900',
  SOBREMESAS: '#8e44ad', SNACKS: '#e07a1a', GRELHADOS: '#8a1a1a', SALADAS: '#1f9d55', MENUS: '#b5651d',
  PIZZAS: '#c0392b', HAMBURGUERES: '#8a4b1a', GERAL: '#334155',
};
function catColor(name: string): string {
  const k = (name || '').toUpperCase();
  if (CAT_PALETTE[k]) return CAT_PALETTE[k];
  let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 360;
  return `hsl(${h}, 45%, 34%)`;
}
function catEmoji(name: string): string {
  const s = (name || '').toLowerCase();
  const t: [string[], string][] = [
    [['bebida', 'refriger', 'sumo', 'água', 'agua'], '🥤'], [['cerveja'], '🍺'], [['vinho'], '🍷'],
    [['café', 'cafe'], '☕'], [['cocktail', 'bar'], '🍸'], [['carne', 'bife', 'grelh'], '🥩'],
    [['peixe', 'marisco'], '🐟'], [['massa', 'pasta'], '🍝'], [['pizza'], '🍕'], [['hamb', 'burger'], '🍔'],
    [['sobremesa', 'doce', 'gelado'], '🍰'], [['salada'], '🥗'], [['sopa'], '🍲'], [['entrada', 'petisc'], '🍤'],
    [['snack', 'tosta', 'sande'], '🥪'], [['menu', 'combo'], '🍱'], [['fruta'], '🍓'], [['pão', 'pao', 'padaria'], '🥐'],
  ];
  for (const [keys, e] of t) if (keys.some((k) => s.includes(k))) return e;
  return '🍽️';
}
function shade(color: string, pct: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + pct));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + pct));
  const b = Math.max(0, Math.min(255, (n & 255) + pct));
  return `rgb(${r},${g},${b})`;
}
function ProductTile({ name, price, image, color = '#1f7a34', emoji = '🍽️', onClick }: any) {
  const [broken, setBroken] = useState(false);
  const showImg = image && !broken;
  return (
    <button onClick={onClick}
      className="group relative h-28 rounded-xl overflow-hidden shadow-lg active:scale-95 transition text-left"
      style={{ background: showImg ? '#0c141e' : `linear-gradient(145deg, ${color} 0%, ${shade(color, -24)} 100%)` }}>
      {showImg ? (
        <>
          <img src={image} onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        </>
      ) : (
        <span className="absolute -right-2 -bottom-3 text-[58px] opacity-15 select-none">{emoji}</span>
      )}
      <div className="absolute inset-0 flex flex-col justify-end p-2.5">
        <span className="text-white text-[14px] font-bold leading-tight line-clamp-2 drop-shadow">{name}</span>
      </div>
      <span className="absolute top-2 right-2 bg-black/55 backdrop-blur-sm text-[#ffe08a] text-[12px] font-bold px-1.5 py-0.5 rounded">{money(price)}</span>
      <div className="absolute inset-0 ring-1 ring-white/10 rounded-xl group-hover:ring-[#c9a400]/50" />
    </button>
  );
}

// ==================== componentes ====================
function Shell({ children, op, clock, onLogout, onBack, title, right }: any) {
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a1019] overflow-hidden select-none">
      <div className="h-14 bg-gradient-to-b from-[#12203040] to-[#0a1019] flex items-center px-3 gap-2 flex-shrink-0 border-b border-[#1c2c3c]">
        <span className="text-2xl font-black tracking-tight mr-1"><span className="text-[#c9a400]">M</span><span className="text-white">L</span></span>
        {onBack && <button onClick={onBack} className="w-11 h-10 bg-[#111a26] border border-[#2a4a66] rounded text-white flex items-center justify-center"><ArrowLeft size={18} /></button>}
        {title && <span className="text-white font-bold text-lg ml-1">{title}</span>}
        <div className="flex-1" />
        {right}
        <div className="flex items-center gap-2 text-white/80 text-sm ml-2"><User size={16} />{op}</div>
        <span className="text-white/50 text-sm">{clock.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
        <button onClick={onLogout} title="Sair" className="w-10 h-10 bg-[#a01818] rounded text-white flex items-center justify-center ml-1"><Power size={18} /></button>
      </div>
      {children}
      <div className="h-6 bg-[#0c141e] border-t border-[#1c2c3c] flex items-center px-3 text-[11px] text-white/40 gap-3">
        <span className="text-[#3aa655]">● Ligado</span><span>POS-01</span><span>System Mwana Lodge</span>
        <div className="flex-1" /><span>{clock.toLocaleDateString('pt-PT')}</span>
      </div>
    </div>
  );
}

const ActBtn = ({ children, color, text = '#fff', onClick }: any) => (
  <button onClick={onClick} className="h-16 flex items-center justify-center" style={{ background: color, color: text }}>{children}</button>
);
const Empty = ({ text }: { text: string }) => <div className="col-span-full text-center text-white/40 py-16 text-sm">{text}</div>;
const PriorityTag = ({ p }: { p: string }) => {
  const c: any = { URGENT: '#e0344a', HIGH: '#c0621d', NORMAL: '#4a6', LOW: '#789' };
  const l: any = { URGENT: 'Urgente', HIGH: 'Alta', NORMAL: 'Normal', LOW: 'Baixa' };
  return <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: c[p] || '#789' }}>{l[p] || p}</span>;
};
const deliveryLabel = (s: string) => ({ PENDING: 'Por despachar', DISPATCHED: 'A caminho', DELIVERED: 'Entregue' } as any)[s] || s;

// Mapa de mesas profissional: estados, capacidade, VIP, temporizadores/alertas, filtros, indicadores.
const TBL_STATE: Record<string, { label: string; color: string }> = {
  FREE: { label: 'Livre', color: '#1f9d55' }, RESERVED: { label: 'Reservada', color: '#2563c9' },
  OCCUPIED: { label: 'Ocupada', color: '#c0392b' }, DIRTY: { label: 'Limpeza', color: '#8a8f98' },
  BLOCKED: { label: 'Bloqueada', color: '#6b7280' }, MAINTENANCE: { label: 'Manutenção', color: '#6b7280' },
};
type TF = 'ALL' | 'FREE' | 'OCCUPIED' | 'RESERVED' | 'MINE' | 'VIP' | 'NOORDER' | 'LATE';

function TableFloor({ tables, openTickets, reservations = [], opName, clock, onOpen, onOpenTicket, onGroup, onUngroup }: any) {
  const [filter, setFilter] = useState<TF>('ALL');
  const [grouping, setGrouping] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const now = clock.getTime();
  const info = (t: any) => {
    const tk = openTickets.find((k: any) => k.table === t.id || (k.dest_kind === 'TABLE' && String(k.dest_ref) === String(t.id)));
    const occupied = !!tk || t.status === 'OCCUPIED';
    const mins = tk?.opened_at ? Math.floor((now - new Date(tk.opened_at).getTime()) / 60000) : 0;
    const noOrder = !!tk && (tk.lines?.length || 0) === 0;
    const late = !!tk && mins >= 30 && noOrder;
    const res = !occupied ? reservations.find((r: any) => r.table === t.id && ['BOOKED', 'ARRIVED'].includes(r.status)) : null;
    return { tk, occupied, mins, noOrder, late, res };
  };
  const rows = tables.map((t: any) => ({ t, ...info(t) }));
  const occ = rows.filter((r: any) => r.occupied);
  const avg = occ.length ? occ.reduce((s: number, r: any) => s + Number(r.tk?.grand_total || 0), 0) / occ.length : 0;
  const occPct = tables.length ? Math.round((occ.length / tables.length) * 100) : 0;

  const match = (r: any) => {
    switch (filter) {
      case 'FREE': return !r.occupied && r.t.status === 'FREE';
      case 'OCCUPIED': return r.occupied;
      case 'RESERVED': return r.t.status === 'RESERVED';
      case 'MINE': return r.tk?.operator_name === opName;
      case 'VIP': return r.t.is_vip;
      case 'NOORDER': return r.occupied && r.noOrder;
      case 'LATE': return r.late;
      default: return true;
    }
  };
  const filtered = rows.filter(match);
  const FILTERS: [TF, string][] = [['ALL', 'Todas'], ['FREE', 'Livres'], ['OCCUPIED', 'Ocupadas'], ['RESERVED', 'Reservadas'], ['MINE', 'Minhas'], ['VIP', 'VIP'], ['NOORDER', 'Sem pedido'], ['LATE', 'Com atraso']];

  const toggleSel = (id: number) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const doGroup = () => { if (sel.length >= 2) { onGroup(sel); setSel([]); setGrouping(false); } };
  const clickTable = (r: any) => {
    if (grouping) { if (!r.occupied && !r.t.group) toggleSel(r.t.id); return; }
    if (r.t.group_ticket) onOpenTicket(r.t.group_ticket);
    else onOpen(r.t);
  };

  return (
    <div>
      {/* Indicadores */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Ind label="Ocupação" value={`${occPct}%`} color="#c9a400" />
        <Ind label="Ocupadas / Livres" value={`${occ.length} / ${tables.length - occ.length}`} color="#c0392b" />
        <Ind label="Consumo médio" value={money(avg)} color="#1f9d55" />
        <Ind label="Com atraso" value={String(rows.filter((r: any) => r.late).length)} color="#e0a83a" />
      </div>
      {/* Filtros + Agrupar */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 h-8 rounded text-[12px] font-semibold ${filter === k ? 'bg-[#c9a400] text-white' : 'bg-[#1b2636] text-white/70 border border-[#2a4a66]'}`}>{l}</button>
        ))}
        <div className="flex-1" />
        {!grouping ? (
          <button onClick={() => { setGrouping(true); setSel([]); }} className="px-3 h-8 rounded text-[12px] font-bold bg-[#6a1b9a] text-white flex items-center gap-1"><Users size={14} />Agrupar mesas</button>
        ) : (
          <>
            <span className="text-white/70 text-[12px]">{sel.length} selecionada(s)</span>
            <button onClick={doGroup} disabled={sel.length < 2} className="px-3 h-8 rounded text-[12px] font-bold bg-[#1f9d55] text-white disabled:opacity-40">Criar grupo</button>
            <button onClick={() => { setGrouping(false); setSel([]); }} className="px-3 h-8 rounded text-[12px] bg-[#33415a] text-white">Cancelar</button>
          </>
        )}
      </div>
      {/* Mesas */}
      <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
        {filtered.map((r: any) => {
          const { t, tk, occupied, mins, noOrder, late, res } = r;
          const st = TBL_STATE[t.status] || TBL_STATE.FREE;
          const grouped = !!t.group;
          const selected = sel.includes(t.id);
          const bg = grouped ? '#6a1b9a' : (late ? '#e0a83a' : (occupied ? '#c0392b' : (res ? '#2563c9' : st.color)));
          const roundCls = t.shape === 'ROUND' ? 'rounded-full' : 'rounded-lg';
          return (
            <button key={t.id} onClick={() => clickTable(r)}
              className={`relative h-28 ${roundCls} flex flex-col items-center justify-center text-white font-bold shadow ${selected ? 'ring-4 ring-[#c9a400]' : ''}`} style={{ background: bg }}>
              {t.is_vip && <span className="absolute top-1 right-2 text-[#ffe08a] text-[13px]">★</span>}
              {grouped && !grouping && <span onClick={(e) => { e.stopPropagation(); onUngroup(t.group); }} className="absolute top-1 left-1.5 text-[11px] bg-black/30 rounded px-1 hover:bg-black/60" title="Separar grupo">✂</span>}
              <span className="text-[15px] leading-tight text-center px-1">{t.name || `Mesa ${t.table_number}`}</span>
              {grouped ? (
                <span className="text-[10px] font-normal opacity-95 text-center px-1 leading-tight">👥 {t.group_name}</span>
              ) : res ? (
                <span className="text-[10px] font-normal opacity-95 text-center px-1 leading-tight">📅 {res.guest_name}<br />{new Date(res.reserved_for).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} · {res.party_size}p</span>
              ) : (
                <span className="text-[10px] font-normal opacity-90">{occupied ? (late ? '⚠ sem pedido' : (noOrder ? 'aguarda pedido' : money(tk?.grand_total))) : st.label}</span>
              )}
              <span className="text-[10px] font-normal opacity-70 flex items-center gap-1 mt-0.5">
                <User size={10} />{tk?.guests || t.recommended_capacity}/{t.max_capacity}
                {occupied && !grouped && <><Clock size={10} className="ml-1" />{mins}m</>}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && <Empty text="Sem mesas para este filtro." />}
      </div>
    </div>
  );
}
const Ind = ({ label, value, color }: any) => (
  <div className="bg-[#111a26] border border-[#2a4a66] rounded px-3 py-1.5 min-w-[120px]">
    <div className="text-[9px] uppercase tracking-wide text-white/40">{label}</div>
    <div className="text-lg font-bold" style={{ color }}>{value}</div>
  </div>
);

const RES_COLOR: Record<string, string> = { BOOKED: '#2563c9', ARRIVED: '#c9a400', SEATED: '#1f9d55', CANCELLED: '#8a8f98', NO_SHOW: '#c0392b' };
const PREF: [string, string][] = [['', 'Sem preferência'], ['WINDOW', 'Janela'], ['TERRACE', 'Terraço'], ['VIP', 'VIP'], ['NON_SMOKING', 'Não fumador']];

function ReservationsPanel({ reservations, tables, onCreate, onSeat, onAction }: any) {
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState<any>({ guest_name: '', phone: '', party_size: 2, reserved_for: nowLocal, table: '', preference: '', note: '' });
  const active = reservations.filter((r: any) => ['BOOKED', 'ARRIVED', 'SEATED'].includes(r.status)).sort((a: any, b: any) => a.reserved_for.localeCompare(b.reserved_for));
  const submit = () => { if (!f.guest_name) return; onCreate({ ...f, table: f.table || null, party_size: Number(f.party_size) || 1 }); setF({ ...f, guest_name: '', phone: '', note: '' }); };
  return (
    <div className="flex gap-4">
      {/* Lista */}
      <div className="flex-1">
        <div className="text-white/70 text-sm font-bold mb-2">Reservas de hoje</div>
        <div className="space-y-2">
          {active.map((r: any) => (
            <div key={r.id} className="bg-[#1b2636] border border-[#2a4a66] rounded-lg p-3 flex items-center gap-3">
              <div className="w-1.5 h-12 rounded" style={{ background: RES_COLOR[r.status] }} />
              <div className="flex-1">
                <div className="text-white font-bold flex items-center gap-2">{r.guest_name}
                  <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: RES_COLOR[r.status] }}>{r.status_display}</span>
                  {r.preference && <span className="text-[10px] text-[#c9a400]">· {r.preference_display}</span>}
                </div>
                <div className="text-white/50 text-[12px]">{new Date(r.reserved_for).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {r.party_size}p · {r.table_label ? `Mesa ${r.table_label}` : 'sem mesa'}{r.phone ? ` · ${r.phone}` : ''}</div>
              </div>
              {r.status === 'BOOKED' && <button onClick={() => onAction(r.id, 'arrive')} className="h-9 px-3 bg-[#c9a400] text-white rounded text-[12px] font-bold flex items-center gap-1"><LogIn size={13} />Chegada</button>}
              {(r.status === 'BOOKED' || r.status === 'ARRIVED') && <button onClick={() => onSeat(r)} className="h-9 px-3 bg-[#1f9d55] text-white rounded text-[12px] font-bold flex items-center gap-1"><Check size={13} />Sentar</button>}
              {r.status !== 'SEATED' && <button onClick={() => onAction(r.id, 'cancel')} className="h-9 px-2 bg-[#33415a] text-white/80 rounded text-[12px]">Cancelar</button>}
              {r.status === 'BOOKED' && <button onClick={() => onAction(r.id, 'cancel', { no_show: true })} className="h-9 px-2 bg-[#5a2020] text-white/80 rounded text-[12px]">No-show</button>}
            </div>
          ))}
          {active.length === 0 && <Empty text="Sem reservas ativas." />}
        </div>
      </div>
      {/* Nova reserva */}
      <div className="w-[300px] bg-[#111a26] border border-[#2a4a66] rounded-lg p-3 self-start">
        <div className="text-white font-bold mb-2 flex items-center gap-1.5"><Plus size={15} />Nova reserva</div>
        <div className="space-y-2 text-[12px]">
          <input placeholder="Nome do cliente" value={f.guest_name} onChange={(e) => setF({ ...f, guest_name: e.target.value })} className="w-full h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" />
          <input placeholder="Telefone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="w-full h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" />
          <div className="flex gap-2">
            <input type="number" min={1} placeholder="Pessoas" value={f.party_size} onChange={(e) => setF({ ...f, party_size: e.target.value })} className="w-1/2 h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" />
            <select value={f.table} onChange={(e) => setF({ ...f, table: e.target.value })} className="w-1/2 h-10 bg-[#0c141e] text-white px-1 rounded border border-[#2a4a66] outline-none">
              <option value="">Sem mesa</option>
              {tables.map((t: any) => <option key={t.id} value={t.id}>{t.name || `Mesa ${t.table_number}`}</option>)}
            </select>
          </div>
          <input type="datetime-local" value={f.reserved_for} onChange={(e) => setF({ ...f, reserved_for: e.target.value })} className="w-full h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" />
          <select value={f.preference} onChange={(e) => setF({ ...f, preference: e.target.value })} className="w-full h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none">
            {PREF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="Observações" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="w-full h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" />
          <button onClick={submit} disabled={!f.guest_name} className="w-full h-11 bg-[#1565c0] text-white font-bold rounded disabled:opacity-50">Criar reserva</button>
        </div>
      </div>
    </div>
  );
}

function Overlay({ children, onClose }: any) {
  return <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
    <div className="bg-[#111a26] border border-[#2a4a66] rounded-xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>;
}

function PayModal({ ticket, payments, onClose, onPaid, onRoomCharged, inval }: any) {
  const isRoom = (ticket as any)?.dest_kind === 'ROOM';
  const roomFromLabel = String((ticket as any)?.dest_label || '').replace(/[^0-9]/g, '');
  const [mode, setMode] = useState<'PAY' | 'ROOM'>(isRoom ? 'ROOM' : 'PAY');
  const [method, setMethod] = useState<number | undefined>(payments[0]?.payment_method);
  const [amount, setAmount] = useState(String(ticket?.balance_due ?? ticket?.grand_total ?? ''));
  const [room, setRoom] = useState(roomFromLabel);
  const [busy, setBusy] = useState(false);
  const bal = Number(ticket?.balance_due ?? ticket?.grand_total ?? 0);
  const change = Math.max(0, Number(amount || 0) - bal);
  const pay = async () => {
    if (!method) return; setBusy(true);
    try {
      await posMgmtApi.payTicket(ticket.id, method, amount || bal);
      const tk = await posMgmtApi.getTicket(ticket.id); inval();
      if (Number(tk.balance_due ?? 0) <= 0) onPaid(); else { setAmount(String(tk.balance_due)); alert('Pagamento parcial registado. Saldo: ' + money(tk.balance_due)); }
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro no pagamento'); }
    finally { setBusy(false); }
  };
  const chargeRoom = async () => {
    if (!room) return alert('Indique o número do quarto.'); setBusy(true);
    try { await posMgmtApi.chargeToRoom(ticket.id, room); inval(); onRoomCharged(room); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao lançar no quarto'); }
    finally { setBusy(false); }
  };
  return (
    <Overlay onClose={onClose}>
      <div className="w-[460px]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-white text-lg font-bold">Fecho de Conta</h3><button onClick={onClose} className="text-white/50"><X size={18} /></button></div>
        <div className="text-center bg-[#0c141e] rounded-lg py-3 mb-3"><div className="text-white/50 text-xs">Total a pagar</div><div className="text-4xl font-bold text-[#c9a400]">{money(bal)}</div></div>
        {/* Destino do pagamento */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => setMode('PAY')} className={`flex-1 h-11 rounded-lg font-bold flex items-center justify-center gap-1.5 ${mode === 'PAY' ? 'bg-[#1565c0] text-white' : 'bg-[#1b2636] text-white/60'}`}><Coins size={16} />Cobrar agora</button>
          <button onClick={() => setMode('ROOM')} className={`flex-1 h-11 rounded-lg font-bold flex items-center justify-center gap-1.5 ${mode === 'ROOM' ? 'bg-[#1565c0] text-white' : 'bg-[#1b2636] text-white/60'}`}><BedDouble size={16} />Conta do Quarto</button>
        </div>

        {mode === 'PAY' ? (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {payments.map((p: any) => (
                <button key={p.id} onClick={() => setMethod(p.payment_method)}
                  className={`h-14 rounded-lg font-bold flex items-center justify-center gap-2 ${method === p.payment_method ? 'bg-[#1565c0] text-white' : 'bg-[#1b2636] text-white/70 border border-[#2a4a66]'}`}>
                  {(p.method_type_code || '').includes('CASH') ? <Banknote size={18} /> : <CreditCard size={18} />}{p.payment_method_name}
                </button>
              ))}
              {payments.length === 0 && <div className="col-span-2 text-white/50 text-sm text-center py-2">Sem métodos de pagamento no outlet.</div>}
            </div>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full h-14 bg-[#0c141e] text-white text-center text-2xl rounded-lg mb-2 outline-none border border-[#2a4a66]" />
            {change > 0 && <div className="text-center text-[#8ccf3a] font-bold mb-2">Troco: {money(change)}</div>}
            <button onClick={pay} disabled={busy || !method} className="w-full h-14 bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e] text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"><Check size={20} /> {busy ? 'A processar…' : 'Confirmar & Emitir Recibo'}</button>
            <div className="text-center text-white/40 text-[11px] mt-2">Emite Factura-Recibo (AGT) automaticamente ao liquidar.</div>
          </>
        ) : (
          <>
            <label className="text-white/70 text-sm block mb-1">Nº do quarto</label>
            <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Ex: 203" className="w-full h-14 bg-[#0c141e] text-white text-center text-2xl rounded-lg mb-3 outline-none border border-[#2a4a66]" />
            <button onClick={chargeRoom} disabled={busy || !room} className="w-full h-14 bg-gradient-to-b from-[#2a6ad0] to-[#1a4e9e] text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"><BedDouble size={20} /> {busy ? 'A lançar…' : 'Lançar na Conta do Quarto'}</button>
            <div className="text-center text-white/40 text-[11px] mt-2">O consumo entra no folio do hóspede. A fatura é emitida no check-out.</div>
          </>
        )}
      </div>
    </Overlay>
  );
}

function SplitModal({ ticket, payments, tables, onClose, onClosed, inval }: any) {
  const [tab, setTab] = useState<'PEOPLE' | 'ITEMS'>('PEOPLE');
  const [people, setPeople] = useState(2);
  const [method, setMethod] = useState<number | undefined>(payments[0]?.payment_method);
  const [sel, setSel] = useState<number[]>([]);
  const [target, setTarget] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const lines = ticket?.lines || [];
  const bal = Number(ticket?.balance_due ?? ticket?.grand_total ?? 0);
  const share = people > 0 ? bal / people : bal;
  const toggle = (id: number) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const payShare = async () => {
    if (!method) return; setBusy(true);
    try {
      await posMgmtApi.payTicket(ticket.id, method, share.toFixed(2));
      const tk = await posMgmtApi.getTicket(ticket.id); inval();
      if (Number(tk.balance_due ?? 0) <= 0) onClosed();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); }
    finally { setBusy(false); }
  };
  const moveToNew = async () => {
    if (!sel.length) return; setBusy(true);
    try { await apiClient.post(`pos/tickets/${ticket.id}/split/`, { line_ids: sel }); inval(); onClose(); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } finally { setBusy(false); }
  };
  const transferTo = async () => {
    if (!sel.length || !target) return; setBusy(true);
    try { await apiClient.post(`pos/tickets/${ticket.id}/transfer_lines/`, { line_ids: sel, table: target }); inval(); onClose(); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } finally { setBusy(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="w-[500px]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-white text-lg font-bold flex items-center gap-2"><Split size={18} />Dividir Conta</h3><button onClick={onClose} className="text-white/50"><X size={18} /></button></div>
        <div className="flex gap-1 mb-3">
          <button onClick={() => setTab('PEOPLE')} className={`flex-1 h-10 rounded font-bold flex items-center justify-center gap-1.5 ${tab === 'PEOPLE' ? 'bg-[#1565c0] text-white' : 'bg-[#1b2636] text-white/60'}`}><Users size={16} />Por pessoas</button>
          <button onClick={() => setTab('ITEMS')} className={`flex-1 h-10 rounded font-bold flex items-center justify-center gap-1.5 ${tab === 'ITEMS' ? 'bg-[#1565c0] text-white' : 'bg-[#1b2636] text-white/60'}`}><ArrowRightLeft size={16} />Por artigos</button>
        </div>

        {tab === 'PEOPLE' && (
          <div>
            <div className="text-center bg-[#0c141e] rounded-lg py-3 mb-3"><div className="text-white/50 text-xs">Saldo em falta</div><div className="text-3xl font-bold text-[#c9a400]">{money(bal)}</div></div>
            <div className="flex items-center justify-center gap-3 mb-3">
              <button onClick={() => setPeople((p) => Math.max(1, p - 1))} className="w-11 h-11 bg-[#1b2636] text-white text-xl rounded-lg">−</button>
              <div className="text-center"><div className="text-white text-3xl font-bold">{people}</div><div className="text-white/40 text-[11px]">pessoas</div></div>
              <button onClick={() => setPeople((p) => p + 1)} className="w-11 h-11 bg-[#1b2636] text-white text-xl rounded-lg">+</button>
            </div>
            <div className="text-center text-white mb-3">Cada parte: <b className="text-[#8ccf3a] text-lg">{money(share)}</b></div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {payments.map((p: any) => (
                <button key={p.id} onClick={() => setMethod(p.payment_method)} className={`h-11 rounded-lg font-bold text-sm ${method === p.payment_method ? 'bg-[#1565c0] text-white' : 'bg-[#1b2636] text-white/70 border border-[#2a4a66]'}`}>{p.payment_method_name}</button>
              ))}
            </div>
            <button onClick={payShare} disabled={busy || !method} className="w-full h-13 py-3 bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e] text-white font-bold rounded-lg disabled:opacity-50">Registar pagamento de 1 parte ({money(share)})</button>
            <div className="text-center text-white/40 text-[11px] mt-2">Repita por cada pessoa. A Factura-Recibo é emitida quando o saldo chega a zero.</div>
          </div>
        )}

        {tab === 'ITEMS' && (
          <div>
            <div className="max-h-56 overflow-auto bg-[#0c141e] rounded-lg mb-3">
              {lines.map((l: any) => (
                <label key={l.id} className={`flex items-center gap-2 px-3 py-2 border-b border-[#1c2c3c] cursor-pointer ${sel.includes(l.id) ? 'bg-[#17334d]' : ''}`}>
                  <input type="checkbox" checked={sel.includes(l.id)} onChange={() => toggle(l.id)} />
                  <span className="flex-1 text-white text-sm">{Number(l.quantity).toFixed(0)}× {l.description}</span>
                  <span className="text-white/70 text-sm">{money(l.line_total)}</span>
                </label>
              ))}
            </div>
            <div className="text-white/60 text-[12px] mb-2">{sel.length} artigo(s) selecionado(s)</div>
            <button onClick={moveToNew} disabled={busy || !sel.length} className="w-full h-11 mb-2 bg-[#6a1b9a] text-white font-bold rounded-lg disabled:opacity-50">Mover para nova conta (dividir)</button>
            <div className="flex gap-2">
              <select value={target || ''} onChange={(e) => setTarget(Number(e.target.value) || undefined)} className="flex-1 h-11 bg-[#0c141e] text-white px-2 rounded-lg border border-[#2a4a66] outline-none">
                <option value="">— transferir p/ mesa —</option>
                {tables.map((t: any) => <option key={t.id} value={t.id}>{t.name || `Mesa ${t.table_number}`}</option>)}
              </select>
              <button onClick={transferTo} disabled={busy || !sel.length || !target} className="px-4 h-11 bg-[#1565c0] text-white font-bold rounded-lg disabled:opacity-50 flex items-center gap-1"><ArrowRightLeft size={16} />Transferir</button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

function CustomerModal({ ticket, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({
    customer_name: ticket?.customer_name || '', customer_tax_id: ticket?.customer_tax_id || '',
    company_name: ticket?.company_name || '', adults: ticket?.adults || ticket?.guests || 1, children: ticket?.children || 0,
    customer_id: undefined,
  });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  const [disc, setDisc] = useState(String(ticket?.discount_percent || ''));
  const search = async () => {
    if (!q) return;
    try { const d = (await apiClient.get('mdm/customers/', { params: { page: 1, page_size: 8, search: q } })).data; setResults(d?.results || d || []); }
    catch { setResults([]); }
  };
  const pick = (c: any) => { setPicked(c); setF({ ...f, customer_name: c.name || c.trade_name, customer_tax_id: c.tax_id || c.nif || '', company_name: c.company_name || '', customer_id: c.id }); };
  const applyDiscount = async (pct: string) => { try { await apiClient.post(`pos/tickets/${ticket.id}/set_discount/`, { percent: Number(pct) || 0 }); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } };
  const save = async () => {
    setBusy(true);
    try { await apiClient.post(`pos/tickets/${ticket.id}/set_customer/`, f); if (disc !== String(ticket?.discount_percent || '')) await applyDiscount(disc); onSaved(); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } finally { setBusy(false); }
  };
  const clear = async () => { setBusy(true); try { await apiClient.post(`pos/tickets/${ticket.id}/set_customer/`, { customer_name: '', customer_tax_id: '', company_name: '', adults: f.adults, children: f.children }); onSaved(); } finally { setBusy(false); } };
  return (
    <Overlay onClose={onClose}>
      <div className="w-[460px]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-white text-lg font-bold flex items-center gap-2"><UserPlus size={18} />Cliente / Hóspede</h3><button onClick={onClose} className="text-white/50"><X size={18} /></button></div>
        <div className="flex gap-2 mb-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Pesquisar cliente (nome/NIF)…" className="flex-1 h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none text-sm" />
          <button onClick={search} className="px-3 h-10 bg-[#33415a] text-white rounded text-sm">Procurar</button>
        </div>
        {results.length > 0 && (
          <div className="max-h-32 overflow-auto bg-[#0c141e] rounded mb-3 border border-[#2a4a66]">
            {results.map((c: any) => (
              <button key={c.id} onClick={() => { pick(c); setResults([]); }} className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-[#17334d] border-b border-[#1c2c3c]">{c.name || c.trade_name} {c.is_vip && <span className="text-[#c9a400]">★VIP</span>} <span className="text-white/40">· {c.tax_id || c.nif || 's/ NIF'}</span></button>
            ))}
          </div>
        )}
        <div className="space-y-2 text-sm">
          <input value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} placeholder="Nome do cliente" className="w-full h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" />
          <div className="flex gap-2">
            <input value={f.customer_tax_id} onChange={(e) => setF({ ...f, customer_tax_id: e.target.value })} placeholder="NIF (contribuinte)" className="flex-1 h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" />
            <input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} placeholder="Empresa" className="flex-1 h-10 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-white/60 text-[12px] w-16">Pessoas:</span>
            <label className="flex items-center gap-1 text-white/80 text-[12px]">Adultos <input type="number" min={0} value={f.adults} onChange={(e) => setF({ ...f, adults: Number(e.target.value) })} className="w-16 h-9 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" /></label>
            <label className="flex items-center gap-1 text-white/80 text-[12px]">Crianças <input type="number" min={0} value={f.children} onChange={(e) => setF({ ...f, children: Number(e.target.value) })} className="w-16 h-9 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none" /></label>
            <span className="text-white/40 text-[12px]">= {Number(f.adults) + Number(f.children)} total</span>
          </div>
        </div>
        {picked?.is_vip && (
          <div className="mt-2 bg-[#2a2410] border border-[#c9a400]/40 rounded px-3 py-2 text-[12px] text-[#ffe08a] flex items-center justify-between">
            <span>★ Cliente VIP · desconto {Number(picked.vip_discount_percent)}%</span>
            <span>Limite crédito: {money(picked.credit_limit)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-white/60 text-[12px]">Desconto %:</span>
          <input type="number" min={0} max={100} value={disc} onChange={(e) => setDisc(e.target.value)} className="w-20 h-9 bg-[#0c141e] text-white px-2 rounded border border-[#2a4a66] outline-none text-sm" placeholder="0" />
          <span className="text-white/40 text-[11px]">aplicado ao total (autorizado pelo operador)</span>
        </div>
        <div className="text-white/40 text-[11px] mt-2">Com NIF, a Factura-Recibo é emitida em nome do cliente (não Consumidor Final).</div>
        <div className="flex gap-2 mt-3">
          <button onClick={clear} className="px-3 h-11 bg-[#33415a] text-white/80 rounded font-bold text-sm">Limpar cliente</button>
          <button onClick={save} disabled={busy} className="flex-1 h-11 bg-[#1565c0] text-white font-bold rounded disabled:opacity-50">Guardar</button>
        </div>
      </div>
    </Overlay>
  );
}

const AUDIT_COLOR: Record<string, string> = {
  TICKET_OPEN: '#2563c9', LINE_ADD: '#1f9d55', LINE_VOID: '#c0392b', KITCHEN_FIRE: '#c9a400',
  PAYMENT: '#16a085', DOC_ISSUE: '#8e44ad', TICKET_VOID: '#a01818', TICKET_DESTINATION: '#00838f',
  TICKET_DELIVERED: '#2e7d32', CASH_OPEN: '#555', CASH_MOVE: '#b5651d', CASH_CLOSE: '#555',
};
function AuditModal({ ticketId, ticketNo, onClose }: any) {
  const { data: logs = [] } = useQuery({ queryKey: ['pos-audit', ticketId], queryFn: async () => (await apiClient.get(`pos/tickets/${ticketId}/audit/`)).data, enabled: !!ticketId });
  return (
    <Overlay onClose={onClose}>
      <div className="w-[560px]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-white text-lg font-bold flex items-center gap-2"><History size={18} />Auditoria da Mesa · {ticketNo}</h3><button onClick={onClose} className="text-white/50"><X size={18} /></button></div>
        <div className="max-h-[60vh] overflow-auto bg-[#0c141e] rounded-lg border border-[#2a4a66]">
          {logs.map((l: any, i: number) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2 border-b border-[#1c2c3c]">
              <span className="w-1.5 h-full min-h-[34px] rounded flex-shrink-0" style={{ background: AUDIT_COLOR[l.event_type] || '#555' }} />
              <div className="flex-1">
                <div className="text-white text-sm font-semibold">{l.event_display}{l.amount ? <span className="text-[#c9a400] ml-2">{money(l.amount)}</span> : null}</div>
                <div className="text-white/60 text-[12px]">{l.description}</div>
                <div className="text-white/35 text-[11px]">{l.operator || l.user || '—'} · {new Date(l.at).toLocaleString('pt-PT')}{l.ip ? ` · ${l.ip}` : ''}</div>
              </div>
            </div>
          ))}
          {logs.length === 0 && <div className="text-center text-white/40 py-10 text-sm">Sem eventos registados.</div>}
        </div>
        <div className="text-white/40 text-[11px] mt-2">Registo imutável: abertura, artigos adicionados/cancelados, envio à cozinha, pagamentos, transferências, agrupamentos.</div>
      </div>
    </Overlay>
  );
}

function CashModal({ session, onClose, onClosed, inval }: any) {
  const [mv, setMv] = useState('REFORCO');
  const [amt, setAmt] = useState('');
  const [counted, setCounted] = useState('');
  const doMove = async () => { if (!amt) return; try { await posMgmtApi.addCashMovement(session.id, { movement_type: mv, amount: amt } as any); setAmt(''); inval(); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } };
  const doClose = async () => { if (!counted) return alert('Indique o valor contado.'); try { await posMgmtApi.closeCashSession(session.id, counted, ''); onClosed(); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } };
  return (
    <Overlay onClose={onClose}>
      <div className="w-[420px]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-white text-lg font-bold">Gestão de Caixa</h3><button onClick={onClose} className="text-white/50"><X size={18} /></button></div>
        <div className="text-white/60 text-sm mb-3">Abertura: <b className="text-white">{money(session?.opening_float)}</b> · Esperado: <b className="text-[#7cbf30]">{money(session?.expected_cash)}</b></div>
        <div className="flex gap-2 mb-2">
          <button onClick={() => setMv('REFORCO')} className={`flex-1 h-11 rounded-lg font-bold flex items-center justify-center gap-1 ${mv === 'REFORCO' ? 'bg-[#2e7d32] text-white' : 'bg-[#1b2636] text-white/70'}`}><TrendingUp size={16} />Reforço</button>
          <button onClick={() => setMv('SANGRIA')} className={`flex-1 h-11 rounded-lg font-bold flex items-center justify-center gap-1 ${mv === 'SANGRIA' ? 'bg-[#a01818] text-white' : 'bg-[#1b2636] text-white/70'}`}><TrendingDown size={16} />Sangria</button>
        </div>
        <div className="flex gap-2 mb-4"><input type="number" placeholder="Valor" value={amt} onChange={(e) => setAmt(e.target.value)} className="flex-1 h-11 bg-[#0c141e] text-white px-3 rounded-lg outline-none border border-[#2a4a66]" /><button onClick={doMove} className="px-4 h-11 bg-[#c9a400] text-white rounded-lg font-bold">Registar</button></div>
        <div className="border-t border-[#2a4a66] pt-3">
          <div className="text-white/70 text-sm mb-1">Fecho de caixa — valor contado</div>
          <div className="flex gap-2"><input type="number" placeholder="Contado" value={counted} onChange={(e) => setCounted(e.target.value)} className="flex-1 h-11 bg-[#0c141e] text-white px-3 rounded-lg outline-none border border-[#2a4a66]" /><button onClick={doClose} className="px-4 h-11 bg-[#a01818] text-white rounded-lg font-bold flex items-center gap-1"><LogOut size={16} />Fechar</button></div>
        </div>
      </div>
    </Overlay>
  );
}
