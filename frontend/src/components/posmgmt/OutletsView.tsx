import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import GridToggle from '../ui/GridToggle';
import { Store, Plus, Trash2 } from 'lucide-react';
import { useOutlets, useCreateOutlet, useDeleteOutlet } from '../../hooks/usePosMgmt';
import { OUTLET_TYPES, posMgmtApi } from '../../api/posmgmt';
import { usePriceLists } from '../../hooks/usePriceLists';
import { useWarehouses } from '../../hooks/useWarehouse';

const typeLabel = (v: string) => OUTLET_TYPES.find((t) => t.value === v)?.label || v;

export default function OutletsView() {
  const { data: outlets = [] } = useOutlets();
  const { data: priceLists = [] } = usePriceLists();
  const { data: warehouses = [] } = useWarehouses();
  const qc = useQueryClient();
  const create = useCreateOutlet();
  const del = useDeleteOutlet();
  const [draft, setDraft] = useState<any>({ code: '', name: '', outlet_type: 'RESTAURANT' });
  const patch = async (id: number, data: any) => {
    await posMgmtApi.updateOutlet(id, data);
    qc.invalidateQueries({ queryKey: ['posmgmt'] });
  };
  const setPriceList = (id: number, price_list: string) => patch(id, { price_list: price_list ? Number(price_list) : null });
  const setWarehouse = (id: number, warehouse: string) => patch(id, { warehouse: warehouse ? Number(warehouse) : null });

  const add = () => { if (draft.code && draft.name) create.mutate(draft, { onSuccess: () => setDraft({ code: '', name: '', outlet_type: 'RESTAURANT' }) }); };

  return (
    <ClassicWindow title="Outlets (Pontos de Venda)" icon={<Store size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Nº registos: {outlets.length}</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Código" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-28" />
          <input placeholder="Nome do outlet" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={draft.outlet_type} onChange={(e) => setDraft({ ...draft, outlet_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {OUTLET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Adicionar Outlet" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={outlets}
            columns={[
              { header: 'Código', accessor: 'code', width: '18%' },
              { header: 'Nome', accessor: 'name', width: '40%' },
              { header: 'Tipo', accessor: (r: any) => typeLabel(r.outlet_type), width: '17%' },
              { header: 'Tabela de Preço', accessor: (r: any) => (
                <select value={r.price_list || ''} onChange={(e) => setPriceList(r.id, e.target.value)} className="border border-[#a0a0a0] p-0.5 bg-white text-[11px]">
                  <option value="">— base —</option>{priceLists.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>), width: '18%' },
              { header: 'Armazém (stock)', accessor: (r: any) => (
                <select value={r.warehouse || ''} onChange={(e) => setWarehouse(r.id, e.target.value)} className="border border-[#a0a0a0] p-0.5 bg-white text-[11px]">
                  <option value="">— nenhum —</option>{warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>), width: '18%' },
              { header: 'Ativo', width: '6%',
                accessor: (r: any) => <GridToggle endpoint="pos/outlets" id={r.id} field="is_active"
                  value={!!r.is_active} invalidate="posmgmt" title="Desligar fecha este ponto de venda" /> },
              { header: '', accessor: (r: any) => <button onClick={() => { if (confirm(`Apagar o outlet ${r.name}?`)) del.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
