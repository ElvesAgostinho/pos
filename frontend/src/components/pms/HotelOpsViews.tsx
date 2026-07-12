import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { Sparkles, Wrench, Tag, Plus, Play, Check, ClipboardList, BedDouble } from 'lucide-react';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const btn = 'px-3 py-1.5 text-[12px] border border-[#c0c0c0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] active:translate-y-px flex items-center gap-1.5';
const ROOM_COLOR: Record<string, string> = { VACANT_CLEAN: '#1f9d55', VACANT_DIRTY: '#c9820a', OCCUPIED: '#c0392b', OOO: '#6b7280' };
const ROOM_LABEL: Record<string, string> = { VACANT_CLEAN: 'Limpo', VACANT_DIRTY: 'Por limpar', OCCUPIED: 'Ocupado', OOO: 'Fora de serviço' };
const HK_COLOR: Record<string, string> = { PENDING: '#c9820a', IN_PROGRESS: '#1565c0', DONE: '#1f9d55', INSPECTED: '#16a085' };
const PRIO_COLOR: Record<string, string> = { LOW: '#789', NORMAL: '#4a6', HIGH: '#c0621d', URGENT: '#e0344a' };

// ======================= GOVERNANTA / HOUSEKEEPING =======================
export function HousekeepingView() {
  const qc = useQueryClient();
  const inval = () => { qc.invalidateQueries({ queryKey: ['hk-tasks'] }); qc.invalidateQueries({ queryKey: ['hk-rooms'] }); };
  const { data: rooms = [] } = useQuery({ queryKey: ['hk-rooms'], queryFn: async () => (await apiClient.get('pms/rooms/')).data, refetchInterval: 20000 });
  const { data: tasks = [] } = useQuery({ queryKey: ['hk-tasks'], queryFn: async () => (await apiClient.get('pms/housekeeping/')).data, refetchInterval: 20000 });
  const [who, setWho] = useState('');
  const create = useMutation({ mutationFn: async (room: number) => (await apiClient.post('pms/housekeeping/', { room, task_type: 'CLEANING', assigned_to: who || null, status: 'PENDING' })).data, onSuccess: inval });
  const act = useMutation({ mutationFn: async ({ id, a }: any) => (await apiClient.post(`pms/housekeeping/${id}/${a}/`, a === 'assign' ? { assigned_to: who } : {})).data, onSuccess: inval });
  const active = tasks.filter((t: any) => t.status !== 'DONE' && t.status !== 'INSPECTED');
  const counts = rooms.reduce((a: any, r: any) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});

  return (
    <ClassicWindow title="Governanta / Housekeeping" icon={<Sparkles size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{active.length} tarefa(s) ativa(s) · concluir uma limpeza marca o quarto como Livre/Limpo</div>}>
      <div className="p-4 space-y-3 bg-[#ececec] h-full overflow-auto">
        <div className="flex flex-wrap gap-2">
          {Object.entries(ROOM_LABEL).map(([k, l]) => (
            <div key={k} className="bg-white border border-[#c0c0c0] px-3 py-1.5"><span className="text-[10px] uppercase text-gray-500">{l}</span><div className="text-xl font-bold" style={{ color: ROOM_COLOR[k] }}>{counts[k] || 0}</div></div>
          ))}
          <div className="flex items-end gap-1 ml-auto"><input placeholder="Camareira" value={who} onChange={e => setWho(e.target.value)} className="border border-[#c0c0c0] px-2 py-1 text-[12px] w-36" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] font-bold text-[#1e3f66] mb-1 uppercase">Quartos</div>
            <div className="grid grid-cols-4 gap-2">
              {rooms.map((r: any) => (
                <div key={r.id} className="rounded p-2 text-white text-center shadow" style={{ background: ROOM_COLOR[r.status] }}>
                  <div className="font-bold flex items-center justify-center gap-1"><BedDouble size={13} />{r.number}</div>
                  <div className="text-[10px] opacity-90">{ROOM_LABEL[r.status]}</div>
                  {r.status === 'VACANT_DIRTY' && <button onClick={() => create.mutate(r.id)} className="mt-1 text-[10px] bg-black/25 hover:bg-black/45 rounded px-1.5 py-0.5">+ limpeza</button>}
                </div>
              ))}
              {rooms.length === 0 && <div className="col-span-4 text-gray-500 text-sm">Sem quartos.</div>}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-[#1e3f66] mb-1 uppercase">Tarefas ativas</div>
            <div className="bg-white border border-[#c0c0c0] text-[12px]">
              {active.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 border-b border-[#eee]">
                  <span className="w-1.5 h-9 rounded" style={{ background: HK_COLOR[t.status] }} />
                  <div className="flex-1"><b>Quarto {t.room_number}</b> · {t.task_type_display}<div className="text-[10px] text-gray-500">{t.status_display}{t.assigned_to ? ` · ${t.assigned_to}` : ''}</div></div>
                  {t.status === 'PENDING' && <button className={btn} onClick={() => act.mutate({ id: t.id, a: 'start' })}><Play size={12} />Iniciar</button>}
                  {t.status === 'IN_PROGRESS' && <button className={btn} onClick={() => act.mutate({ id: t.id, a: 'complete' })}><Check size={12} />Concluir</button>}
                </div>
              ))}
              {active.length === 0 && <div className="px-3 py-2 text-gray-500">Sem tarefas ativas.</div>}
            </div>
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================= MANUTENÇÃO =======================
export function MaintenanceView() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ['mnt'] });
  const { data: orders = [] } = useQuery({ queryKey: ['mnt'], queryFn: async () => (await apiClient.get('pms/maintenance/')).data, refetchInterval: 20000 });
  const { data: rooms = [] } = useQuery({ queryKey: ['mnt-rooms'], queryFn: async () => (await apiClient.get('pms/rooms/')).data });
  const [f, setF] = useState<any>({ title: '', room: '', area: '', priority: 'NORMAL', description: '', set_room_ooo: false });
  const create = useMutation({ mutationFn: async () => (await apiClient.post('pms/maintenance/', { ...f, room: f.room || null })).data, onSuccess: () => { inval(); setF({ ...f, title: '', description: '' }); } });
  const resolve = useMutation({ mutationFn: async (id: number) => (await apiClient.post(`pms/maintenance/${id}/resolve/`, {})).data, onSuccess: inval });
  const open = orders.filter((o: any) => ['OPEN', 'IN_PROGRESS'].includes(o.status));
  return (
    <ClassicWindow title="Manutenção — Ordens de Trabalho" icon={<Wrench size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{open.length} ordem(ns) aberta(s) · prioridade alta pode pôr o quarto fora de serviço</div>}>
      <div className="p-4 space-y-3 bg-[#ececec] h-full overflow-auto">
        <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-2 text-[12px]">
          <label className="flex flex-col">Título<input className="border border-[#c0c0c0] px-2 py-1 w-56" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
          <label className="flex flex-col">Quarto
            <select className="border border-[#c0c0c0] px-2 py-1" value={f.room} onChange={e => setF({ ...f, room: e.target.value })}>
              <option value="">— área geral —</option>
              {rooms.map((r: any) => <option key={r.id} value={r.id}>Quarto {r.number}</option>)}
            </select></label>
          <label className="flex flex-col">Área (se s/ quarto)<input className="border border-[#c0c0c0] px-2 py-1 w-32" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} /></label>
          <label className="flex flex-col">Prioridade
            <select className="border border-[#c0c0c0] px-2 py-1" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
              <option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option>
            </select></label>
          <label className="flex items-center gap-1 pb-1"><input type="checkbox" checked={f.set_room_ooo} onChange={e => setF({ ...f, set_room_ooo: e.target.checked })} /> Fora de serviço</label>
          <button className={btn} disabled={!f.title} onClick={() => create.mutate()}><Plus size={13} />Abrir ordem</button>
        </div>
        <div className="bg-white border border-[#c0c0c0] text-[12px]">
          <div className="grid grid-cols-[1fr_100px_100px_100px_110px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Título</span><span>Local</span><span>Prioridade</span><span>Estado</span><span></span></div>
          {orders.map((o: any) => (
            <div key={o.id} className="grid grid-cols-[1fr_100px_100px_100px_110px] px-2 py-1 border-b border-[#eee] items-center">
              <span><b>{o.title}</b>{o.description ? <span className="text-gray-500"> · {o.description}</span> : ''}</span>
              <span>{o.room_number ? `Q${o.room_number}` : (o.area || '—')}</span>
              <span style={{ color: PRIO_COLOR[o.priority] }} className="font-bold">{o.priority_display}</span>
              <span>{o.status_display}</span>
              <span>{['OPEN', 'IN_PROGRESS'].includes(o.status) && <button className="text-[#1f9d55] hover:underline font-bold" onClick={() => resolve.mutate(o.id)}>Resolver</button>}</span>
            </div>
          ))}
          {orders.length === 0 && <div className="px-3 py-2 text-gray-500">Sem ordens de manutenção.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================= TARIFAS =======================
export function RatePlansView() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ['rates'] });
  const { data: rates = [] } = useQuery({ queryKey: ['rates'], queryFn: async () => (await apiClient.get('pms/rate-plans/')).data });
  const { data: types = [] } = useQuery({ queryKey: ['room-types'], queryFn: async () => (await apiClient.get('pms/room-types/')).data });
  const [f, setF] = useState<any>({ name: '', room_type: '', price_per_night: 0, board: 'BB', breakfast_included: true, min_nights: 1, is_active: true });
  const create = useMutation({ mutationFn: async () => (await apiClient.post('pms/rate-plans/', { ...f, room_type: Number(f.room_type), price_per_night: Number(f.price_per_night) })).data, onSuccess: () => { inval(); setF({ ...f, name: '', price_per_night: 0 }); } });
  const BOARD: Record<string, string> = { RO: 'Só alojamento', BB: 'Peq-almoço', HB: 'Meia pensão', FB: 'Pensão completa', AI: 'Tudo incluído' };
  return (
    <ClassicWindow title="Tarifas — Planos de Preço" icon={<Tag size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Planos de preço por tipo de quarto e regime (RO/BB/HB/FB/AI)</div>}>
      <div className="p-4 space-y-3 bg-[#ececec] h-full overflow-auto">
        <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-2 text-[12px]">
          <label className="flex flex-col">Nome<input className="border border-[#c0c0c0] px-2 py-1 w-48" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ex: Época Alta BB" /></label>
          <label className="flex flex-col">Tipo de quarto
            <select className="border border-[#c0c0c0] px-2 py-1" value={f.room_type} onChange={e => setF({ ...f, room_type: e.target.value })}>
              <option value="">—</option>
              {types.map((t: any) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
            </select></label>
          <label className="flex flex-col">Preço/noite<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-28" value={f.price_per_night} onChange={e => setF({ ...f, price_per_night: e.target.value })} /></label>
          <label className="flex flex-col">Regime
            <select className="border border-[#c0c0c0] px-2 py-1" value={f.board} onChange={e => setF({ ...f, board: e.target.value, breakfast_included: e.target.value !== 'RO' })}>
              {Object.entries(BOARD).map(([v, l]) => <option key={v} value={v}>{v} · {l}</option>)}
            </select></label>
          <button className={btn} disabled={!f.name || !f.room_type} onClick={() => create.mutate()}><Plus size={13} />Criar tarifa</button>
        </div>
        <div className="bg-white border border-[#c0c0c0] text-[12px]">
          <div className="grid grid-cols-[1fr_1fr_120px_120px_90px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Plano</span><span>Tipo de quarto</span><span className="text-right">Preço/noite</span><span>Regime</span><span>Estado</span></div>
          {rates.map((r: any) => (
            <div key={r.id} className="grid grid-cols-[1fr_1fr_120px_120px_90px] px-2 py-1 border-b border-[#eee]">
              <span className="font-bold">{r.name}</span><span>{r.room_type_code} · {r.room_type_name}</span>
              <span className="text-right">{money(r.price_per_night)}</span><span>{r.board} · {BOARD[r.board] || ''}</span>
              <span>{r.is_active ? 'Ativo' : 'Inativo'}</span>
            </div>
          ))}
          {rates.length === 0 && <div className="px-3 py-2 text-gray-500 flex items-center gap-2"><ClipboardList size={13} />Sem tarifas. Crie um plano acima.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
