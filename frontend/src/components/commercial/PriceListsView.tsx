import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Tags, Plus, Trash2, ListPlus } from 'lucide-react';
import { usePriceLists, useCreatePriceList, useDeletePriceList, useSetPrice, useRemovePriceItem } from '../../hooks/usePriceLists';
import { useMdItems } from '../../hooks/useMasterData';

export default function PriceListsView() {
  const { data: lists = [] } = usePriceLists();
  const { data: items = [] } = useMdItems();
  const create = useCreatePriceList();
  const del = useDeletePriceList();
  const setPrice = useSetPrice();
  const removeItem = useRemovePriceItem();
  const [draft, setDraft] = useState({ code: '', name: '', currency: 'AOA' });
  const [sel, setSel] = useState<number | undefined>();
  const [line, setLine] = useState({ item: '', price: '' });

  const active = lists.find((l: any) => l.id === sel) || lists[0];
  const addList = () => { if (!draft.code || !draft.name) return; create.mutate(draft, { onSuccess: () => setDraft({ code: '', name: '', currency: 'AOA' }) }); };
  const addPrice = () => {
    if (!active || !line.item || !line.price) { alert('Escolha artigo e preço.'); return; }
    setPrice.mutate({ id: active.id as number, item: Number(line.item), price: line.price }, { onSuccess: () => setLine({ item: '', price: '' }) });
  };

  return (
    <ClassicWindow title="Tabelas de Preço (mesmo artigo, preço por área)" icon={<Tags size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Cada Outlet aponta para uma tabela → o POS aplica o preço da área. As promoções aplicam por cima.</div>}>
      <div className="flex h-full">
        {/* Tabelas */}
        <div className="w-64 border-r border-[#a0a0a0] flex flex-col">
          <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] p-2 space-y-1 text-[11px]">
            <input placeholder="Código" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-full" />
            <input placeholder="Nome da tabela" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1 w-full" />
            <ClassicButton icon={Plus} label="Nova Tabela" onClick={addList} />
          </div>
          <div className="flex-1 overflow-auto">
            {lists.map((l: any) => (
              <div key={l.id} onClick={() => setSel(l.id)} className={`flex items-center justify-between px-3 py-2 text-[12px] cursor-pointer border-b border-[#e0e0e0] ${active?.id === l.id ? 'bg-[#cce8ff]' : 'hover:bg-[#f5f5f5]'}`}>
                <span><b>{l.name}</b><br /><span className="text-gray-500 text-[10px]">{l.code} · {l.item_count ?? (l.items?.length || 0)} artigos</span></span>
                <button onClick={(e) => { e.stopPropagation(); del.mutate(l.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
              </div>
            ))}
            {lists.length === 0 && <div className="p-3 text-gray-400 text-[11px]">Sem tabelas. Crie a primeira.</div>}
          </div>
        </div>

        {/* Artigos da tabela selecionada */}
        <div className="flex-1 flex flex-col">
          <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px] flex flex-wrap items-end gap-2">
            <span className="font-bold text-[#1e3f66]">{active ? `Preços · ${active.name}` : 'Selecione uma tabela'}</span>
            {active && <>
              <select value={line.item} onChange={(e) => setLine({ ...line, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white ml-auto">
                <option value="">— artigo —</option>{items.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
              </select>
              <input placeholder="Preço" type="number" value={line.price} onChange={(e) => setLine({ ...line, price: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
              <ClassicButton icon={ListPlus} label="Definir Preço" onClick={addPrice} />
            </>}
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" data={active?.items || []} columns={[
              { header: 'Código', accessor: 'item_code', width: '18%' },
              { header: 'Artigo', accessor: 'item_name', width: '52%' },
              { header: 'Preço', accessor: (r: any) => Number(r.price).toFixed(2), width: '20%' },
              { header: '', accessor: (r: any) => <button onClick={() => active && removeItem.mutate({ id: active.id as number, item: r.item })} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
            ]} />
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}
