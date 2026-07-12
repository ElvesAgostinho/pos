import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { Shirt, Wine, HeartPulse, Send, Plus } from 'lucide-react';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const btn = 'px-3 py-1.5 text-[12px] border border-[#c0c0c0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] active:translate-y-px flex items-center gap-1.5';

// ======================= LAVANDARIA =======================
export function LaundryView() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ['laundry'] });
  const { data: orders = [] } = useQuery({ queryKey: ['laundry'], queryFn: async () => (await apiClient.get('pms/laundry/')).data, refetchInterval: 20000 });
  const { data: rooms = [] } = useQuery({ queryKey: ['lau-rooms'], queryFn: async () => (await apiClient.get('pms/rooms/')).data });
  const [f, setF] = useState<any>({ room: '', guest_name: '', description: '', pieces: 1, express: false, total: 0 });
  const create = useMutation({ mutationFn: async () => (await apiClient.post('pms/laundry/', { ...f, room: f.room || null, pieces: Number(f.pieces), total: Number(f.total) })).data, onSuccess: () => { inval(); setF({ ...f, description: '', total: 0 }); } });
  const charge = useMutation({ mutationFn: async (id: number) => (await apiClient.post(`pms/laundry/${id}/charge_folio/`, {})).data, onSuccess: inval, onError: (e: any) => alert(e?.response?.data?.detail || 'Erro') });
  const setStatus = useMutation({ mutationFn: async ({ id, status }: any) => (await apiClient.patch(`pms/laundry/${id}/`, { status })).data, onSuccess: inval });
  const LST: Record<string, string> = { RECEIVED: 'Recebida', PROCESSING: 'Em lavagem', READY: 'Pronta', DELIVERED: 'Entregue' };
  return (
    <ClassicWindow title="Lavandaria" icon={<Shirt size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Pedidos por quarto · lançar no folio do hóspede (aparece no check-out)</div>}>
      <div className="p-4 space-y-3 bg-[#ececec] h-full overflow-auto">
        <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-2 text-[12px]">
          <label className="flex flex-col">Quarto<select className="border border-[#c0c0c0] px-2 py-1" value={f.room} onChange={e => setF({ ...f, room: e.target.value })}><option value="">—</option>{rooms.map((r: any) => <option key={r.id} value={r.id}>Quarto {r.number}</option>)}</select></label>
          <label className="flex flex-col">Hóspede<input className="border border-[#c0c0c0] px-2 py-1 w-40" value={f.guest_name} onChange={e => setF({ ...f, guest_name: e.target.value })} /></label>
          <label className="flex flex-col">Descrição<input className="border border-[#c0c0c0] px-2 py-1 w-56" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="3 camisas, 2 calcas" /></label>
          <label className="flex flex-col">Peças<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-16" value={f.pieces} onChange={e => setF({ ...f, pieces: e.target.value })} /></label>
          <label className="flex flex-col">Total<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-24" value={f.total} onChange={e => setF({ ...f, total: e.target.value })} /></label>
          <label className="flex items-center gap-1 pb-1"><input type="checkbox" checked={f.express} onChange={e => setF({ ...f, express: e.target.checked })} /> Express</label>
          <button className={btn} disabled={!f.description} onClick={() => create.mutate()}><Plus size={13} />Registar</button>
        </div>
        <div className="bg-white border border-[#c0c0c0] text-[12px]">
          <div className="grid grid-cols-[80px_1fr_70px_100px_110px_130px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Quarto</span><span>Descrição</span><span className="text-right">Total</span><span>Estado</span><span>Folio</span><span></span></div>
          {orders.map((o: any) => (
            <div key={o.id} className="grid grid-cols-[80px_1fr_70px_100px_110px_130px] px-2 py-1 border-b border-[#eee] items-center">
              <span>Q{o.room_number || '—'}</span><span>{o.description}{o.express ? <b className="text-[#c0621d]"> · express</b> : ''}</span>
              <span className="text-right">{money(o.total)}</span>
              <select className="border border-[#ddd] text-[11px] px-1 py-0.5" value={o.status} onChange={e => setStatus.mutate({ id: o.id, status: e.target.value })}>{Object.entries(LST).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <span>{o.charged ? '✔ lançado' : '—'}</span>
              <span>{!o.charged && <button className="text-[#1f9d55] hover:underline font-bold flex items-center gap-1" onClick={() => charge.mutate(o.id)}><Send size={12} />Lançar folio</button>}</span>
            </div>
          ))}
          {orders.length === 0 && <div className="px-3 py-2 text-gray-500">Sem pedidos de lavandaria.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================= MINIBAR =======================
export function MinibarView() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ['minibar'], queryFn: async () => (await apiClient.get('pms/minibar/')).data });
  const { data: rooms = [] } = useQuery({ queryKey: ['mb-rooms'], queryFn: async () => (await apiClient.get('pms/rooms/')).data });
  const [ni, setNi] = useState<any>({ name: '', price: 0 });
  const [room, setRoom] = useState('');
  const [cart, setCart] = useState<Record<number, number>>({});
  const addItem = useMutation({ mutationFn: async () => (await apiClient.post('pms/minibar/', { ...ni, price: Number(ni.price) })).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ['minibar'] }); setNi({ name: '', price: 0 }); } });
  const post = async () => {
    const list = items.filter((i: any) => cart[i.id]).map((i: any) => ({ name: i.name, price: i.price, qty: cart[i.id] }));
    if (!room || !list.length) return alert('Escolha o quarto e os artigos.');
    try { const r = await apiClient.post('pms/minibar/post_consumption/', { room, items: list }); alert(r.data.detail); setCart({}); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); }
  };
  const total = items.reduce((s: number, i: any) => s + (cart[i.id] ? Number(i.price) * cart[i.id] : 0), 0);
  return (
    <ClassicWindow title="Minibar" icon={<Wine size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Consumos de minibar lançados no folio do quarto</div>}>
      <div className="p-4 grid grid-cols-2 gap-3 bg-[#ececec] h-full overflow-auto">
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-1 uppercase">Lançar consumo</div>
          <div className="bg-white border border-[#c0c0c0] p-2 mb-2 text-[12px]">
            <label className="flex items-center gap-2 mb-2">Quarto: <select className="border border-[#c0c0c0] px-2 py-1 flex-1" value={room} onChange={e => setRoom(e.target.value)}><option value="">—</option>{rooms.map((r: any) => <option key={r.id} value={r.id}>Quarto {r.number} · {r.status_display || ''}</option>)}</select></label>
            {items.map((i: any) => (
              <div key={i.id} className="flex items-center gap-2 py-1 border-b border-[#eee]">
                <span className="flex-1">{i.name} <span className="text-gray-500">{money(i.price)}</span></span>
                <button className="w-7 h-7 bg-[#eee] border border-[#ccc]" onClick={() => setCart(c => ({ ...c, [i.id]: Math.max(0, (c[i.id] || 0) - 1) }))}>−</button>
                <span className="w-6 text-center">{cart[i.id] || 0}</span>
                <button className="w-7 h-7 bg-[#eee] border border-[#ccc]" onClick={() => setCart(c => ({ ...c, [i.id]: (c[i.id] || 0) + 1 }))}>+</button>
              </div>
            ))}
            {items.length === 0 && <div className="text-gray-500 py-2">Sem artigos no catálogo.</div>}
            <div className="flex justify-between items-center pt-2"><b>Total: {money(total)}</b><button className={btn} onClick={post}><Send size={13} />Lançar no folio</button></div>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-1 uppercase">Catálogo</div>
          <div className="bg-white border border-[#c0c0c0] p-2 mb-2 flex items-end gap-2 text-[12px]">
            <label className="flex flex-col flex-1">Artigo<input className="border border-[#c0c0c0] px-2 py-1" value={ni.name} onChange={e => setNi({ ...ni, name: e.target.value })} /></label>
            <label className="flex flex-col">Preço<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-24" value={ni.price} onChange={e => setNi({ ...ni, price: e.target.value })} /></label>
            <button className={btn} disabled={!ni.name} onClick={() => addItem.mutate()}><Plus size={13} /></button>
          </div>
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            {items.map((i: any) => <div key={i.id} className="flex justify-between px-2 py-1 border-b border-[#eee]"><span>{i.name}</span><span>{money(i.price)}</span></div>)}
            {items.length === 0 && <div className="px-3 py-2 text-gray-500">Sem artigos. Adicione ao catálogo.</div>}
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================= SPA =======================
export function SpaView() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ['spa'] });
  const { data: appts = [] } = useQuery({ queryKey: ['spa'], queryFn: async () => (await apiClient.get('pms/spa/')).data, refetchInterval: 20000 });
  const { data: rooms = [] } = useQuery({ queryKey: ['spa-rooms'], queryFn: async () => (await apiClient.get('pms/rooms/')).data });
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState<any>({ room: '', guest_name: '', service: '', therapist: '', scheduled_for: now, price: 0 });
  const create = useMutation({ mutationFn: async () => (await apiClient.post('pms/spa/', { ...f, room: f.room || null, price: Number(f.price) })).data, onSuccess: () => { inval(); setF({ ...f, service: '', price: 0 }); } });
  const charge = useMutation({ mutationFn: async (id: number) => (await apiClient.post(`pms/spa/${id}/charge_folio/`, {})).data, onSuccess: inval, onError: (e: any) => alert(e?.response?.data?.detail || 'Erro') });
  return (
    <ClassicWindow title="Spa" icon={<HeartPulse size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Marcações de spa · lançar no folio do quarto ou cobrar no POS</div>}>
      <div className="p-4 space-y-3 bg-[#ececec] h-full overflow-auto">
        <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-2 text-[12px]">
          <label className="flex flex-col">Serviço<input className="border border-[#c0c0c0] px-2 py-1 w-48" value={f.service} onChange={e => setF({ ...f, service: e.target.value })} placeholder="Massagem 60min" /></label>
          <label className="flex flex-col">Quarto<select className="border border-[#c0c0c0] px-2 py-1" value={f.room} onChange={e => setF({ ...f, room: e.target.value })}><option value="">—</option>{rooms.map((r: any) => <option key={r.id} value={r.id}>Quarto {r.number}</option>)}</select></label>
          <label className="flex flex-col">Hóspede<input className="border border-[#c0c0c0] px-2 py-1 w-36" value={f.guest_name} onChange={e => setF({ ...f, guest_name: e.target.value })} /></label>
          <label className="flex flex-col">Terapeuta<input className="border border-[#c0c0c0] px-2 py-1 w-32" value={f.therapist} onChange={e => setF({ ...f, therapist: e.target.value })} /></label>
          <label className="flex flex-col">Data/hora<input type="datetime-local" className="border border-[#c0c0c0] px-2 py-1" value={f.scheduled_for} onChange={e => setF({ ...f, scheduled_for: e.target.value })} /></label>
          <label className="flex flex-col">Preço<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-24" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
          <button className={btn} disabled={!f.service} onClick={() => create.mutate()}><Plus size={13} />Marcar</button>
        </div>
        <div className="bg-white border border-[#c0c0c0] text-[12px]">
          <div className="grid grid-cols-[1fr_80px_120px_130px_90px_130px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Serviço</span><span>Quarto</span><span>Terapeuta</span><span>Quando</span><span className="text-right">Preço</span><span></span></div>
          {appts.map((a: any) => (
            <div key={a.id} className="grid grid-cols-[1fr_80px_120px_130px_90px_130px] px-2 py-1 border-b border-[#eee] items-center">
              <span><b>{a.service}</b> · {a.status_display}{a.guest_name ? ` · ${a.guest_name}` : ''}</span>
              <span>Q{a.room_number || '—'}</span><span>{a.therapist || '—'}</span>
              <span>{new Date(a.scheduled_for).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="text-right">{money(a.price)}</span>
              <span>{!a.charged ? <button className="text-[#1f9d55] hover:underline font-bold flex items-center gap-1" onClick={() => charge.mutate(a.id)}><Send size={12} />Lançar folio</button> : '✔ lançado'}</span>
            </div>
          ))}
          {appts.length === 0 && <div className="px-3 py-2 text-gray-500">Sem marcações de spa.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
