import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { CalendarX, Plus, Trash2 } from 'lucide-react';
import { useWhLots, useWhWarehouses, useWhItems } from '../../../hooks/useWh';

export default function WhLotsView() {
  const warehouses = useWhWarehouses().data ?? [];
  const [onlyExpiring, setOnlyExpiring] = useState(false);
  const { query, create, remove } = useWhLots(onlyExpiring ? { expiring: '1' } : undefined);
  const rows = query.data ?? [];
  const [itemSearch, setItemSearch] = useState('');
  const items = useWhItems(itemSearch || undefined).data ?? [];
  const [f, setF] = useState<any>({ item: '', warehouse: '', lot_number: '', quantity: '', expiry_date: '' });

  const add = () => {
    if (!f.item || !f.lot_number) return;
    create.mutate({ ...f, item: Number(f.item), warehouse: Number(f.warehouse || warehouses[0]?.id), quantity: Number(f.quantity) || 0, expiry_date: f.expiry_date || null },
      { onSuccess: () => setF({ item: '', warehouse: f.warehouse, lot_number: '', quantity: '', expiry_date: '' }) });
  };

  const tone = (d: number | null) => d == null ? '' : d < 0 ? 'text-red-600 font-bold' : d <= 30 ? 'text-amber-700 font-bold' : 'text-gray-700';

  return (
    <ClassicWindow title="Lotes & Validades (FEFO)" icon={<CalendarX size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Lotes: {rows.length} · ordenados por validade (expira primeiro)</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <select value={f.warehouse} onChange={(e) => setF({ ...f, warehouse: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">Armazém…</option>
            {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input placeholder="Pesquisar artigo" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="border border-[#a0a0a0] p-1 w-32" />
          <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white max-w-[160px]">
            <option value="">Artigo…</option>
            {items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input placeholder="Nº lote" value={f.lot_number} onChange={(e) => setF({ ...f, lot_number: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <input type="number" placeholder="Qtd" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Registar Lote" onClick={add} />
          <label className="flex items-center gap-1 ml-2"><input type="checkbox" checked={onlyExpiring} onChange={(e) => setOnlyExpiring(e.target.checked)} />Só a expirar (30d)</label>
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Artigo', accessor: (r: any) => `${r.item_code} · ${r.item_name}`, width: '28%' },
            { header: 'Lote', accessor: 'lot_number', width: '13%' },
            { header: 'Qtd', accessor: 'quantity', width: '10%' },
            { header: 'Armazém', accessor: 'warehouse_name', width: '17%' },
            { header: 'Validade', accessor: (r: any) => r.expiry_date || '—', width: '13%' },
            { header: 'Dias', accessor: (r: any) => <span className={tone(r.days_to_expiry)}>{r.days_to_expiry == null ? '—' : r.days_to_expiry < 0 ? `expirado ${-r.days_to_expiry}d` : `${r.days_to_expiry}d`}</span>, width: '13%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
