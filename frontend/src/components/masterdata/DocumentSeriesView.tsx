import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useMdDocumentSeries, useMdCreateDocumentSeries, useMdDeleteDocumentSeries } from '../../hooks/useMasterData';
import { DOCUMENT_TYPES } from '../../api/masterdata';

const typeLabel = (v: string) => DOCUMENT_TYPES.find((t) => t.value === v)?.label || v;

export default function DocumentSeriesView() {
  const { data: series = [] } = useMdDocumentSeries();
  const create = useMdCreateDocumentSeries();
  const del = useMdDeleteDocumentSeries();
  const [draft, setDraft] = useState<any>({ code: '', name: '', document_type: 'INVOICE', prefix: 'FT', year: 2026 });

  const add = () => {
    if (!draft.code || !draft.name) return;
    create.mutate({ ...draft, year: Number(draft.year) || 2026 }, { onSuccess: () => setDraft({ code: '', name: '', document_type: 'INVOICE', prefix: 'FT', year: 2026 }) });
  };

  return (
    <ClassicWindow title="Séries de Documentos (Master Data)" icon={<FileText size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Nº registos: {series.length}</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Código" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-24" />
          <input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={draft.document_type} onChange={(e) => setDraft({ ...draft, document_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {DOCUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input placeholder="Prefixo" value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-20" />
          <input placeholder="Ano" type="number" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <ClassicButton icon={Plus} label="Adicionar Série" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={series}
            columns={[
              { header: 'Código', accessor: 'code', width: '13%' },
              { header: 'Nome', accessor: 'name', width: '25%' },
              { header: 'Tipo', accessor: (r: any) => typeLabel(r.document_type), width: '24%' },
              { header: 'Formato', accessor: (r: any) => `${r.prefix}${r.year}/####`, width: '18%' },
              { header: 'Último nº', accessor: 'current_number', width: '12%' },
              { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
