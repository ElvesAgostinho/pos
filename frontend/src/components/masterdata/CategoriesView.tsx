import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Tags, Plus, Trash2 } from 'lucide-react';
import { useMdCategories, useMdCreateCategory, useMdDeleteCategory } from '../../hooks/useMasterData';

export default function CategoriesView() {
  const { data: categories = [] } = useMdCategories();
  const create = useMdCreateCategory();
  const del = useMdDeleteCategory();
  const [draft, setDraft] = useState<{ name: string; parent: number | '' }>({ name: '', parent: '' });

  const add = () => {
    if (!draft.name) return;
    create.mutate({ name: draft.name, parent: draft.parent === '' ? null : Number(draft.parent) }, { onSuccess: () => setDraft({ name: '', parent: '' }) });
  };
  const nameById = (id: number | null | undefined) => categories.find((c) => c.id === id)?.name || '—';

  return (
    <ClassicWindow
      title="Categorias / Famílias (Master Data)"
      icon={<Tags size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Nº registos: {categories.length}</div>}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nome da categoria" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={draft.parent} onChange={(e) => setDraft({ ...draft, parent: e.target.value === '' ? '' : Number(e.target.value) })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— sem pai —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={categories}
            columns={[
              { header: 'Categoria', accessor: 'name', width: '50%' },
              { header: 'Categoria-Pai', accessor: (r: any) => nameById(r.parent), width: '40%' },
              { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
