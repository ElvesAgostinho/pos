import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

const blank = { code: '', name: '', capacity_adults: 2, capacity_children: 0, base_rate: 0 };

export default function PmsRoomTypesView() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ['pms', 'room-types'],
    queryFn: async () => (await apiClient.get('pms/room-types/')).data,
  });
  const rows = Array.isArray(data) ? data : data?.results || [];
  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);

  const select = (r: any) => { setSelId(r.id); setForm(r); };
  const novo = () => { setSelId(null); setForm(blank); };

  const save = async () => {
    try {
      if (selId) await apiClient.patch(`pms/room-types/${selId}/`, form);
      else await apiClient.post('pms/room-types/', form);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); novo();
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[#a0a0a0]">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={select} columns={[
            { header: 'Código', accessor: 'code', width: '20%' },
            { header: 'Nome', accessor: 'name', width: '40%' },
            { header: 'Capacidade', accessor: (r: any) => `${r.capacity_adults}A + ${r.capacity_children}C`, width: '20%' },
            { header: 'Preço base', accessor: 'base_rate', width: '20%' },
          ]} />
        </div>
        <div className="w-1/2 p-3 space-y-2 text-[11px]">
          <label className="flex flex-col">Código<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1" /></label>
          <label className="flex flex-col">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Capac. adultos<input type="number" value={form.capacity_adults} onChange={(e) => setForm({ ...form, capacity_adults: Number(e.target.value) })} className="border border-[#a0a0a0] p-1" /></label>
            <label className="flex-1 flex flex-col">Capac. crianças<input type="number" value={form.capacity_children} onChange={(e) => setForm({ ...form, capacity_children: Number(e.target.value) })} className="border border-[#a0a0a0] p-1" /></label>
          </div>
          <label className="flex flex-col">Preço base/noite<input type="number" value={form.base_rate} onChange={(e) => setForm({ ...form, base_rate: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
        </div>
      </div>
      <div className="flex gap-2 p-2 border-t border-[#c0c0c0] bg-[#f4f4f4]">
        <ClassicButton icon={Plus} label="Nova" onClick={novo} />
        <ClassicButton icon={Save} label="Gravar" onClick={save} />
      </div>
    </div>
  );
}
