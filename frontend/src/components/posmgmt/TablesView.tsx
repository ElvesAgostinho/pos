import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Grid3x3, Plus, Trash2 } from 'lucide-react';
import { useOutlets, useTables, useCreateTable, useDeleteTable } from '../../hooks/usePosMgmt';

const STATUS: Record<string, string> = { FREE: 'Livre', OCCUPIED: 'Ocupada', RESERVED: 'Reservada', DIRTY: 'Limpeza', BLOCKED: 'Bloqueada', MAINTENANCE: 'Manutenção' };

export default function TablesView() {
  const { data: outlets = [] } = useOutlets();
  const [outletId, setOutletId] = useState<number | null>(null);
  const { data: tables = [] } = useTables(outletId ?? undefined);
  const create = useCreateTable();
  const del = useDeleteTable();
  const empty = { table_number: '', name: '', zone: '', seats: 4, max_capacity: 6, is_vip: false, vip_discount_percent: 0, shape: 'SQUARE' };
  const [draft, setDraft] = useState<any>(empty);

  const add = () => {
    if (!draft.table_number || !outletId) return;
    const seats = Number(draft.seats) || 4;
    create.mutate({ ...draft, outlet: outletId, seats, recommended_capacity: seats, max_capacity: Number(draft.max_capacity) || seats },
      { onSuccess: () => setDraft(empty) });
  };

  return (
    <ClassicWindow title="Salas & Mesas" icon={<Grid3x3 size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{outletId ? `${tables.length} mesas` : 'Selecione um outlet'}</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Outlet:</label>
          <select value={outletId ?? ''} onChange={(e) => setOutletId(e.target.value ? Number(e.target.value) : null)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— escolher —</option>
            {outlets.map((o: any) => <option key={o.id} value={o.id}>[{o.code}] {o.name}</option>)}
          </select>
        </div>
        {!outletId ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Escolha um outlet para gerir as mesas.</div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-end gap-2 bg-[#f8f8f8] border-b border-[#e0e0e0] px-3 py-2 text-[11px]">
              <input placeholder="Nº Mesa" value={draft.table_number} onChange={(e) => setDraft({ ...draft, table_number: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
              <input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
              <input placeholder="Zona" value={draft.zone} onChange={(e) => setDraft({ ...draft, zone: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
              <input placeholder="Lugares" type="number" value={draft.seats} onChange={(e) => setDraft({ ...draft, seats: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" title="Capacidade normal" />
              <input placeholder="Máx." type="number" value={draft.max_capacity} onChange={(e) => setDraft({ ...draft, max_capacity: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" title="Capacidade máxima" />
              <select value={draft.shape} onChange={(e) => setDraft({ ...draft, shape: e.target.value })} className="border border-[#a0a0a0] p-1" title="Forma">
                <option value="SQUARE">Quadrada</option><option value="ROUND">Redonda</option><option value="RECT">Retangular</option><option value="BAR">Balcão</option><option value="SOFA">Sofá</option>
              </select>
              <label className="flex items-center gap-1"><input type="checkbox" checked={draft.is_vip} onChange={(e) => setDraft({ ...draft, is_vip: e.target.checked })} /> VIP</label>
              {draft.is_vip && <input placeholder="Desc.%" type="number" value={draft.vip_discount_percent} onChange={(e) => setDraft({ ...draft, vip_discount_percent: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" title="Desconto automático VIP %" />}
              <ClassicButton icon={Plus} label="Adicionar Mesa" onClick={add} />
            </div>
            <div className="flex-1 overflow-hidden">
              <ClassicGrid
                rowKey="id"
                data={tables}
                columns={[
                  { header: 'Nº', accessor: 'table_number', width: '12%' },
                  { header: 'Nome', accessor: (r: any) => <>{r.name || '—'}{r.is_vip ? <span className="text-[#c9a400] ml-1">★VIP</span> : null}</>, width: '26%' },
                  { header: 'Zona', accessor: (r: any) => r.zone || '—', width: '18%' },
                  { header: 'Cap. (norm/máx)', accessor: (r: any) => `${r.seats}/${r.max_capacity ?? r.seats}`, width: '16%' },
                  { header: 'Estado', accessor: (r: any) => STATUS[r.status] || r.status, width: '14%' },
                  { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '7%' },
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}
