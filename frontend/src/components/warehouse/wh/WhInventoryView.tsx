import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { ClipboardList, Plus, Trash2, CheckCircle } from 'lucide-react';
import { useWhCounts, useConfirmCount, useWhWarehouses, useWhItems } from '../../../hooks/useWh';

export default function WhInventoryView() {
  const warehouses = useWhWarehouses().data ?? [];
  const { query, create, update, remove } = useWhCounts();
  const confirm = useConfirmCount();
  const counts = query.data ?? [];
  const [selId, setSelId] = useState<number | null>(null);
  const sel = counts.find((c: any) => c.id === selId);

  const [wh, setWh] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const items = useWhItems(itemSearch || undefined).data ?? [];
  const [ln, setLn] = useState<any>({ item: '', counted_qty: '' });

  const createCount = () => {
    const warehouse = wh || warehouses[0]?.id;
    if (!warehouse) return;
    create.mutate({ warehouse: Number(warehouse), lines: [] } as any, { onSuccess: (c: any) => { setSelId(c.id); } });
  };
  const addLine = () => {
    if (!sel || !ln.item || ln.counted_qty === '') return;
    const lines = [...(sel.lines || []).map((l: any) => ({ item: l.item, counted_qty: l.counted_qty })), { item: Number(ln.item), counted_qty: Number(ln.counted_qty) }];
    update.mutate({ id: sel.id!, data: { lines } as any }, { onSuccess: () => setLn({ item: '', counted_qty: '' }) });
  };
  const removeLine = (idx: number) => {
    if (!sel) return;
    const lines = (sel.lines || []).filter((_: any, i: number) => i !== idx).map((l: any) => ({ item: l.item, counted_qty: l.counted_qty }));
    update.mutate({ id: sel.id!, data: { lines } as any });
  };

  const vTone = (v: any) => Number(v) === 0 ? 'text-gray-500' : Number(v) > 0 ? 'text-green-700 font-bold' : 'text-red-600 font-bold';

  return (
    <ClassicWindow title="Inventários Físicos (Stocktake)" icon={<ClipboardList size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Inventários: {counts.length}</div>}>
      <div className="flex h-full">
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <select value={wh} onChange={(e) => setWh(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white">
              <option value="">Armazém…</option>{warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <ClassicButton icon={Plus} label="Novo Inventário" onClick={createCount} />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" data={counts} selectedRowId={selId ?? undefined} onRowClick={(r: any) => setSelId(r.id)} columns={[
              { header: 'Nº', accessor: 'number', width: '22%' },
              { header: 'Armazém', accessor: 'warehouse_name', width: '40%' },
              { header: 'Estado', accessor: (r: any) => <span className={r.status === 'CONFIRMED' ? 'text-green-700 font-bold' : 'text-amber-700'}>{r.status_display}</span>, width: '26%' },
              { header: '', accessor: (r: any) => r.status !== 'CONFIRMED' ? <button onClick={(e) => { e.stopPropagation(); remove.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button> : null, width: '12%' },
            ]} />
          </div>
        </div>

        <div className="w-1/2 flex flex-col">
          {sel ? (
            <>
              <div className="flex items-center justify-between p-2 bg-[#eef4fb] border-b border-[#a0a0a0] text-[11px]">
                <span className="font-bold">{sel.number} · {sel.warehouse_name}</span>
                {sel.status !== 'CONFIRMED'
                  ? <ClassicButton icon={CheckCircle} label="Confirmar (ajustar stock)" onClick={() => confirm.mutate(sel.id!)} />
                  : <span className="text-green-700 font-bold">✓ Confirmado</span>}
              </div>
              {sel.status !== 'CONFIRMED' && (
                <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
                  <input placeholder="Pesquisar artigo" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="border border-[#a0a0a0] p-1 w-28" />
                  <select value={ln.item} onChange={(e) => setLn({ ...ln, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white max-w-[150px]">
                    <option value="">Artigo…</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <input type="number" placeholder="Contado" value={ln.counted_qty} onChange={(e) => setLn({ ...ln, counted_qty: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
                  <ClassicButton icon={Plus} label="Linha" onClick={addLine} />
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <ClassicGrid rowKey="id" data={(sel.lines || []).map((l: any, idx: number) => ({ ...l, _idx: idx }))} columns={[
                  { header: 'Artigo', accessor: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim(), width: '40%' },
                  { header: 'Sistema', accessor: 'system_qty', width: '18%' },
                  { header: 'Contado', accessor: 'counted_qty', width: '18%' },
                  { header: 'Desvio', accessor: (r: any) => <span className={vTone(r.variance)}>{r.variance}</span>, width: '16%' },
                  { header: '', accessor: (r: any) => sel.status !== 'CONFIRMED' ? <button onClick={() => removeLine(r._idx)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button> : null, width: '8%' },
                ]} />
              </div>
            </>
          ) : <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Selecione ou crie um inventário.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
