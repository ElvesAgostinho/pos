import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Network, Plus, Trash2 } from 'lucide-react';
import {
  useAreas, useCreateArea, useDeleteArea, useEquipment, useCreateEquipment, useDeleteEquipment,
} from '../../hooks/useProduction';

const AREA_TYPES: Record<string, string> = {
  KITCHEN_HOT: 'Cozinha Quente', KITCHEN_COLD: 'Cozinha Fria', PASTRY: 'Pastelaria',
  BAKERY: 'Padaria', BAR: 'Bar', BUTCHERY: 'Talho', GARDE_MANGER: 'Garde Manger', OTHER: 'Outra',
};
const EQUIP_TYPES: Record<string, string> = {
  OVEN: 'Forno', COMBI: 'Forno Combinado', FRYER: 'Fritadeira', GRILL: 'Grelhador',
  STOVE: 'Fogão', MIXER: 'Misturadora', BLAST_CHILLER: 'Abatedor', FRIDGE: 'Câmara/Frigorífico', OTHER: 'Outro',
};

export default function ProductionAreasView() {
  const { data: areas = [] } = useAreas();
  const createArea = useCreateArea();
  const delArea = useDeleteArea();
  const [selected, setSelected] = useState<number | null>(null);
  const { data: equipment = [] } = useEquipment(selected ?? undefined);
  const createEq = useCreateEquipment();
  const delEq = useDeleteEquipment();

  const [area, setArea] = useState<any>({ name: '', area_type: 'KITCHEN_HOT' });
  const [eq, setEq] = useState<any>({ name: '', equipment_type: 'OVEN', capacity: '' });

  const addArea = () => {
    if (!area.name) return;
    createArea.mutate(area, { onSuccess: () => setArea({ name: '', area_type: 'KITCHEN_HOT' }) });
  };
  const addEq = () => {
    if (!eq.name || !selected) return;
    createEq.mutate({ ...eq, area: selected }, { onSuccess: () => setEq({ name: '', equipment_type: 'OVEN', capacity: '' }) });
  };

  return (
    <ClassicWindow
      title="Áreas de Produção & Equipamentos"
      icon={<Network size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Áreas: {areas.length}</div>}
    >
      <div className="flex h-full">
        {/* Áreas */}
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <input placeholder="Nome da área" value={area.name} onChange={(e) => setArea({ ...area, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
            <select value={area.area_type} onChange={(e) => setArea({ ...area, area_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              {Object.entries(AREA_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ClassicButton icon={Plus} label="Adicionar Área" onClick={addArea} />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid
              rowKey="id"
              data={areas}
              selectedRowId={selected ?? undefined}
              onRowClick={(r: any) => setSelected(r.id)}
              columns={[
                { header: 'Área', accessor: 'name', width: '45%' },
                { header: 'Tipo', accessor: (r: any) => AREA_TYPES[r.area_type] || r.area_type, width: '40%' },
                { header: '', accessor: (r: any) => <button onClick={(e) => { e.stopPropagation(); if (confirm(`Apagar a área ${r.name}?`)) delArea.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '15%' },
              ]}
            />
          </div>
        </div>

        {/* Equipamentos da área selecionada */}
        <div className="w-1/2 flex flex-col">
          {selected ? (
            <>
              <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
                <input placeholder="Equipamento" value={eq.name} onChange={(e) => setEq({ ...eq, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
                <select value={eq.equipment_type} onChange={(e) => setEq({ ...eq, equipment_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  {Object.entries(EQUIP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input placeholder="Capacidade" value={eq.capacity} onChange={(e) => setEq({ ...eq, capacity: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
                <ClassicButton icon={Plus} label="Adicionar" onClick={addEq} />
              </div>
              <div className="flex-1 overflow-hidden">
                <ClassicGrid
                  rowKey="id"
                  data={equipment}
                  columns={[
                    { header: 'Equipamento', accessor: 'name', width: '40%' },
                    { header: 'Tipo', accessor: (r: any) => EQUIP_TYPES[r.equipment_type] || r.equipment_type, width: '30%' },
                    { header: 'Capac.', accessor: 'capacity', width: '20%' },
                    { header: '', accessor: (r: any) => <button onClick={() => delEq.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
                  ]}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">
              Selecione uma área para gerir os equipamentos.
            </div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
