import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Tag, Plus, Trash2 } from 'lucide-react';
import { usePromotions, useCreatePromotion, useUpdatePromotion, useDeletePromotion } from '../../hooks/useCommercial';
import { useMdItems, useMdCategories } from '../../hooks/useMasterData';

export default function PromotionsView() {
  const { data: promos = [] } = usePromotions();
  const { data: items = [] } = useMdItems();
  const { data: categories = [] } = useMdCategories();
  const create = useCreatePromotion();
  const update = useUpdatePromotion();
  const del = useDeletePromotion();
  const empty = { name: '', scope: 'ALL', category: '', item: '', discount_type: 'PERCENT', value: '', happy_start: '', happy_end: '' };
  const [d, setD] = useState<any>(empty);

  const add = () => {
    if (!d.name || !d.value) { alert('Preencha nome e valor.'); return; }
    const p: any = { name: d.name, scope: d.scope, discount_type: d.discount_type, value: d.value, is_active: true };
    if (d.scope === 'ITEM') p.item = Number(d.item) || null;
    if (d.scope === 'CATEGORY') p.category = Number(d.category) || null;
    if (d.happy_start) p.happy_start = d.happy_start;
    if (d.happy_end) p.happy_end = d.happy_end;
    create.mutate(p, { onSuccess: () => setD(empty), onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data)) });
  };

  return (
    <ClassicWindow title="Promoções & Happy Hour (Commercial → alimenta o POS)" icon={<Tag size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{promos.length} promoção(ões) · o POS aplica automaticamente a de maior desconto ao adicionar o artigo</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nome" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={d.scope} onChange={(e) => setD({ ...d, scope: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="ALL">Todos os artigos</option><option value="CATEGORY">Categoria</option><option value="ITEM">Artigo</option>
          </select>
          {d.scope === 'CATEGORY' && (
            <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              <option value="">— categoria —</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {d.scope === 'ITEM' && (
            <select value={d.item} onChange={(e) => setD({ ...d, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              <option value="">— artigo —</option>{items.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
            </select>
          )}
          <select value={d.discount_type} onChange={(e) => setD({ ...d, discount_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="PERCENT">%</option><option value="FIXED">Valor fixo</option>
          </select>
          <input placeholder="Valor" type="number" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <label className="text-gray-600">HH<input type="time" value={d.happy_start} onChange={(e) => setD({ ...d, happy_start: e.target.value })} className="border border-[#a0a0a0] p-1 ml-1" /></label>
          <label className="text-gray-600">–<input type="time" value={d.happy_end} onChange={(e) => setD({ ...d, happy_end: e.target.value })} className="border border-[#a0a0a0] p-1 ml-1" /></label>
          <ClassicButton icon={Plus} label="Criar Promoção" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={promos}
            columns={[
              { header: 'Nome', accessor: 'name', width: '22%' },
              { header: 'Âmbito', accessor: (r: any) => r.scope === 'ITEM' ? r.item_name : r.scope === 'CATEGORY' ? r.category_name : 'Todos', width: '18%' },
              { header: 'Desconto', accessor: (r: any) => r.discount_type === 'PERCENT' ? `${r.value}%` : `${r.value}`, width: '12%' },
              { header: 'Happy Hour', accessor: (r: any) => r.happy_start && r.happy_end ? `${r.happy_start.slice(0, 5)}–${r.happy_end.slice(0, 5)}` : '—', width: '15%' },
              { header: 'Agora?', accessor: (r: any) => <span className={r.active_now ? 'text-green-700 font-bold' : 'text-gray-400'}>{r.active_now ? 'ATIVA' : 'inativa'}</span>, width: '11%' },
              { header: 'Ligada', accessor: (r: any) => <input type="checkbox" checked={!!r.is_active} onChange={() => update.mutate({ id: r.id, data: { is_active: !r.is_active } })} />, width: '10%' },
              { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
