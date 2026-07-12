import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useWhLocations, useWhWarehouses } from '../../../hooks/useWh';

const LOC_TYPES: Record<string, string> = {
  BIN: 'Bin/Prateleira', AISLE: 'Corredor', ZONE: 'Zona', COLD: 'Câmara Fria', FREEZER: 'Congelação', DOCK: 'Cais', OTHER: 'Outro',
};

export default function WhLocationsView() {
  const warehouses = useWhWarehouses().data ?? [];
  const [wh, setWh] = useState<string>('');
  const { query, create, remove } = useWhLocations(wh ? { warehouse: wh } : undefined);
  const rows = query.data ?? [];
  const [f, setF] = useState<any>({ code: '', name: '', location_type: 'BIN' });

  const add = () => {
    const warehouse = wh || warehouses[0]?.id;
    if (!f.code || !warehouse) return;
    create.mutate({ ...f, warehouse: Number(warehouse) }, { onSuccess: () => setF({ code: '', name: '', location_type: 'BIN' }) });
  };

  return (
    <ClassicWindow title="Localizações de Armazém" icon={<MapPin size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Localizações: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <select value={wh} onChange={(e) => setWh(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">Todos os armazéns</option>
            {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <span className="text-gray-400">|</span>
          <input placeholder="Código (A-01-03)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <input placeholder="Descrição" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={f.location_type} onChange={(e) => setF({ ...f, location_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(LOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Código', accessor: 'code', width: '18%' },
            { header: 'Descrição', accessor: 'name', width: '34%' },
            { header: 'Tipo', accessor: (r: any) => LOC_TYPES[r.location_type] || r.location_type, width: '20%' },
            { header: 'Armazém', accessor: 'warehouse_name', width: '22%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
