import { useEffect, useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { ShoppingBag, Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import {
  usePOs, usePO, useCreatePO, useDeletePO, useSetPOStatus, useAddPOLine, useDeletePOLine, useWarehousesLookup,
} from '../../hooks/useProcurement';
import { useSuppliers } from '../../hooks/useEsm';
import { useMdItems, useMdUoms } from '../../hooks/useMasterData';
import { PO_STATUS } from '../../api/procurement';
import type { PurchaseOrder } from '../../api/procurement';

const fmt = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputCls = 'flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white';

function PODetail({ poId, onBack }: { poId: number | null; onBack: () => void }) {
  const [currentId, setCurrentId] = useState<number | null>(poId);
  const { data: po } = usePO(currentId ?? undefined);
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useWarehousesLookup();
  const { data: items = [] } = useMdItems();
  const { data: uoms = [] } = useMdUoms();
  const createPO = useCreatePO();
  const addLine = useAddPOLine();
  const delLine = useDeletePOLine();
  const setStatus = useSetPOStatus();

  const [form, setForm] = useState<Partial<PurchaseOrder>>({ po_number: `PO-${Date.now().toString().slice(-6)}`, status: 'Draft' });
  const [line, setLine] = useState<any>({ item: '', quantity_requested: '', uom: '', unit_price: '' });

  useEffect(() => { if (po) setForm(po); }, [po]);
  const isNew = !currentId;
  const set = (p: Partial<PurchaseOrder>) => setForm((f) => ({ ...f, ...p }));

  const save = () => {
    if (!form.supplier || !form.delivery_warehouse) { alert('Escolha fornecedor e armazém.'); return; }
    createPO.mutate(form, { onSuccess: (r) => setCurrentId(r.id!) });
  };
  const addComponent = () => {
    if (!line.item || !line.quantity_requested || !line.uom || !line.unit_price || !currentId) return;
    addLine.mutate(
      { purchase_order: currentId, item: Number(line.item), quantity_requested: line.quantity_requested, uom: Number(line.uom), unit_price: line.unit_price },
      { onSuccess: () => setLine({ item: '', quantity_requested: '', uom: '', unit_price: '' }) }
    );
  };

  return (
    <ClassicWindow
      title={isNew ? 'Nova Ordem de Compra' : `PO ${po?.po_number ?? ''}`}
      icon={<ShoppingBag size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            {isNew && <ClassicButton icon={Save} label="Criar Ordem" onClick={save} />}
            {!isNew && po && (
              <>
                <span className="text-[11px] text-gray-700">Total: <b className="text-[#1e3f66]">{fmt(po.total_amount)}</b></span>
                <select value={po.status} onChange={(e) => setStatus.mutate({ id: currentId!, status: e.target.value })} className="border border-[#a0a0a0] p-1 text-[11px] ml-3 bg-white">
                  {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </>
            )}
          </div>
          <ClassicButton icon={ArrowLeft} label="Voltar à Lista" onClick={onBack} />
        </>
      }
    >
      <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto text-[11px] space-y-4">
        <div className="border border-[#a0a0a0] bg-white p-2">
          <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Cabeçalho</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-2">
            <div className="flex items-center"><label className="w-32 font-bold">Nº Ordem *</label>
              <input value={form.po_number || ''} onChange={(e) => set({ po_number: e.target.value })} disabled={!isNew} className={inputCls} /></div>
            <div className="flex items-center"><label className="w-32 font-bold">Fornecedor *</label>
              <select value={form.supplier || ''} onChange={(e) => set({ supplier: Number(e.target.value) })} disabled={!isNew} className={inputCls}>
                <option value="">— escolher —</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>[{s.code}] {s.commercial_name}</option>)}
              </select></div>
            <div className="flex items-center"><label className="w-32 font-bold">Armazém Entrega *</label>
              <select value={form.delivery_warehouse || ''} onChange={(e) => set({ delivery_warehouse: Number(e.target.value) })} disabled={!isNew} className={inputCls}>
                <option value="">— escolher —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div className="flex items-center"><label className="w-32 font-bold">Entrega Prevista</label>
              <input type="date" value={form.expected_delivery_date || ''} onChange={(e) => set({ expected_delivery_date: e.target.value })} className={inputCls} /></div>
          </div>
        </div>

        {isNew ? (
          <div className="border border-[#a0a0a0] bg-[#fffbe6] p-3 text-gray-700">Crie a ordem para adicionar linhas.</div>
        ) : (
          <div className="border border-[#a0a0a0] bg-white p-2">
            <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Linhas</h3>
            <div className="flex flex-wrap items-end gap-2 mb-3 bg-[#f8f8f8] p-2 border border-[#e0e0e0]">
              <select value={line.item} onChange={(e) => setLine({ ...line, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                <option value="">— artigo —</option>
                {items.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
              </select>
              <input placeholder="Qtd" type="number" value={line.quantity_requested} onChange={(e) => setLine({ ...line, quantity_requested: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
              <select value={line.uom} onChange={(e) => setLine({ ...line, uom: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                <option value="">un</option>
                {uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </select>
              <input placeholder="Preço unit." type="number" value={line.unit_price} onChange={(e) => setLine({ ...line, unit_price: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
              <ClassicButton icon={Plus} label="Adicionar" onClick={addComponent} />
            </div>
            <ClassicGrid
              rowKey="id"
              data={po?.lines || []}
              columns={[
                { header: 'Cód.', accessor: 'item_code', width: '12%' },
                { header: 'Artigo', accessor: 'item_name', width: '36%' },
                { header: 'Qtd', accessor: (r: any) => `${fmt(r.quantity_requested)} ${r.uom_code || ''}`, width: '16%' },
                { header: 'Preço', accessor: (r: any) => fmt(r.unit_price), width: '15%' },
                { header: 'Total', accessor: (r: any) => fmt(r.line_total), width: '16%' },
                { header: '', accessor: (r: any) => <button onClick={() => delLine.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
              ]}
            />
            <div className="flex justify-end mt-2 text-[12px] font-bold text-[#1e3f66] pr-2">Total da Ordem: {fmt(po?.total_amount)}</div>
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}

export default function PurchaseOrdersView() {
  const [mode, setMode] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: pos = [] } = usePOs();
  const del = useDeletePO();
  const open = (id: number | null) => { setSelectedId(id); setMode('detail'); };

  if (mode === 'detail') return <PODetail poId={selectedId} onBack={() => setMode('list')} />;

  return (
    <ClassicWindow
      title="Ordens de Compra"
      icon={<ShoppingBag size={14} className="text-gray-300" />}
      footer={<>
        <ClassicButton icon={Plus} label="Nova Ordem" onClick={() => open(null)} />
        <div className="text-gray-600">Nº registos: {pos.length}</div>
      </>}
    >
      <ClassicGrid
        rowKey="id"
        data={pos}
        onRowClick={(r) => open(r.id)}
        columns={[
          { header: 'Nº Ordem', accessor: 'po_number', width: '16%' },
          { header: 'Fornecedor', accessor: 'supplier_name', width: '30%' },
          { header: 'Armazém', accessor: (r: any) => r.warehouse_name, width: '18%' },
          { header: 'Estado', accessor: (r: any) => PO_STATUS[r.status] || r.status, width: '16%' },
          { header: 'Total', accessor: (r: any) => <b className="text-[#1e3f66]">{fmt(r.total_amount)}</b>, width: '15%' },
          { header: '', accessor: (r: any) => <button onClick={(e) => { e.stopPropagation(); if (confirm(`Apagar a ordem ${r.po_number}?`)) del.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
        ]}
      />
    </ClassicWindow>
  );
}
