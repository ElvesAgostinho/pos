import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar } from '../../ui/dialogo';

/** Perdidos e Achados — objetos encontrados nas instalações, à espera de serem
    reclamados. Modelo novo e pequeno (pms.LostFoundItem), sem nada existente
    a reaproveitar. */

const STATUS = [
  { value: 'FOUND', label: 'Encontrado' },
  { value: 'CLAIMED', label: 'Reclamado' },
  { value: 'DISPOSED', label: 'Descartado' },
];
const today = () => new Date().toISOString().slice(0, 10);
const blank = { description: '', found_location: '', found_date: today(), status: 'FOUND', claimed_by: '', notes: '' };

export default function PmsLostFoundView() {
  const qc = useQueryClient();
  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);

  const { data, refetch } = useQuery({
    queryKey: ['pms', 'lost-found-items'],
    queryFn: async () => (await apiClient.get('pms/lost-found-items/')).data,
  });
  const rows: any[] = Array.isArray(data) ? data : data?.results || [];

  const select = (r: any) => { setSelId(r.id); setForm(r); };
  const novo = () => { setSelId(null); setForm(blank); };

  const save = async () => {
    if (!form.description?.trim()) { aviso('A descrição é obrigatória.'); return; }
    if (!form.found_date) { aviso('A data em que foi encontrado é obrigatória.'); return; }
    try {
      const payload = { ...form };
      if (selId) await apiClient.patch(`pms/lost-found-items/${selId}/`, payload);
      else await apiClient.post('pms/lost-found-items/', payload);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); novo();
    } catch (e) { notifyError(e); }
  };

  const remove = async () => {
    if (!selId) return;
    if (!(await confirmar(`Eliminar "${form.description}"?`))) return;
    try { await apiClient.delete(`pms/lost-found-items/${selId}/`); refetch(); novo(); } catch (e) { notifyError(e); }
  };

  const inp = 'border border-[#7FA9B1] p-1';
  const statusLabel = (v: string) => STATUS.find((s) => s.value === v)?.label || v;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[#7FA9B1]">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={select} columns={[
            { header: 'Descrição', accessor: 'description', width: '35%' },
            { header: 'Local', accessor: (r: any) => r.found_location || '—', width: '20%' },
            { header: 'Data', accessor: 'found_date', width: '15%' },
            { header: 'Estado', accessor: (r: any) => statusLabel(r.status), width: '15%' },
            { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '15%' },
          ]} />
        </div>
        <div className="w-1/2 p-3 space-y-2 text-[11px] overflow-auto">
          <div className="font-bold text-[#062A31]">{selId ? 'Editar Objeto' : 'Novo Objeto Encontrado'}</div>
          <label className="flex flex-col">Descrição<input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inp} /></label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Local onde foi encontrado<input value={form.found_location || ''} onChange={(e) => setForm({ ...form, found_location: e.target.value })} className={inp} /></label>
            <label className="flex-1 flex flex-col">Data<input type="date" value={form.found_date || ''} onChange={(e) => setForm({ ...form, found_date: e.target.value })} className={inp} /></label>
          </div>
          <label className="flex flex-col">Estado
            <select value={form.status || 'FOUND'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
              {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col">Reclamado por<input value={form.claimed_by || ''} onChange={(e) => setForm({ ...form, claimed_by: e.target.value })} className={inp} disabled={form.status !== 'CLAIMED'} /></label>
          <label className="flex flex-col">Notas<textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp} rows={3} /></label>
        </div>
      </div>
      <Toolbar actions={[
        { label: 'Novo', icon: '＋', color: '#062A31', onClick: novo },
        { label: 'Gravar', icon: '💾', color: '#062A31', onClick: save },
        { label: 'Eliminar', icon: '✕', onClick: remove, disabled: !selId, color: '#B0392B' },
      ]} />
    </div>
  );
}
