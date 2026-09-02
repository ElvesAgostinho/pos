import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';

const BOARDS = [['RO', 'Só dormida'], ['BB', 'Bed & Breakfast'], ['HB', 'Meia Pensão'], ['FB', 'Pensão Completa'], ['AI', 'All Inclusive']];
const blank = { code: '', name: '', room_type: '', price_per_night: 0, board: 'RO', min_nights: 1 };

export default function PmsRatePlansView() {
  const qc = useQueryClient();
  const { data: roomTypes } = useQuery({ queryKey: ['pms', 'room-types'], queryFn: async () => (await apiClient.get('pms/room-types/')).data });
  const rtList = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];

  const { data, refetch } = useQuery({ queryKey: ['pms', 'rate-plans'], queryFn: async () => (await apiClient.get('pms/rate-plans/')).data });
  const rows = Array.isArray(data) ? data : data?.results || [];
  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);

  const select = (r: any) => { setSelId(r.id); setForm(r); };
  const novo = () => { setSelId(null); setForm(blank); };

  const save = async () => {
    if (!form.room_type) { aviso('Escolha a categoria de quarto.'); return; }
    try {
      if (selId) await apiClient.patch(`pms/rate-plans/${selId}/`, form);
      else await apiClient.post('pms/rate-plans/', form);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); novo();
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[#a0a0a0]">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={select} columns={[
            { header: 'Código', accessor: 'code', width: '18%' },
            { header: 'Nome', accessor: 'name', width: '30%' },
            { header: 'Categoria', accessor: 'room_type_name', width: '22%' },
            { header: 'Regime', accessor: 'board', width: '12%' },
            { header: 'Preço/noite', accessor: 'price_per_night', width: '18%' },
          ]} />
        </div>
        <div className="w-1/2 p-3 space-y-2 text-[11px]">
          <label className="flex flex-col">Código<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1" /></label>
          <label className="flex flex-col">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
          <label className="flex flex-col">Categoria de Quarto
            <select value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              <option value="">Escolha…</option>{rtList.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col">Regime
            <select value={form.board} onChange={(e) => setForm({ ...form, board: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              {BOARDS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Preço/noite<input type="number" value={form.price_per_night} onChange={(e) => setForm({ ...form, price_per_night: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
            <label className="flex-1 flex flex-col">Mín. noites<input type="number" value={form.min_nights} onChange={(e) => setForm({ ...form, min_nights: Number(e.target.value) })} className="border border-[#a0a0a0] p-1" /></label>
          </div>
        </div>
      </div>
      <div className="flex gap-2 p-2 border-t border-[#c0c0c0] bg-[#f4f4f4]">
        <ClassicButton icon={Plus} label="Nova" onClick={novo} />
        <ClassicButton icon={Save} label="Gravar" onClick={save} />
      </div>
    </div>
  );
}
