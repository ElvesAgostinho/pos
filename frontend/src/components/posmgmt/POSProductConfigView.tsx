import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { useOutlets, useProductConfigs, useCreateProductConfig, useUpdateProductConfig, useDeleteProductConfig } from '../../hooks/usePosMgmt';
import { useMdItems } from '../../hooks/useMasterData';

const fmt = (v: any) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 2 }));

export default function POSProductConfigView() {
  const { data: outlets = [] } = useOutlets();
  const [outletId, setOutletId] = useState<number | null>(null);
  const { data: configs = [] } = useProductConfigs(outletId ?? undefined);
  const { data: items = [] } = useMdItems();
  const create = useCreateProductConfig();
  const update = useUpdateProductConfig();
  const del = useDeleteProductConfig();

  const [draft, setDraft] = useState<any>({ item: '', pos_price: '', pos_category: '', kds_station: 'KITCHEN' });
  const configuredItemIds = new Set(configs.map((c: any) => c.item));
  const availableItems = items.filter((i: any) => !configuredItemIds.has(i.id));

  const add = () => {
    if (!draft.item || !outletId) return;
    create.mutate(
      { outlet: outletId, item: Number(draft.item), pos_price: draft.pos_price || null, pos_category: draft.pos_category || null, kds_station: draft.kds_station, is_available: true },
      { onSuccess: () => setDraft({ item: '', pos_price: '', pos_category: '', kds_station: 'KITCHEN' }) }
    );
  };

  return (
    <ClassicWindow title="Configuração de Produtos POS" icon={<LayoutGrid size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{outletId ? `${configs.length} produtos configurados` : 'Selecione um outlet'}</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Outlet:</label>
          <select value={outletId ?? ''} onChange={(e) => setOutletId(e.target.value ? Number(e.target.value) : null)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— escolher —</option>
            {outlets.map((o: any) => <option key={o.id} value={o.id}>[{o.code}] {o.name}</option>)}
          </select>
        </div>

        {!outletId ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Escolha um outlet para configurar os produtos disponíveis.</div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-end gap-2 bg-[#f8f8f8] border-b border-[#e0e0e0] px-3 py-2 text-[11px]">
              <select value={draft.item} onChange={(e) => setDraft({ ...draft, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                <option value="">— artigo do Master Data —</option>
                {availableItems.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
              </select>
              <input placeholder="Preço POS (opc.)" type="number" value={draft.pos_price} onChange={(e) => setDraft({ ...draft, pos_price: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
              <input placeholder="Categoria POS" value={draft.pos_category} onChange={(e) => setDraft({ ...draft, pos_category: e.target.value })} className="border border-[#a0a0a0] p-1 w-32" />
              <select value={draft.kds_station} onChange={(e) => setDraft({ ...draft, kds_station: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white" title="Routing de produção">
                <option value="KITCHEN">Cozinha</option><option value="BAR">Bar</option><option value="PASTRY">Pastelaria</option><option value="NONE">Sem produção</option>
              </select>
              <ClassicButton icon={Plus} label="Disponibilizar no POS" onClick={add} />
            </div>
            <div className="flex-1 overflow-hidden">
              <ClassicGrid
                rowKey="id"
                data={configs}
                columns={[
                  { header: 'Cód.', accessor: 'item_code', width: '11%' },
                  { header: 'Artigo (Master Data)', accessor: 'item_name', width: '27%' },
                  { header: 'Preço Base', accessor: (r: any) => fmt(r.item_sale_price), width: '13%' },
                  { header: 'Preço POS', accessor: (r: any) => <b className="text-[#1e3f66]">{fmt(r.effective_price)}</b>, width: '13%' },
                  { header: 'Estação', accessor: (r: any) => ({ KITCHEN: 'Cozinha', BAR: 'Bar', PASTRY: 'Pastelaria', NONE: '—' } as any)[r.kds_station] || r.kds_station, width: '12%' },
                  { header: 'Cat.', accessor: (r: any) => r.pos_category || '—', width: '9%' },
                  { header: 'Disp.', accessor: (r: any) => (
                      <input type="checkbox" checked={r.is_available} onChange={() => update.mutate({ id: r.id, data: { is_available: !r.is_available } })} className="w-3 h-3" />
                    ), width: '10%' },
                  { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}
