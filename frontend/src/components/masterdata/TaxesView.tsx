import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Percent, Plus, Trash2 } from 'lucide-react';
import { useMdTaxes, useMdCreateTax, useMdDeleteTax } from '../../hooks/useMasterData';

export default function TaxesView() {
  const { data: taxes = [] } = useMdTaxes();
  const create = useMdCreateTax();
  const del = useMdDeleteTax();
  const [draft, setDraft] = useState<any>({ code: '', name: '', percentage: '' });

  const add = () => {
    if (!draft.code || !draft.name || draft.percentage === '') return;
    create.mutate(draft, { onSuccess: () => setDraft({ code: '', name: '', percentage: '' }) });
  };

  return (
    <ClassicWindow
      title="Impostos (Master Data)"
      icon={<Percent size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Nº registos: {taxes.length}</div>}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Código (ex: IVA14)" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-28" />
          <input placeholder="Nome / Descrição" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Taxa %" type="number" step="0.01" value={draft.percentage} onChange={(e) => setDraft({ ...draft, percentage: e.target.value })} className="border border-[#a0a0a0] p-1 w-24 bg-[#ffffe0]" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={taxes}
            columns={[
              { header: 'Código', accessor: 'code', width: '22%' },
              { header: 'Nome / Descrição', accessor: 'name', width: '48%' },
              { header: 'Taxa (%)', accessor: (r: any) => `${Number(r.percentage).toFixed(2)}%`, width: '20%' },
              { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
