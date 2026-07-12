import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Ruler, Plus, Trash2 } from 'lucide-react';
import { useMdUoms, useMdCreateUom, useMdDeleteUom } from '../../hooks/useMasterData';

export default function UomsView() {
  const { data: uoms = [] } = useMdUoms();
  const create = useMdCreateUom();
  const del = useMdDeleteUom();
  const [draft, setDraft] = useState({ code: '', name: '' });

  const add = () => { if (draft.code && draft.name) create.mutate(draft, { onSuccess: () => setDraft({ code: '', name: '' }) }); };

  return (
    <ClassicWindow
      title="Unidades de Medida (Master Data)"
      icon={<Ruler size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Nº registos: {uoms.length}</div>}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Código (ex: KG)" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-28" />
          <input placeholder="Nome (ex: Quilograma)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={uoms}
            columns={[
              { header: 'Código', accessor: 'code', width: '25%' },
              { header: 'Nome', accessor: 'name', width: '65%' },
              { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
