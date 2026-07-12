import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { useCombos, useCreateCombo, useDeleteCombo } from '../../hooks/useCommercial';
import { useMdItems } from '../../hooks/useMasterData';

const emptyLine = () => ({ item: '', quantity: '1' });

export default function CombosView() {
  const { data: combos = [] } = useCombos();
  const { data: items = [] } = useMdItems();
  const create = useCreateCombo();
  const del = useDeleteCombo();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [lines, setLines] = useState<any[]>([emptyLine()]);

  const setLine = (i: number, k: string, v: string) => setLines(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const add = () => {
    const valid = lines.filter((l) => l.item);
    if (!name || !price || valid.length === 0) { alert('Preencha nome, preço e pelo menos um artigo.'); return; }
    create.mutate({ name, price: Number(price), is_active: true, items: valid.map((l) => ({ item: Number(l.item), quantity: Number(l.quantity) || 1 })) },
      { onSuccess: () => { setName(''); setPrice(''); setLines([emptyLine()]); }, onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data)) });
  };

  return (
    <ClassicWindow title="Combos / Menus (Commercial → alimenta o POS)" icon={<Layers size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{combos.length} combo(s) · o POS lança os componentes (routing KDS) e desconta para o preço do combo</div>}>
      <div className="flex flex-col h-full">
        <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px] space-y-1">
          <div className="flex flex-wrap items-end gap-2">
            <input placeholder="Nome do combo" value={name} onChange={(e) => setName(e.target.value)} className="border border-[#a0a0a0] p-1" />
            <input placeholder="Preço combo" type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="border border-[#a0a0a0] p-1 w-28" />
            <ClassicButton icon={Plus} label="Criar Combo" onClick={add} />
            <button onClick={() => setLines([...lines, emptyLine()])} className="text-[#1e3f66] underline">+ artigo</button>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-1">
              <select value={l.item} onChange={(e) => setLine(i, 'item', e.target.value)} className="border border-[#a0a0a0] p-1 bg-white flex-1">
                <option value="">— artigo —</option>{items.map((it: any) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select>
              <input placeholder="Qtd" type="number" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} className="border border-[#a0a0a0] p-1 w-16" />
              {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="text-red-600"><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={combos}
            columns={[
              { header: 'Combo', accessor: 'name', width: '26%' },
              { header: 'Componentes', accessor: (r: any) => (r.items || []).map((c: any) => `${c.quantity}× ${c.item_name}`).join(', '), width: '46%' },
              { header: 'Preço', accessor: (r: any) => Number(r.price).toFixed(2), width: '18%' },
              { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
