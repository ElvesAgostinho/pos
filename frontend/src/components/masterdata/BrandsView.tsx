import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Tag, Plus, Trash2 } from 'lucide-react';
import { useMdBrands, useMdCreateBrand, useMdDeleteBrand } from '../../hooks/useMasterData';

export default function BrandsView() {
  const { data: brands = [] } = useMdBrands();
  const create = useMdCreateBrand();
  const del = useMdDeleteBrand();
  const [draft, setDraft] = useState<any>({ name: '', manufacturer: '' });

  const add = () => { if (draft.name) create.mutate(draft, { onSuccess: () => setDraft({ name: '', manufacturer: '' }) }); };

  return (
    <ClassicWindow
      title="Marcas & Fabricantes (Master Data)"
      icon={<Tag size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Nº registos: {brands.length}</div>}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Marca" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Fabricante (opcional)" value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={brands}
            columns={[
              { header: 'Marca', accessor: 'name', width: '45%' },
              { header: 'Fabricante', accessor: (r: any) => r.manufacturer || '—', width: '45%' },
              { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
