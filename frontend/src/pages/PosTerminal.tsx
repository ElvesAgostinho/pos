import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Table2, Coins, ArrowLeft, Trash2, Printer, Check, Power, Lock, Unlock, User, Search,
  RefreshCw, ArrowRightLeft, Delete, X, TrendingUp, TrendingDown, LogOut, Split, Merge, Undo2, BarChart3,
} from 'lucide-react';
import { tokenStore } from '../api/auth';
import { posMgmtApi } from '../api/posmgmt';
import {
  useOutlets, useTables, useProductConfigs, useOutletPayments, useCashSessions,
  useOpenCashSession, useAddCashMovement, useCloseCashSession, useTickets, useTicket,
  useOpenTicket, useAddTicketLine, useFireKitchen, useDeleteTicketLine, usePosSummary,
} from '../hooks/usePosMgmt';
import { useCombos } from '../hooks/useCommercial';

const CAT_COLORS = ['#b5651d', '#6a1b9a', '#4a2c1a', '#a01818', '#2e7d32', '#b5651d', '#8a1a1a', '#1565c0'];
const money = (v: any) => Number(v || 0).toFixed(2);

type Modal = 'none' | 'pay' | 'cash' | 'transfer' | 'preconta' | 'split' | 'merge' | 'refunds' | 'dashboard';

export default function PosTerminal() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const operator = tokenStore.getPosOperator();
  const opName = operator?.name || 'Operador';
  const inval = () => qc.invalidateQueries({ queryKey: ['posmgmt'] });

  const { data: outlets = [] } = useOutlets();
  const [outlet, setOutlet] = useState<number | undefined>();
  const [step, setStep] = useState<'sector' | 'cash' | 'tables' | 'order'>('sector');
  const [ticketId, setTicketId] = useState<number | undefined>();
  const [cat, setCat] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [selLine, setSelLine] = useState<number | undefined>();
  const [floatVal, setFloatVal] = useState('0');
  const [modal, setModal] = useState<Modal>('none');

  const outletName = outlets.find((o: any) => o.id === outlet)?.name || '';
  const { data: tables = [] } = useTables(outlet);
  const { data: configs = [] } = useProductConfigs(outlet);
  const { data: payments = [] } = useOutletPayments(outlet);
  const { data: combos = [] } = useCombos();
  const { data: cashSessions = [] } = useCashSessions();
  const { data: openTickets = [] } = useTickets(outlet ? { outlet, status: 'OPEN' } : undefined);
  const { data: ticket } = useTicket(ticketId);

  const openCash = useOpenCashSession();
  const addMovement = useAddCashMovement();
  const closeCash = useCloseCashSession();
  const openTicket = useOpenTicket();
  const addLine = useAddTicketLine();
  const fire = useFireKitchen();
  const delLine = useDeleteTicketLine();

  const session: any = useMemo(
    () => cashSessions.find((s: any) => s.outlet === outlet && s.status === 'OPEN'),
    [cashSessions, outlet]);

  useEffect(() => { if (step === 'sector' && outlets.length === 1) setOutlet(outlets[0].id); }, [outlets, step]);
  useEffect(() => { if ((step === 'tables' || step === 'order') && !session) setStep('cash'); }, [session, step]);

  const categories = useMemo(() => {
    const g: Record<string, any[]> = {};
    configs.filter((c: any) => c.is_available !== false).forEach((c: any) => {
      const k = (c.item_category || c.pos_category || 'GERAL').toUpperCase();
      (g[k] = g[k] || []).push(c);
    });
    return g;
  }, [configs]);
  const catNames = useMemo(() => {
    const list = Object.keys(categories);
    if (combos.length) list.push('MENUS');
    return list;
  }, [categories, combos]);

  const pickSector = (o: any) => { setOutlet(o.id); setStep(session ? 'tables' : 'cash'); };
  const doOpenCash = () => openCash.mutate(
    { outlet, operator_name: opName, opening_float: Number(floatVal) || 0, terminal_name: 'POS-01' } as any,
    { onSuccess: () => setStep('tables'), onError: (e: any) => alert(e?.response?.data?.detail || 'Erro ao abrir caixa') });
  const openTable = (t: any) => {
    const ex = openTickets.find((k: any) => k.table === t.id);
    if (ex) { setTicketId(ex.id); setStep('order'); setCat(null); return; }
    openTicket.mutate({ outlet, table: t.id, operator_name: opName, guests: 1 } as any,
      { onSuccess: (tk: any) => { setTicketId(tk.id); setStep('order'); setCat(null); },
        onError: (e: any) => alert(JSON.stringify(e?.response?.data)) });
  };
  const addItem = (c: any) => addLine.mutate({ id: ticketId!, line: { item: c.item, quantity: qty } });
  const addCombo = async (combo: any) => {
    try { await posMgmtApi.addCombo(ticketId!, combo.id); inval(); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro no combo'); }
  };
  const doTransfer = async (t: any) => {
    try { await posMgmtApi.transferTable(ticketId!, t.id); inval(); setModal('none'); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro na transferência'); }
  };
  const logout = () => { tokenStore.clearPos(); nav('/pos/login'); };
  const tableColor = (s: string) => ({ FREE: '#1a8f8f', OCCUPIED: '#c0621d', RESERVED: '#b59a1a', DIRTY: '#7a7a7a' } as any)[s] || '#1a8f8f';
  const balance = Number((ticket as any)?.balance_due ?? ticket?.grand_total ?? 0);

  const Header = ({ right }: { right?: ReactNode }) => (
    <div className="h-16 bg-gradient-to-b from-[#222] to-[#000] flex items-center px-3 gap-2 flex-shrink-0">
      <div className="flex items-end leading-none mr-2">
        <span className="text-2xl font-black tracking-tight"><span className="text-[#c9a400]">M</span><span className="text-white">L</span></span>
      </div>
      <button onClick={() => { if (step === 'order') setStep('tables'); }}
        className="w-14 h-11 bg-gradient-to-b from-[#c9a400] to-[#a07f00] rounded flex items-center justify-center"><Table2 className="text-white" /></button>
      <button onClick={() => session && setModal('cash')} title="Caixa"
        className="w-14 h-11 bg-[#111] border border-[#333] rounded flex items-center justify-center"><Coins className="text-[#c9a400]" /></button>
      <div className="flex-1" />
      {right}
    </div>
  );

  // ---------------- SETOR ----------------
  if (step === 'sector') return (
    <div className="h-screen flex flex-col bg-[#2a2a2a]">
      <Header />
      <div className="flex-1 p-6">
        <div className="text-center text-white text-lg font-bold mb-4">Selecione o Setor</div>
        <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
          {outlets.map((o: any) => (
            <button key={o.id} onClick={() => pickSector(o)} className="h-28 bg-[#1a8f8f] hover:bg-[#20a0a0] text-white text-lg font-bold rounded shadow">{o.name}</button>
          ))}
        </div>
      </div>
      <Footer name={outletName} op={opName} />
    </div>
  );

  // ---------------- CAIXA (abertura) ----------------
  if (step === 'cash') return (
    <div className="h-screen flex flex-col bg-[#2a2a2a]">
      <Header />
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-[#1f1f1f] border border-[#333] rounded-lg p-8 w-[380px] text-center">
          <Lock className="mx-auto text-[#c0621d] mb-3" size={40} />
          <div className="text-white text-xl font-bold mb-1">Caixa Fechada</div>
          <div className="text-gray-400 text-sm mb-5">{outletName} · {opName}</div>
          <label className="text-gray-300 text-sm block mb-1">Fundo de maneio (abertura)</label>
          <input type="number" value={floatVal} onChange={(e) => setFloatVal(e.target.value)} className="w-full h-12 bg-[#3a3a3a] text-white text-center text-2xl rounded mb-4 outline-none" />
          <button onClick={doOpenCash} className="w-full h-14 bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e] text-white font-bold rounded flex items-center justify-center gap-2"><Unlock size={20} /> Abrir Caixa</button>
          <button onClick={() => setStep('sector')} className="mt-3 text-gray-400 text-sm hover:text-white">← Voltar ao setor</button>
        </div>
      </div>
      <Footer name={outletName} op={opName} />
    </div>
  );

  // ---------------- MESAS ----------------
  if (step === 'tables') return (
    <div className="h-screen flex flex-col bg-[#2a2a2a]">
      <Header right={<div className="flex items-center gap-2 text-white text-sm"><User size={16} />{opName}</div>} />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-32 bg-[#111] flex flex-col">
          <SideBtn icon={BarChart3} label="Dashboard" onClick={() => setModal('dashboard')} />
          <SideBtn icon={Search} label="Consulta de Mesa" onClick={inval} />
          <SideBtn icon={Coins} label="Caixa" onClick={() => setModal('cash')} />
          <SideBtn icon={Undo2} label="Estornos" onClick={() => setModal('refunds')} />
          <SideBtn icon={RefreshCw} label="Atualizar" onClick={inval} />
          <div className="flex-1" />
          <button onClick={logout} className="h-20 bg-[#a01818] hover:bg-[#c02020] text-white flex flex-col items-center justify-center gap-1"><Power size={22} /><span className="text-xs font-bold">Sair</span></button>
        </div>
        <div className="flex-1 relative bg-[#f7eeee] overflow-auto">
          {tables.map((t: any) => {
            const occupied = openTickets.some((k: any) => k.table === t.id);
            return (
              <div key={t.id} onClick={() => openTable(t)} className="absolute text-white font-bold cursor-pointer flex items-start p-1 shadow-md"
                style={{ left: (t.pos_x ?? 30), top: (t.pos_y ?? 30), width: 96, height: 116, background: occupied ? '#c0621d' : tableColor(t.status), borderRadius: t.shape === 'ROUND' ? '50%' : 6 }}>
                <span className="w-3.5 h-3.5 rounded-full bg-[#3fd23f] border border-white/40" />
                <span className="ml-1 text-lg drop-shadow">{t.table_number}</span>
              </div>
            );
          })}
          {tables.length === 0 && <div className="p-8 text-gray-500">Sem mesas neste outlet. Configure em POS Management → Mapa de Mesas.</div>}
        </div>
      </div>
      <Footer name={outletName} op={opName} />
      {modal === 'cash' && <CashModal />}
      {modal === 'refunds' && <RefundsModal />}
      {modal === 'dashboard' && <DashboardModal />}
    </div>
  );

  // ---------------- PEDIDO ----------------
  const lines = ticket?.lines || [];
  return (
    <div className="h-screen flex flex-col bg-[#2a2a2a]">
      <Header right={
        <div className="flex items-center gap-2">
          <button onClick={() => setModal('transfer')} className="h-9 px-2.5 bg-[#c9a400] text-white rounded text-sm font-bold flex items-center gap-1"><ArrowRightLeft size={14} />Transferir</button>
          <button onClick={() => setModal('split')} className="h-9 px-2.5 bg-[#6a1b9a] text-white rounded text-sm font-bold flex items-center gap-1"><Split size={14} />Dividir</button>
          <button onClick={() => setModal('merge')} className="h-9 px-2.5 bg-[#1565c0] text-white rounded text-sm font-bold flex items-center gap-1"><Merge size={14} />Juntar</button>
          <div className="bg-[#111] px-3 py-1 rounded text-white text-sm font-bold">Mesa: {ticket?.table_label || '—'}</div>
        </div>} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-3 overflow-auto">
          <div className="flex flex-wrap gap-3">
            <button onClick={() => { if (cat) setCat(null); else setStep('tables'); }} className="w-24 h-24 bg-[#333] text-[#c9a400] rounded flex items-center justify-center"><ArrowLeft size={34} /></button>
            {!cat && catNames.map((c, i) => (
              <button key={c} onClick={() => setCat(c)} style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} className="min-w-[150px] h-24 px-4 text-white text-lg font-bold rounded shadow">{c}</button>
            ))}
            {cat === 'MENUS' && combos.map((cb: any) => (
              <button key={cb.id} onClick={() => addCombo(cb)} className="min-w-[150px] h-24 px-3 bg-[#b5651d] text-white rounded shadow flex flex-col items-center justify-center"><span className="font-bold">{cb.name}</span><span className="text-sm opacity-90">{money(cb.price)}</span></button>
            ))}
            {cat && cat !== 'MENUS' && (categories[cat] || []).map((c: any) => (
              <button key={c.id} onClick={() => addItem(c)} className="min-w-[150px] h-24 px-3 bg-[#2e7d32] hover:bg-[#379139] text-white rounded shadow flex flex-col items-center justify-center"><span className="font-bold text-center leading-tight">{c.item_name}</span><span className="text-sm opacity-90 mt-1">{money(c.effective_price)}</span></button>
            ))}
          </div>
        </div>

        <div className="w-[380px] bg-[#d9d9d9] flex flex-col">
          <div className="grid grid-cols-[50px_1fr_80px] bg-[#c4c4c4] text-gray-800 text-sm font-bold px-2 py-2 border-b border-gray-400"><span>Qtd</span><span>Descrição</span><span className="text-right">Total</span></div>
          <div className="flex-1 overflow-auto bg-[#e9e9e9]">
            {lines.map((l: any) => (
              <div key={l.id} onClick={() => setSelLine(l.id)} className={`grid grid-cols-[50px_1fr_80px] px-2 py-1.5 text-sm cursor-pointer border-b border-gray-300 ${selLine === l.id ? 'bg-[#cce8ff]' : ''}`}>
                <span>{Number(l.quantity).toFixed(0)}</span>
                <span className="truncate">{l.description}{l.note ? <em className="block text-[10px] text-red-700">{l.note}</em> : null}</span>
                <span className="text-right">{money(l.line_total)}</span>
              </div>
            ))}
            {lines.length === 0 && <div className="text-center text-gray-500 py-10 text-sm">Toque num artigo para adicionar.</div>}
          </div>
          <div className="grid grid-cols-4 gap-px bg-gray-400">
            {[1, 2, 3, 4].map((n) => (<button key={n} onClick={() => setQty(n)} className={`h-12 text-lg font-bold ${qty === n ? 'bg-[#c9a400] text-white' : 'bg-[#2b2b2b] text-white'}`}>{n}</button>))}
          </div>
          <div className="bg-[#2b2b2b] text-white text-right text-3xl font-bold px-3 py-2">{money(ticket?.grand_total)}</div>
          <div className="grid grid-cols-4 gap-px bg-gray-400">
            <button onClick={() => selLine && delLine.mutate(selLine, { onSuccess: () => setSelLine(undefined) })} className="h-16 bg-[#a01818] text-white flex items-center justify-center"><Trash2 size={22} /></button>
            <button onClick={() => setModal('preconta')} className="h-16 bg-[#2b2b2b] text-white flex items-center justify-center"><Printer size={22} /></button>
            <button onClick={() => lines.length && setModal('pay')} className="h-16 bg-[#2b2b2b] text-[#c9a400] flex items-center justify-center"><Coins size={24} /></button>
            <button onClick={() => fire.mutate(ticketId!)} className="h-16 bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e] text-white flex items-center justify-center"><Check size={26} strokeWidth={3} /></button>
          </div>
        </div>
      </div>
      <Footer name={outletName} op={opName} />
      {modal === 'pay' && <PayModal />}
      {modal === 'cash' && <CashModal />}
      {modal === 'transfer' && <TransferModal />}
      {modal === 'preconta' && <PrecontaModal />}
      {modal === 'split' && <SplitModal />}
      {modal === 'merge' && <MergeModal />}
    </div>
  );

  // ================= MODAIS =================
  function CashModal() {
    const [mv, setMv] = useState('REFORCO');
    const [amt, setAmt] = useState('');
    const [counted, setCounted] = useState('');
    const doMove = () => {
      if (!amt) return;
      addMovement.mutate({ id: session.id, data: { movement_type: mv, amount: amt } }, { onSuccess: () => setAmt('') });
    };
    const doClose = () => {
      if (!counted) { alert('Indique o valor contado.'); return; }
      closeCash.mutate({ id: session.id, counted, notes: '' } as any,
        { onSuccess: () => { setModal('none'); setStep('cash'); }, onError: (e: any) => alert(e?.response?.data?.detail || 'Erro') });
    };
    return (
      <Overlay onClose={() => setModal('none')}>
        <div className="w-[420px]">
          <Title>Gestão de Caixa</Title>
          <div className="text-gray-300 text-sm mb-3">Abertura: <b>{money(session?.opening_float)}</b> · Esperado: <b className="text-[#7cbf30]">{money(session?.expected_cash)}</b></div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setMv('REFORCO')} className={`flex-1 h-11 rounded font-bold flex items-center justify-center gap-1 ${mv === 'REFORCO' ? 'bg-[#2e7d32] text-white' : 'bg-[#3a3a3a] text-gray-300'}`}><TrendingUp size={16} />Reforço</button>
            <button onClick={() => setMv('SANGRIA')} className={`flex-1 h-11 rounded font-bold flex items-center justify-center gap-1 ${mv === 'SANGRIA' ? 'bg-[#a01818] text-white' : 'bg-[#3a3a3a] text-gray-300'}`}><TrendingDown size={16} />Sangria</button>
          </div>
          <div className="flex gap-2 mb-4">
            <input type="number" placeholder="Valor" value={amt} onChange={(e) => setAmt(e.target.value)} className="flex-1 h-11 bg-[#3a3a3a] text-white px-3 rounded outline-none" />
            <button onClick={doMove} className="px-4 h-11 bg-[#c9a400] text-white rounded font-bold">Registar</button>
          </div>
          <div className="border-t border-[#444] pt-3">
            <div className="text-gray-300 text-sm mb-1">Fecho de caixa — valor contado</div>
            <div className="flex gap-2">
              <input type="number" placeholder="Contado" value={counted} onChange={(e) => setCounted(e.target.value)} className="flex-1 h-11 bg-[#3a3a3a] text-white px-3 rounded outline-none" />
              <button onClick={doClose} className="px-4 h-11 bg-[#a01818] text-white rounded font-bold flex items-center gap-1"><LogOut size={16} />Fechar</button>
            </div>
          </div>
        </div>
      </Overlay>
    );
  }

  function DashboardModal() {
    const { data: s } = usePosSummary(outlet);
    const Card = ({ label, value, color }: { label: string; value: string; color: string }) => (
      <div className="bg-[#1f1f1f] border border-[#333] rounded p-3 min-w-[140px]"><div className="text-[10px] uppercase text-gray-400">{label}</div><div className="text-2xl font-bold" style={{ color }}>{value}</div></div>
    );
    return (
      <Overlay onClose={() => setModal('none')}>
        <div className="w-[620px]">
          <Title>Dashboard Operacional · {s?.date}</Title>
          <div className="flex flex-wrap gap-2 mb-3">
            <Card label="Vendas do dia" value={money(s?.sales_total)} color="#7cbf30" />
            <Card label="Nº vendas" value={String(s?.sales_count ?? 0)} color="#5aa0e6" />
            <Card label="Ticket médio" value={money(s?.avg_ticket)} color="#e0a83a" />
            <Card label="Mesas ocupadas" value={String(s?.occupied_tables ?? 0)} color="#c0621d" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-gray-300 text-sm font-bold mb-1">Por operador</div>
              <div className="bg-[#1f1f1f] rounded max-h-40 overflow-auto">
                {(s?.by_operator || []).map((o: any) => (
                  <div key={o.operator} className="flex justify-between px-3 py-1.5 text-sm text-white border-b border-[#2a2a2a]"><span>{o.operator}</span><span className="text-[#7cbf30]">{money(o.sales)}</span></div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-gray-300 text-sm font-bold mb-1">Mais vendidos</div>
              <div className="bg-[#1f1f1f] rounded max-h-40 overflow-auto">
                {(s?.top_products || []).map((p: any) => (
                  <div key={p.name} className="flex justify-between px-3 py-1.5 text-sm text-white border-b border-[#2a2a2a]"><span className="truncate">{p.name}</span><span className="text-gray-300">{Number(p.qty).toFixed(0)}x</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Overlay>
    );
  }

  function SplitModal() {
    const [sel, setSel] = useState<number[]>([]);
    const toggle = (id: number) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
    const doSplit = async () => {
      if (sel.length === 0) { alert('Selecione as linhas a mover.'); return; }
      try { await posMgmtApi.splitTicket(ticketId!, sel); inval(); setModal('none'); }
      catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao dividir'); }
    };
    return (
      <Overlay onClose={() => setModal('none')}>
        <div className="w-[420px]">
          <Title>Dividir conta — mover linhas para nova conta</Title>
          <div className="max-h-64 overflow-auto mb-3">
            {lines.map((l: any) => (
              <label key={l.id} className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer rounded mb-1 ${sel.includes(l.id) ? 'bg-[#6a1b9a] text-white' : 'bg-[#3a3a3a] text-gray-200'}`}>
                <span><input type="checkbox" checked={sel.includes(l.id)} onChange={() => toggle(l.id)} className="mr-2" />{Number(l.quantity).toFixed(0)}x {l.description}</span>
                <span>{money(l.line_total)}</span>
              </label>
            ))}
          </div>
          <button onClick={doSplit} className="w-full h-12 bg-[#6a1b9a] text-white rounded font-bold flex items-center justify-center gap-2"><Split size={18} />Criar nova conta com {sel.length} linha(s)</button>
        </div>
      </Overlay>
    );
  }

  function MergeModal() {
    const others = openTickets.filter((k: any) => k.id !== ticketId);
    const doMerge = async (src: any) => {
      try { await posMgmtApi.mergeTicket(ticketId!, src.id); inval(); setModal('none'); }
      catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao juntar'); }
    };
    return (
      <Overlay onClose={() => setModal('none')}>
        <div className="w-[420px]">
          <Title>Juntar outra conta a esta mesa</Title>
          <div className="max-h-64 overflow-auto">
            {others.map((k: any) => (
              <button key={k.id} onClick={() => doMerge(k)} className="w-full flex items-center justify-between px-3 py-2 text-sm bg-[#3a3a3a] hover:bg-[#484848] text-white rounded mb-1">
                <span>Mesa {k.table_label || k.ticket_number} · {(k.lines || []).length} item(s)</span>
                <span className="text-[#7cbf30]">{money(k.grand_total)}</span>
              </button>
            ))}
            {others.length === 0 && <div className="text-gray-400 text-sm">Não há outras contas abertas.</div>}
          </div>
        </div>
      </Overlay>
    );
  }

  function RefundsModal() {
    const { data: paid = [] } = useTickets(outlet ? { outlet, status: 'PAID' } : undefined);
    const doRefund = async (t: any) => {
      const reason = window.prompt(`Estornar venda ${t.ticket_number} (${money(t.grand_total)})? Motivo:`, 'Devolução');
      if (reason === null) return;
      try { await posMgmtApi.refundTicket(t.id, reason); inval(); alert('Estorno / nota de crédito emitida.'); }
      catch (e: any) { alert(e?.response?.data?.detail || 'Erro no estorno'); }
    };
    return (
      <Overlay onClose={() => setModal('none')}>
        <div className="w-[460px]">
          <Title>Estornos — vendas pagas</Title>
          <div className="max-h-72 overflow-auto">
            {paid.slice(0, 20).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm bg-[#3a3a3a] rounded mb-1 text-white">
                <span>{t.ticket_number} · Mesa {t.table_label || '—'} · {money(t.grand_total)}</span>
                <button onClick={() => doRefund(t)} className="px-3 py-1 bg-[#a01818] rounded font-bold flex items-center gap-1"><Undo2 size={14} />Estornar</button>
              </div>
            ))}
            {paid.length === 0 && <div className="text-gray-400 text-sm">Sem vendas pagas.</div>}
          </div>
        </div>
      </Overlay>
    );
  }

  function TransferModal() {
    const free = tables.filter((t: any) => !openTickets.some((k: any) => k.table === t.id) && t.id !== ticket?.table);
    return (
      <Overlay onClose={() => setModal('none')}>
        <div className="w-[420px]">
          <Title>Transferir para a mesa</Title>
          <div className="grid grid-cols-4 gap-2">
            {free.map((t: any) => (
              <button key={t.id} onClick={() => doTransfer(t)} className="h-16 bg-[#1a8f8f] hover:bg-[#20a0a0] text-white rounded font-bold text-lg">{t.table_number}</button>
            ))}
            {free.length === 0 && <div className="col-span-4 text-gray-400 text-sm">Sem mesas livres.</div>}
          </div>
        </div>
      </Overlay>
    );
  }

  function PrecontaModal() {
    return (
      <Overlay onClose={() => setModal('none')}>
        <div className="w-[360px]">
          <div id="preconta" className="bg-white text-black p-4 rounded text-[13px] font-mono">
            <div className="text-center font-bold">{outletName}</div>
            <div className="text-center text-[11px] mb-2">PRÉ-CONTA · Mesa {ticket?.table_label || '—'}</div>
            <div className="border-t border-b border-black py-1 mb-1">
              {lines.map((l: any) => (
                <div key={l.id} className="flex justify-between"><span>{Number(l.quantity).toFixed(0)}x {l.description}</span><span>{money(l.line_total)}</span></div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-base"><span>TOTAL</span><span>{money(ticket?.grand_total)}</span></div>
            <div className="text-center text-[10px] mt-2 text-gray-600">Documento não fiscal</div>
          </div>
          <button onClick={() => window.print()} className="mt-3 w-full h-12 bg-[#1e3f66] text-white rounded font-bold flex items-center justify-center gap-2"><Printer size={18} />Imprimir</button>
        </div>
      </Overlay>
    );
  }

  function PayModal() {
    const [method, setMethod] = useState<any>(null);
    const [tendered, setTendered] = useState('');
    const [extra, setExtra] = useState('');
    const [msg, setMsg] = useState('');
    const key = (k: string) => { if (k === 'C') setTendered(''); else if (k === 'DEL') setTendered((p) => p.slice(0, -1)); else setTendered((p) => p + k); };
    const done = () => { inval(); setModal('none'); setStep('tables'); setTicketId(undefined); };
    const finalizeIfPaid = async (bal: number) => {
      if (bal <= 0) { try { await posMgmtApi.issueDocument(ticketId!, 'INVOICE'); } catch { /* série opcional */ } done(); }
      else { inval(); setMsg(`Falta pagar ${bal.toFixed(2)}`); }
    };
    const confirm = async () => {
      if (!method) { setMsg('Escolha o método.'); return; }
      const code = method.method_type_code;
      try {
        if (code === 'GIFTCARD') { const r = await posMgmtApi.redeemGift(ticketId!, extra); await finalizeIfPaid(Number(r.balance_due)); }
        else if (code === 'ROOM') { const r = await posMgmtApi.chargeToRoom(ticketId!, extra); await finalizeIfPaid(Number(r.balance_due)); }
        else {
          const amount = Number(tendered) || balance;
          const r = await posMgmtApi.payTicket(ticketId!, method.payment_method, amount);
          const change = Number(r.change_returned || 0);
          await finalizeIfPaid(Number(r.balance_due));
          if (change > 0) alert(`Troco: ${change.toFixed(2)}`);
        }
      } catch (e: any) { setMsg(e?.response?.data?.detail || 'Erro no pagamento'); }
    };
    return (
      <Overlay onClose={() => setModal('none')}>
        <div className="w-[560px] flex gap-4">
          <div className="flex-1">
            <Title>Pagamento</Title>
            <div className="text-gray-300 mb-2">Em dívida: <b className="text-[#7cbf30] text-lg">{money(balance)}</b></div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {payments.filter((p: any) => p.is_active !== false).map((p: any) => (
                <button key={p.id} onClick={() => { setMethod(p); setMsg(''); }} className={`h-14 rounded font-bold ${method?.id === p.id ? 'bg-[#c9a400] text-white' : 'bg-[#3a3a3a] text-white hover:bg-[#484848]'}`}>{p.payment_method_name}</button>
              ))}
            </div>
            {method?.method_type_code === 'GIFTCARD' && <input placeholder="Código do Gift Card" value={extra} onChange={(e) => setExtra(e.target.value.toUpperCase())} className="w-full h-11 bg-[#3a3a3a] text-white px-3 rounded mb-2 outline-none" />}
            {method?.method_type_code === 'ROOM' && <input placeholder="Nº do quarto" value={extra} onChange={(e) => setExtra(e.target.value)} className="w-full h-11 bg-[#3a3a3a] text-white px-3 rounded mb-2 outline-none" />}
            {msg && <div className="text-[#f5a623] text-sm mb-2">{msg}</div>}
            <button onClick={confirm} className="w-full h-14 bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e] text-white font-bold rounded flex items-center justify-center gap-2"><Check size={20} />Confirmar Pagamento</button>
          </div>
          {method && !['GIFTCARD', 'ROOM'].includes(method.method_type_code) && (
            <div className="w-40">
              <div className="h-11 bg-[#3a3a3a] text-white text-right text-2xl px-2 rounded mb-1 flex items-center justify-end">{tendered || money(balance)}</div>
              <div className="grid grid-cols-3 gap-1">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((n) => <button key={n} onClick={() => key(n)} className="h-11 bg-[#444] text-white rounded font-bold">{n}</button>)}
                <button onClick={() => key('C')} className="h-11 bg-red-800 text-white rounded">C</button>
                <button onClick={() => key('0')} className="h-11 bg-[#444] text-white rounded font-bold">0</button>
                <button onClick={() => key('DEL')} className="h-11 bg-yellow-700 text-white rounded flex items-center justify-center"><Delete size={16} /></button>
              </div>
            </div>
          )}
        </div>
      </Overlay>
    );
  }
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#2b2b2b] border border-[#444] rounded-lg p-5 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-3 -right-3 w-8 h-8 bg-[#a01818] text-white rounded-full flex items-center justify-center"><X size={16} /></button>
        {children}
      </div>
    </div>
  );
}
function Title({ children }: { children: ReactNode }) { return <div className="text-white text-lg font-bold mb-3">{children}</div>; }
function SideBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="h-20 bg-[#1b1b1b] hover:bg-[#262626] border-b border-[#000] text-white flex flex-col items-center justify-center gap-1 px-1">
      <Icon size={20} className="text-[#3a7bd0]" /><span className="text-[10px] text-center leading-tight">{label}</span>
    </button>
  );
}
function Footer({ name, op }: { name: string; op: string }) {
  const now = new Date();
  const fmt = now.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="h-10 bg-[#111] flex items-center justify-between px-3 flex-shrink-0 border-t border-[#000]">
      <div className="flex items-center gap-2 text-white font-bold text-sm"><span className="text-[#c9a400]">▲</span> {name || 'POS'} <span className="text-gray-400 font-normal">· {op}</span></div>
      <div className="text-gray-300 text-xs text-right">System Mwana Lodge POS<br />{fmt}</div>
    </div>
  );
}
