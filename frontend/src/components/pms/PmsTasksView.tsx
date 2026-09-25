import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar } from '../../ui/dialogo';

/** Tarefas (Governanta/Front Desk) — modelo novo e pequeno (pms.HousekeepingTask).
    Sem cadastro de colaboradores no sistema ainda, `assigned_to` é texto livre
    (o mesmo princípio já usado noutros sítios que ainda não têm um módulo de RH
    ligado ao PMS). */

const PRIORITY = [{ value: 'LOW', label: 'Baixa' }, { value: 'NORMAL', label: 'Normal' }, { value: 'HIGH', label: 'Alta' }];
const STATUS = [{ value: 'PENDING', label: 'Pendente' }, { value: 'IN_PROGRESS', label: 'Em curso' }, { value: 'DONE', label: 'Concluída' }];
const STATUS_COLOR: Record<string, string> = { PENDING: '#B0392B', IN_PROGRESS: '#5C8891', DONE: '#062A31' };
const blank = { title: '', assigned_to: '', priority: 'NORMAL', status: 'PENDING', due_at: '', notes: '' };

export default function PmsTasksView() {
  const qc = useQueryClient();
  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);

  const { data, refetch } = useQuery({
    queryKey: ['pms', 'tasks'],
    queryFn: async () => (await apiClient.get('pms/tasks/')).data,
  });
  const rows: any[] = Array.isArray(data) ? data : data?.results || [];

  const { data: roomsData } = useQuery({
    queryKey: ['pms', 'rooms', 'for-tasks'],
    queryFn: async () => (await apiClient.get('pms/rooms/')).data,
  });
  const roomList: any[] = Array.isArray(roomsData) ? roomsData : roomsData?.results || [];

  const select = (r: any) => { setSelId(r.id); setForm({ ...r, due_at: (r.due_at || '').slice(0, 16) }); };
  const novo = () => { setSelId(null); setForm(blank); };

  const save = async () => {
    if (!form.title?.trim()) { aviso('O título é obrigatório.'); return; }
    try {
      const payload = { ...form, room: form.room || null, due_at: form.due_at || null };
      if (selId) await apiClient.patch(`pms/tasks/${selId}/`, payload);
      else await apiClient.post('pms/tasks/', payload);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); novo();
    } catch (e) { notifyError(e); }
  };

  const remove = async () => {
    if (!selId) return;
    if (!(await confirmar(`Eliminar a tarefa "${form.title}"?`))) return;
    try { await apiClient.delete(`pms/tasks/${selId}/`); refetch(); novo(); } catch (e) { notifyError(e); }
  };

  const markDone = async () => {
    if (!selId) return;
    try {
      const r = await apiClient.post(`pms/tasks/${selId}/mark-done/`);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); setForm(r.data);
    } catch (e) { notifyError(e); }
  };

  const inp = 'border border-[#7FA9B1] p-1';
  const statusLabel = (v: string) => STATUS.find((s) => s.value === v)?.label || v;
  const priorityLabel = (v: string) => PRIORITY.find((p) => p.value === v)?.label || v;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[#7FA9B1]">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={select} columns={[
            { header: 'Título', accessor: 'title', width: '30%' },
            { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '13%' },
            { header: 'Responsável', accessor: (r: any) => r.assigned_to || '—', width: '20%' },
            { header: 'Prioridade', accessor: (r: any) => priorityLabel(r.priority), width: '15%' },
            {
              header: 'Estado', width: '22%',
              accessor: (r: any) => (
                <span className="px-1.5 py-0.5 text-white text-[10px] font-semibold" style={{ background: STATUS_COLOR[r.status] || '#5C8891' }}>
                  {statusLabel(r.status)}
                </span>
              ),
            },
          ]} />
        </div>
        <div className="w-1/2 p-3 space-y-2 text-[11px] overflow-auto">
          <div className="font-bold text-[#062A31]">{selId ? 'Editar Tarefa' : 'Nova Tarefa'}</div>
          <label className="flex flex-col">Título<input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} /></label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Quarto
              <select value={form.room ?? ''} onChange={(e) => setForm({ ...form, room: e.target.value ? Number(e.target.value) : null })} className={inp}>
                <option value="">— sem quarto —</option>
                {roomList.map((r: any) => <option key={r.id} value={r.id}>{r.number}</option>)}
              </select>
            </label>
            <label className="flex-1 flex flex-col">Responsável<input value={form.assigned_to || ''} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={inp} /></label>
          </div>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Prioridade
              <select value={form.priority || 'NORMAL'} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inp}>
                {PRIORITY.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="flex-1 flex flex-col">Estado
              <select value={form.status || 'PENDING'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
                {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col">Prazo<input type="datetime-local" value={form.due_at || ''} onChange={(e) => setForm({ ...form, due_at: e.target.value })} className={inp} /></label>
          <label className="flex flex-col">Notas<textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp} rows={3} /></label>
        </div>
      </div>
      <Toolbar actions={[
        { label: 'Nova', icon: '＋', color: '#062A31', onClick: novo },
        { label: 'Gravar', icon: '💾', color: '#062A31', onClick: save },
        { label: 'Marcar Concluída', icon: '✔', color: '#062A31', onClick: markDone, disabled: !selId || form.status === 'DONE' },
        { label: 'Eliminar', icon: '✕', onClick: remove, disabled: !selId, color: '#B0392B' },
      ]} />
    </div>
  );
}
