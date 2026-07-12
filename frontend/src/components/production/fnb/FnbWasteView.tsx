import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { Trash2, Plus } from 'lucide-react';
import { useWaste, useFnbAreas } from '../../../hooks/useFnb';

const REASONS: Record<string, string> = {
  SPOILAGE: 'Deterioração', OVERPRODUCTION: 'Sobreprodução', PREPARATION: 'Preparação / Aparas',
  EXPIRED: 'Validade expirada', RETURN: 'Devolução', BREAKAGE: 'Quebra', OTHER: 'Outro',
};
const AOA = (n: any) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kz';
const empty = { description: '', quantity: '', reason: 'SPOILAGE', estimated_cost: '', area: '', recorded_by: '' };

export default function FnbWasteView() {
  const { query, create, remove } = useWaste();
  const rows = query.data ?? [];
  const areas = useFnbAreas().data ?? [];
  const [f, setF] = useState<any>(empty);

  const add = () => {
    if (!f.description) return;
    create.mutate({ ...f, area: f.area || null, quantity: Number(f.quantity) || 0, estimated_cost: Number(f.estimated_cost) || 0 }, { onSuccess: () => setF({ ...empty }) });
  };

  const total = rows.reduce((s: number, r: any) => s + Number(r.estimated_cost || 0), 0);

  return (
    <ClassicWindow
      title="Desperdícios & Quebras"
      icon={<Trash2 size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Registos: {rows.length} · Custo total: <span className="text-amber-700 font-bold">{AOA(total)}</span></div>}
    >
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input type="number" placeholder="Qtd" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— Área —</option>
            {areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="number" placeholder="Custo est." value={f.estimated_cost} onChange={(e) => setF({ ...f, estimated_cost: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <input placeholder="Responsável" value={f.recorded_by} onChange={(e) => setF({ ...f, recorded_by: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <ClassicButton icon={Plus} label="Registar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id" data={rows}
            columns={[
              { header: 'Data', accessor: (r: any) => new Date(r.recorded_at).toLocaleDateString('pt-PT'), width: '13%' },
              { header: 'Descrição', accessor: 'description', width: '28%' },
              { header: 'Qtd', accessor: 'quantity', width: '10%' },
              { header: 'Motivo', accessor: (r: any) => r.reason_display, width: '18%' },
              { header: 'Área', accessor: 'area_name', width: '15%' },
              { header: 'Custo', accessor: (r: any) => AOA(r.estimated_cost), width: '11%' },
              { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
