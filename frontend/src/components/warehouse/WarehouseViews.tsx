import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import Pagination from '../ui/Pagination';
import { Warehouse as WhIcon, Plus, Boxes, ArrowDownCircle, ArrowUpCircle, ClipboardCheck, ArrowRightLeft, History } from 'lucide-react';
import { useWarehouses, useCreateWarehouse, useStockLevels, useMovements, useStockOp } from '../../hooks/useWarehouse';
import { useMdItems } from '../../hooks/useMasterData';

const money = (v: any) => Number(v || 0).toFixed(2);
const qty = (v: any) => Number(v || 0).toFixed(2);

export function WarehousesView() {
  const { data: whs = [] } = useWarehouses();
  const create = useCreateWarehouse();
  const [name, setName] = useState('');
  return (
    <ClassicWindow title="Armazéns (Warehouse)" icon={<WhIcon size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{whs.length} armazém(éns)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nome do armazém" value={name} onChange={(e) => setName(e.target.value)} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Adicionar Armazém" onClick={() => { if (name) create.mutate({ name }, { onSuccess: () => setName('') }); }} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={whs} columns={[
            { header: 'Armazém', accessor: 'name', width: '50%' },
            { header: 'Hotel', accessor: (r: any) => r.hotel_name || '—', width: '35%' },
            { header: 'Principal', accessor: (r: any) => (r.is_main ? '✓' : '—'), width: '15%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function StockLevelsView() {
  const { data: whs = [] } = useWarehouses();
  const [wh, setWh] = useState<number | undefined>();
  const { data: levels = [] } = useStockLevels(wh ? { warehouse: wh } : undefined);
  const { data: items = [] } = useMdItems();
  const receive = useStockOp('receive');
  const issue = useStockOp('issue');
  const adjust = useStockOp('adjust');
  const transfer = useStockOp('transfer');
  const [op, setOp] = useState<any>({ item: '', quantity: '', unit_cost: '', counted: '', dest: '' });

  const doReceive = () => { if (!wh || !op.item || !op.quantity) return alert('Armazém, artigo e quantidade.'); receive.mutate({ warehouse: wh, item: Number(op.item), quantity: op.quantity, unit_cost: op.unit_cost || 0 }, { onSuccess: reset }); };
  const doIssue = () => { if (!wh || !op.item || !op.quantity) return alert('Armazém, artigo e quantidade.'); issue.mutate({ warehouse: wh, item: Number(op.item), quantity: op.quantity }, { onSuccess: reset }); };
  const doAdjust = () => { if (!wh || !op.item || op.counted === '') return alert('Armazém, artigo e contagem.'); adjust.mutate({ warehouse: wh, item: Number(op.item), counted: op.counted }, { onSuccess: reset }); };
  const doTransfer = () => { if (!wh || !op.item || !op.quantity || !op.dest) return alert('Origem, destino, artigo e quantidade.'); transfer.mutate({ source: wh, dest: Number(op.dest), item: Number(op.item), quantity: op.quantity }, { onSuccess: reset }); };
  const reset = () => setOp({ item: '', quantity: '', unit_cost: '', counted: '', dest: '' });

  return (
    <ClassicWindow title="Stock Atual & Operações (Warehouse)" icon={<Boxes size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Custo médio ponderado móvel · a receção de compras entra aqui automaticamente</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <select value={wh || ''} onChange={(e) => setWh(e.target.value ? Number(e.target.value) : undefined)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— armazém —</option>{whs.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={op.item} onChange={(e) => setOp({ ...op, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— artigo —</option>{items.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
          </select>
          <input placeholder="Qtd" type="number" value={op.quantity} onChange={(e) => setOp({ ...op, quantity: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <input placeholder="Custo" type="number" value={op.unit_cost} onChange={(e) => setOp({ ...op, unit_cost: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <ClassicButton icon={ArrowDownCircle} label="Entrada" onClick={doReceive} />
          <ClassicButton icon={ArrowUpCircle} label="Saída" onClick={doIssue} />
          <input placeholder="Contado" type="number" value={op.counted} onChange={(e) => setOp({ ...op, counted: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <ClassicButton icon={ClipboardCheck} label="Ajuste inventário" onClick={doAdjust} />
          <select value={op.dest} onChange={(e) => setOp({ ...op, dest: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— destino —</option>{whs.filter((w: any) => w.id !== wh).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <ClassicButton icon={ArrowRightLeft} label="Transferir" onClick={doTransfer} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={levels} columns={[
            { header: 'Código', accessor: 'item_code', width: '12%' },
            { header: 'Artigo', accessor: 'item_name', width: '30%' },
            { header: 'Un', accessor: 'uom_code', width: '8%' },
            { header: 'Em stock', accessor: (r: any) => <span className={Number(r.quantity_on_hand) <= Number(r.min_stock_alert) ? 'text-red-600 font-bold' : ''}>{qty(r.quantity_on_hand)}</span>, width: '14%' },
            { header: 'Disponível', accessor: (r: any) => qty(r.available_quantity), width: '12%' },
            { header: 'Custo méd.', accessor: (r: any) => money(r.unit_cost), width: '12%' },
            { header: 'Valor', accessor: (r: any) => money(Number(r.quantity_on_hand) * Number(r.unit_cost)), width: '12%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

const MTC: Record<string, string> = { IN: 'text-green-700', GRN: 'text-green-700', OUT: 'text-red-600', ADJUST: 'text-[#b06a00]', TRANSFER_IN: 'text-blue-700', TRANSFER_OUT: 'text-blue-700' };
export function StockMovementsView() {
  const PAGE = 25;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const { data } = useMovements({ page, page_size: PAGE, search: q || undefined }) as any;
  const moves = data?.results || (Array.isArray(data) ? data : []);
  const count = data?.count ?? moves.length;
  return (
    <ClassicWindow title="Movimentos de Stock (ledger)" icon={<History size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{count} movimento(s) · histórico completo (entradas, saídas, transferências, ajustes, receções)</div>}>
      <div className="flex flex-col h-full">
        <form className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px]" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
          <input className="border border-[#a0a0a0] p-1 w-64" placeholder="Pesquisar artigo (código/nome) ou referência…" value={search} onChange={e => setSearch(e.target.value)} />
          <ClassicButton label="Pesquisar" onClick={() => { setPage(1); setQ(search); }} />
          {q && <button type="button" className="text-[#1e3f66] hover:underline" onClick={() => { setSearch(''); setQ(''); setPage(1); }}>limpar</button>}
        </form>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={moves} columns={[
            { header: 'Data/Hora', accessor: (r: any) => new Date(r.created_at).toLocaleString('pt-PT'), width: '18%' },
            { header: 'Tipo', accessor: (r: any) => <span className={MTC[r.movement_type] || ''}>{r.movement_type_display}</span>, width: '16%' },
            { header: 'Artigo', accessor: (r: any) => `${r.item_code} · ${r.item_name}`, width: '28%' },
            { header: 'Armazém', accessor: 'warehouse_name', width: '15%' },
            { header: 'Qtd', accessor: (r: any) => qty(r.quantity), width: '9%' },
            { header: 'Custo', accessor: (r: any) => money(r.unit_cost), width: '8%' },
            { header: 'Ref.', accessor: (r: any) => r.reference || '—', width: '6%' },
          ]} />
        </div>
        {data?.count !== undefined && <Pagination page={page} pageSize={PAGE} count={count} onPage={setPage} />}
      </div>
    </ClassicWindow>
  );
}
