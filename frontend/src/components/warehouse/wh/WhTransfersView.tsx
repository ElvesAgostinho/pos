import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { ArrowLeftRight, Plus, Trash2, CheckCircle } from 'lucide-react';
import { useWhTransfers, useConfirmTransfer, useWhWarehouses, useWhItems } from '../../../hooks/useWh';

export default function WhTransfersView() {
  const warehouses = useWhWarehouses().data ?? [];
  const { query, create, update, remove } = useWhTransfers();
  const confirm = useConfirmTransfer();
  const transfers = query.data ?? [];
  const [selId, setSelId] = useState<number | null>(null);
  const sel = transfers.find((t: any) => t.id === selId);

  const [hdr, setHdr] = useState<any>({ source: '', destination: '' });
  const [itemSearch, setItemSearch] = useState('');
  const items = useWhItems(itemSearch || undefined).data ?? [];
  const [ln, setLn] = useState<any>({ item: '', quantity: '' });

  const createTransfer = () => {
    if (!hdr.source || !hdr.destination || hdr.source === hdr.destination) return;
    create.mutate({ source: Number(hdr.source), destination: Number(hdr.destination), lines: [] } as any,
      { onSuccess: (t: any) => { setSelId(t.id); setHdr({ source: '', destination: '' }); } });
  };
  const addLine = () => {
    if (!sel || !ln.item || !ln.quantity) return;
    const lines = [...(sel.lines || []).map((l: any) => ({ item: l.item, quantity: l.quantity })), { item: Number(ln.item), quantity: Number(ln.quantity) }];
    update.mutate({ id: sel.id!, data: { lines } as any }, { onSuccess: () => setLn({ item: '', quantity: '' }) });
  };
  const removeLine = (idx: number) => {
    if (!sel) return;
    const lines = (sel.lines || []).filter((_: any, i: number) => i !== idx).map((l: any) => ({ item: l.item, quantity: l.quantity }));
    update.mutate({ id: sel.id!, data: { lines } as any });
  };

  return (
    <ClassicWindow title="Transferências entre Armazéns" icon={<ArrowLeftRight size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Documentos: {transfers.length}</div>}>
      <div className="flex h-full">
        {/* Documentos */}
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <select value={hdr.source} onChange={(e) => setHdr({ ...hdr, source: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              <option value="">Origem…</option>{warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <span>→</span>
            <select value={hdr.destination} onChange={(e) => setHdr({ ...hdr, destination: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              <option value="">Destino…</option>{warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <ClassicButton icon={Plus} label="Nova" onClick={createTransfer} />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" data={transfers} selectedRowId={selId ?? undefined} onRowClick={(r: any) => setSelId(r.id)} columns={[
              { header: 'Nº', accessor: 'number', width: '20%' },
              { header: 'Origem → Destino', accessor: (r: any) => `${r.source_name} → ${r.destination_name}`, width: '46%' },
              { header: 'Estado', accessor: (r: any) => <span className={r.status === 'CONFIRMED' ? 'text-green-700 font-bold' : 'text-amber-700'}>{r.status_display}</span>, width: '22%' },
              { header: '', accessor: (r: any) => r.status !== 'CONFIRMED' ? <button onClick={(e) => { e.stopPropagation(); remove.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button> : null, width: '12%' },
            ]} />
          </div>
        </div>

        {/* Linhas do documento */}
        <div className="w-1/2 flex flex-col">
          {sel ? (
            <>
              <div className="flex items-center justify-between p-2 bg-[#eef4fb] border-b border-[#a0a0a0] text-[11px]">
                <span className="font-bold">{sel.number} · {sel.source_name} → {sel.destination_name}</span>
                {sel.status !== 'CONFIRMED'
                  ? <ClassicButton icon={CheckCircle} label="Confirmar" onClick={() => confirm.mutate(sel.id!)} />
                  : <span className="text-green-700 font-bold">✓ Confirmada</span>}
              </div>
              {sel.status !== 'CONFIRMED' && (
                <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
                  <input placeholder="Pesquisar artigo" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="border border-[#a0a0a0] p-1 w-28" />
                  <select value={ln.item} onChange={(e) => setLn({ ...ln, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white max-w-[150px]">
                    <option value="">Artigo…</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <input type="number" placeholder="Qtd" value={ln.quantity} onChange={(e) => setLn({ ...ln, quantity: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
                  <ClassicButton icon={Plus} label="Linha" onClick={addLine} />
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <ClassicGrid rowKey="id" data={(sel.lines || []).map((l: any, idx: number) => ({ ...l, _idx: idx }))} columns={[
                  { header: 'Artigo', accessor: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim(), width: '58%' },
                  { header: 'Qtd', accessor: 'quantity', width: '27%' },
                  { header: '', accessor: (r: any) => sel.status !== 'CONFIRMED'
                      ? <button onClick={() => removeLine(r._idx)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
                      : null, width: '15%' },
                ]} />
              </div>
              {sel.status !== 'CONFIRMED' && (
                <div className="p-2 border-t border-[#a0a0a0] text-[11px] text-gray-500">
                  {(sel.lines || []).length === 0 ? 'Adicione linhas e confirme para movimentar o stock.' : `${(sel.lines || []).length} linha(s). Confirmar move o stock (origem → destino).`}
                </div>
              )}
            </>
          ) : <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Selecione ou crie uma transferência.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
