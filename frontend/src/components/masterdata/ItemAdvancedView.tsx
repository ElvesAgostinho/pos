import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Boxes, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useMdItems } from '../../hooks/useMasterData';
import {
  useUomList, useVariants, useCreateVariant, useDeleteVariant,
  useItemUoms, useCreateItemUom, useDeleteItemUom, useItemRecipe, useRecalcRecipe,
} from '../../hooks/useItemAdvanced';

const money = (v: any) => (v == null ? '—' : Number(v).toFixed(2));

export default function ItemAdvancedView() {
  const { data: items = [] } = useMdItems();
  const { data: uoms = [] } = useUomList();
  const [itemId, setItemId] = useState<number | undefined>();
  const item = items.find((i: any) => i.id === itemId);

  const { data: variants = [] } = useVariants(itemId);
  const cv = useCreateVariant(); const dv = useDeleteVariant();
  const { data: itemUoms = [] } = useItemUoms(itemId);
  const cu = useCreateItemUom(); const du = useDeleteItemUom();
  const { data: recipes = [] } = useItemRecipe(itemId);
  const recalc = useRecalcRecipe();

  const [vd, setVd] = useState<any>({ code: '', name: '', sale_price: '', qty_factor: '1' });
  const [ud, setUd] = useState<any>({ uom: '', factor: '', role: 'BOTH' });
  const recipe = recipes[0];

  const addVariant = () => {
    if (!itemId || !vd.code || !vd.name) { alert('Escolha artigo, código e nome.'); return; }
    cv.mutate({ item: itemId, code: vd.code, name: vd.name, sale_price: vd.sale_price || null, qty_factor: vd.qty_factor || 1 },
      { onSuccess: () => setVd({ code: '', name: '', sale_price: '', qty_factor: '1' }), onError: (e: any) => alert(JSON.stringify(e?.response?.data)) });
  };
  const addUom = () => {
    if (!itemId || !ud.uom || !ud.factor) { alert('Escolha unidade e fator.'); return; }
    cu.mutate({ item: itemId, uom: Number(ud.uom), factor: ud.factor, role: ud.role },
      { onSuccess: () => setUd({ uom: '', factor: '', role: 'BOTH' }), onError: (e: any) => alert(JSON.stringify(e?.response?.data)) });
  };

  return (
    <ClassicWindow title="Artigo Enterprise — Variantes, Unidades & Custo" icon={<Boxes size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Doses/variantes, unidades com conversão e custo real vindo da ficha técnica.</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Artigo:</label>
          <select value={itemId || ''} onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : undefined)} className="border border-[#a0a0a0] p-1 bg-white min-w-[240px]">
            <option value="">— selecione —</option>{items.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
          </select>
          {item && (() => { const it = item as any; return <span className="ml-3 text-gray-700">Preço base: <b>{money(it.sale_price)}</b> · Custo: <b>{money(it.current_average_cost)}</b> · Margem: <b>{it.margin_percentage != null ? it.margin_percentage + '%' : '—'}</b></span>; })()}
        </div>

        {!itemId ? <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Selecione um artigo para configurar variantes, unidades e custo.</div> : (
          <div className="flex-1 grid grid-cols-2 gap-3 p-3 overflow-auto">
            {/* Variantes / Doses */}
            <div className="border border-[#c0c0c0] flex flex-col min-h-0">
              <div className="bg-[#e8eef5] px-2 py-1 font-bold text-[#1e3f66] text-[11px]">Variantes / Doses (½ dose, garrafa, copo…)</div>
              <div className="flex flex-wrap items-end gap-1 p-2 text-[11px] border-b border-[#e0e0e0]">
                <input placeholder="Código" value={vd.code} onChange={(e) => setVd({ ...vd, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-20" />
                <input placeholder="Nome" value={vd.name} onChange={(e) => setVd({ ...vd, name: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
                <input placeholder="Preço" type="number" value={vd.sale_price} onChange={(e) => setVd({ ...vd, sale_price: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
                <input placeholder="Fator" type="number" value={vd.qty_factor} onChange={(e) => setVd({ ...vd, qty_factor: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" title="Unidades-base consumidas (½=0.5)" />
                <ClassicButton icon={Plus} label="Add" onClick={addVariant} />
              </div>
              <div className="flex-1 overflow-auto">
                <ClassicGrid rowKey="id" data={variants} columns={[
                  { header: 'Nome', accessor: 'name', width: '34%' },
                  { header: 'Preço', accessor: (r: any) => money(r.effective_price), width: '24%' },
                  { header: 'Fator stock', accessor: 'qty_factor', width: '30%' },
                  { header: '', accessor: (r: any) => <button onClick={() => dv.mutate(r.id)} className="text-red-600"><Trash2 size={12} /></button>, width: '12%' },
                ]} />
              </div>
            </div>

            {/* Unidades com conversão */}
            <div className="border border-[#c0c0c0] flex flex-col min-h-0">
              <div className="bg-[#e8eef5] px-2 py-1 font-bold text-[#1e3f66] text-[11px]">Unidades com conversão (comprar em Caixa, vender em Unidade)</div>
              <div className="flex flex-wrap items-end gap-1 p-2 text-[11px] border-b border-[#e0e0e0]">
                <select value={ud.uom} onChange={(e) => setUd({ ...ud, uom: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">— unidade —</option>{uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
                </select>
                <input placeholder="Fator" type="number" value={ud.factor} onChange={(e) => setUd({ ...ud, factor: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" title="Unidades-base por 1 desta (Caixa 24 → 24)" />
                <select value={ud.role} onChange={(e) => setUd({ ...ud, role: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="BOTH">Ambas</option><option value="PURCHASE">Compra</option><option value="SALE">Venda</option>
                </select>
                <ClassicButton icon={Plus} label="Add" onClick={addUom} />
              </div>
              <div className="flex-1 overflow-auto">
                <ClassicGrid rowKey="id" data={itemUoms} columns={[
                  { header: 'Unidade', accessor: 'uom_code', width: '26%' },
                  { header: 'Conversão', accessor: (r: any) => `1 ${r.uom_code} = ${r.factor} ${r.base_uom_code}`, width: '44%' },
                  { header: 'Uso', accessor: 'role_display', width: '18%' },
                  { header: '', accessor: (r: any) => <button onClick={() => du.mutate(r.id)} className="text-red-600"><Trash2 size={12} /></button>, width: '12%' },
                ]} />
              </div>
            </div>

            {/* Ficha técnica → custo */}
            <div className="col-span-2 border border-[#c0c0c0] p-3 text-[12px] bg-white">
              <div className="font-bold text-[#1e3f66] mb-1">Ficha Técnica → Custo real</div>
              {recipe ? (
                <div className="flex items-center gap-4">
                  <span>Receita: <b>{recipe.name}</b> · Rendimento: {recipe.yield_quantity}</span>
                  <span>Custo do lote: <b>{money(recipe.theoretical_cost)}</b></span>
                  <span>Custo/unidade: <b className="text-green-700">{money(recipe.cost_per_yield_unit ?? (recipe.theoretical_cost / recipe.yield_quantity))}</b></span>
                  <ClassicButton icon={RefreshCw} label="Recalcular custo" onClick={() => recalc.mutate(recipe.id)} />
                </div>
              ) : <div className="text-gray-500">Este artigo não tem ficha técnica. Crie uma em Hospitality → Receitas para o custo real ser calculado automaticamente.</div>}
            </div>
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}
