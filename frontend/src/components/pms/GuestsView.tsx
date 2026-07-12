import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Users, Plus, Trash2 } from 'lucide-react';
import { useGuests, useCreateGuest, useDeleteGuest } from '../../hooks/usePms';

export default function GuestsView() {
  const { data: guests = [] } = useGuests();
  const create = useCreateGuest();
  const del = useDeleteGuest();
  const empty = { full_name: '', document_id: '', tax_id: '', phone: '', email: '', country: '' };
  const [draft, setDraft] = useState<any>(empty);

  const add = () => {
    if (!draft.full_name) { alert('Nome é obrigatório.'); return; }
    create.mutate(draft, { onSuccess: () => setDraft(empty) });
  };

  return (
    <ClassicWindow title="Hóspedes (PMS)" icon={<Users size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{guests.length} hóspede(s) · fonte única do cliente-hóspede</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nome completo" value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Documento" value={draft.document_id} onChange={(e) => setDraft({ ...draft, document_id: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <input placeholder="NIF" value={draft.tax_id} onChange={(e) => setDraft({ ...draft, tax_id: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <input placeholder="Telefone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <input placeholder="País" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <ClassicButton icon={Plus} label="Adicionar Hóspede" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={guests}
            columns={[
              { header: 'Nome', accessor: 'full_name', width: '28%' },
              { header: 'Documento', accessor: (r: any) => r.document_id || '—', width: '16%' },
              { header: 'NIF', accessor: (r: any) => r.tax_id || '—', width: '14%' },
              { header: 'Telefone', accessor: (r: any) => r.phone || '—', width: '16%' },
              { header: 'País', accessor: (r: any) => r.country || '—', width: '18%' },
              { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
