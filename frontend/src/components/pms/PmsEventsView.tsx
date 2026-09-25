import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar } from '../../ui/dialogo';

/** EMS (Eventos) — CRUD do modelo `pms.Event`. Serve dois itens do menu EMS
    ("EMS (Eventos)" e "Pesquisar EMS"): o `ClassicGrid` já tem filtro
    próprio, por isso não há um ecrã de pesquisa à parte — é este, com uma
    caixa de pesquisa visível. */

const STATUS = [
  { value: 'INQUIRY', label: 'Pedido' },
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'COMPLETED', label: 'Concluído' },
];
const STATUS_COLOR: Record<string, string> = { INQUIRY: '#5C8891', CONFIRMED: '#062A31', CANCELLED: '#B0392B', COMPLETED: '#7FA9B1' };

const blank = {
  name: '', event_date: '', start_time: '', end_time: '', venue: '', client: '',
  expected_guests: 0, status: 'INQUIRY', estimated_revenue: 0, notes: '',
};

export default function PmsEventsView() {
  const qc = useQueryClient();
  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [q, setQ] = useState('');

  const { data, refetch } = useQuery({
    queryKey: ['pms', 'events'],
    queryFn: async () => (await apiClient.get('pms/events/')).data,
  });
  const all: any[] = data?.results || data || [];
  const rows = q.trim()
    ? all.filter((e) => [e.name, e.venue, e.client_name].filter(Boolean).some((s) => String(s).toLowerCase().includes(q.trim().toLowerCase())))
    : all;

  const { data: custData } = useQuery({
    queryKey: ['mdm', 'customers', 'ems'],
    queryFn: async () => (await apiClient.get('mdm/customers/')).data,
  });
  const customers: any[] = custData?.results || custData || [];

  const select = (r: any) => { setSelId(r.id); setForm({ ...r, client: r.client || '' }); };
  const novo = () => { setSelId(null); setForm(blank); };

  const save = async () => {
    if (!form.name?.trim()) { aviso('O nome do evento é obrigatório.'); return; }
    if (!form.event_date) { aviso('A data do evento é obrigatória.'); return; }
    try {
      const payload = { ...form, client: form.client || null };
      if (selId) await apiClient.patch(`pms/events/${selId}/`, payload);
      else await apiClient.post('pms/events/', payload);
      refetch(); qc.invalidateQueries({ queryKey: ['pms', 'events'] }); novo();
    } catch (e) { notifyError(e); }
  };

  const remove = async () => {
    if (!selId) return;
    if (!(await confirmar(`Eliminar o evento "${form.name}"?`))) return;
    try { await apiClient.delete(`pms/events/${selId}/`); refetch(); novo(); } catch (e) { notifyError(e); }
  };

  const inp = 'border border-[#7FA9B1] p-1';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#F7FAFA] border-b border-[#7FA9B1] text-[12px]">
        <span className="font-semibold text-[#5C8891]">Pesquisar:</span>
        <input className={`${inp} flex-1 max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, local, cliente…" />
        <span className="text-gray-500">{rows.length} evento(s)</span>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[#7FA9B1]">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={select} columns={[
            { header: 'Data', accessor: 'event_date', width: '15%' },
            { header: 'Nome', accessor: 'name', width: '30%' },
            { header: 'Local', accessor: (r: any) => r.venue || '—', width: '20%' },
            { header: 'Estado', accessor: (r: any) => (
              <span className="text-white px-1.5 py-0.5 text-[10px] font-bold" style={{ background: STATUS_COLOR[r.status] }}>{r.status_display}</span>
            ), width: '20%' },
            { header: 'Receita Est.', accessor: (r: any) => Number(r.estimated_revenue || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 }), width: '15%' },
          ]} />
        </div>
        <div className="w-1/2 p-3 space-y-2 text-[11px] overflow-auto">
          <label className="flex flex-col">Nome do evento<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Data<input type="date" value={form.event_date || ''} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className={inp} /></label>
            <label className="flex-1 flex flex-col">Início<input type="time" value={form.start_time || ''} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={inp} /></label>
            <label className="flex-1 flex flex-col">Fim<input type="time" value={form.end_time || ''} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={inp} /></label>
          </div>
          <label className="flex flex-col">Local (venue)<input value={form.venue || ''} onChange={(e) => setForm({ ...form, venue: e.target.value })} className={inp} placeholder="Ex.: Salão Principal, Jardim…" /></label>
          <label className="flex flex-col">Cliente
            <select value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} className={inp}>
              <option value="">— sem cliente associado —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Convidados esperados<input type="number" min={0} value={form.expected_guests ?? 0} onChange={(e) => setForm({ ...form, expected_guests: e.target.value })} className={inp} /></label>
            <label className="flex-1 flex flex-col">Estado
              <select value={form.status || 'INQUIRY'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
                {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col">Receita estimada<input type="number" step="0.01" min={0} value={form.estimated_revenue ?? 0} onChange={(e) => setForm({ ...form, estimated_revenue: e.target.value })} className={inp} /></label>
          <label className="flex flex-col">Notas<textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp} rows={3} /></label>
        </div>
      </div>
      <Toolbar actions={[
        { label: 'Novo Evento', icon: '＋', color: '#062A31', onClick: novo },
        { label: 'Gravar', icon: '💾', color: '#062A31', onClick: save },
        { label: 'Eliminar', icon: '✕', onClick: remove, disabled: !selId, color: '#B0392B' },
      ]} />
    </div>
  );
}
