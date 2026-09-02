import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Copy, X, Hand } from 'lucide-react';
import { apiClient } from '../../api/client';
import ClassicGrid from '../ui/ClassicGrid';

/** "Search blocks" — escolher um Bloco para usar como Allotment na Disponibilidade. */
export default function PmsBlockPickerDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (block: any) => void }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({ queryKey: ['pms', 'blocks'], queryFn: async () => (await apiClient.get('pms/blocks/')).data });
  const rows = (Array.isArray(data) ? data : data?.results || []).filter((b: any) =>
    !q || `${b.code} ${b.description}`.toLowerCase().includes(q.toLowerCase()));
  const [selId, setSelId] = useState<number | null>(null);
  const sel = rows.find((r: any) => r.id === selId);

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[900px] max-h-[70vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
          Search blocks
          <div className="flex items-center gap-2">
            <button className="text-white/70 hover:text-white" title="Janelas"><Copy size={13} /></button>
            <button onClick={onClose} title="Fechar"
              className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        </div>
        <div className="p-2 bg-white border-b border-[#d0d0d0] flex items-center gap-2 text-[12px]">
          Pesquisa livre:
          <span className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              className="border border-[#a0a0a0] p-1 pr-7 w-64" />
            <Search size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666]" />
          </span>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={(r: any) => setSelId(r.id)} columns={[
            { header: 'Código', accessor: 'code', width: '10%' },
            { header: 'Válido de', accessor: 'valid_from', width: '12%' },
            { header: 'Válido até', accessor: 'valid_to', width: '12%' },
            { header: 'Empresa', accessor: (r: any) => r.main_entity_name || r.group_name || '—', width: '18%' },
            { header: 'Descrição', accessor: 'description', width: '20%' },
            { header: '', accessor: (r: any) => r.color
                ? <span className="w-3.5 h-3.5 inline-block" style={{ background: r.color }} /> : '', width: '5%' },
            { header: 'Garantido', accessor: (r: any) => r.is_guaranteed ? 'Sim' : 'Não', width: '9%' },
            { header: 'Bloco principal', accessor: () => '—', width: '14%' },
          ]} />
        </div>
        <div className="flex justify-between items-center px-3 py-1.5 bg-[#e8e8e8] border-t border-[#c0c0c0]">
          <button disabled={!sel} onClick={() => sel && onSelect(sel)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] disabled:text-gray-400 hover:text-black disabled:hover:text-gray-400">
            <Hand size={13} /> Selecionar
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white">
              <X size={9} strokeWidth={3} />
            </span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
