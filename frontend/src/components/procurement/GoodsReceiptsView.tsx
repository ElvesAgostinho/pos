import { useEffect, useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { PackageCheck, Plus, Trash2, Save, ArrowLeft, CheckCircle } from 'lucide-react';
import {
  useGRNs, useGRN, useCreateGRN, useDeleteGRN, useValidateGRN, useAddGRNLine, useDeleteGRNLine, usePOs,
} from '../../hooks/useProcurement';
import { useMdItems, useMdUoms } from '../../hooks/useMasterData';
import { GRN_STATUS } from '../../api/procurement';
import type { GoodsReceipt } from '../../api/procurement';

const fmt = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputCls = 'flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white';

function GRNDetail({ grnId, onBack }: { grnId: number | null; onBack: () => void }) {
  const [currentId, setCurrentId] = useState<number | null>(grnId);
  const { data: grn } = useGRN(currentId ?? undefined);
  const { data: pos = [] } = usePOs();
  const { data: items = [] } = useMdItems();
  const { data: uoms = [] } = useMdUoms();
  const createGRN = useCreateGRN();
  const addLine = useAddGRNLine();
  const delLine = useDeleteGRNLine();
  const validate = useValidateGRN();

  const [form, setForm] = useState<Partial<GoodsReceipt>>({ receipt_number: `GRN-${Date.now().toString().slice(-6)}`, status: 'Draft' });
  const [line, setLine] = useState<any>({ item: '', quantity_received: '', uom: '', unit_cost: '' });

  useEffect(() => { if (grn) setForm(grn); }, [grn]);
  const isNew = !currentId;
  const validated = grn?.status === 'Validated';

  const save = () => createGRN.mutate(form, { onSuccess: (r) => setCurrentId(r.id!) });
  const addComponent = () => {
    if (!line.item || !line.quantity_received || !line.uom || !line.unit_cost || !currentId) return;
    addLine.mutate(
      { goods_receipt: currentId, item: Number(line.item), quantity_received: line.quantity_received, uom: Number(line.uom), unit_cost: line.unit_cost },
      { onSuccess: () => setLine({ item: '', quantity_received: '', uom: '', unit_cost: '' }) }
    );
  };

  return (
    <ClassicWindow
      title={isNew ? 'Nova Receção' : `Receção ${grn?.receipt_number ?? ''}`}
      icon={<PackageCheck size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            {isNew && <ClassicButton icon={Save} label="Criar Receção" onClick={save} />}
            {!isNew && !validated && (
              <ClassicButton icon={CheckCircle} label="Validar Receção" onClick={() => validate.mutate(currentId!)} />
            )}
            {validated && <span className="text-green-700 font-bold text-[11px]">✓ Validada — performance do fornecedor atualizada</span>}
          </div>
          <ClassicButton icon={ArrowLeft} label="Voltar à Lista" onClick={onBack} />
        </>
      }
    >
      <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto text-[11px] space-y-4">
        <div className="border border-[#a0a0a0] bg-white p-2">
          <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Cabeçalho</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-2">
            <div className="flex items-center"><label className="w-32 font-bold">Nº Receção *</label>
              <input value={form.receipt_number || ''} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} disabled={!isNew} className={inputCls} /></div>
            <div className="flex items-center"><label className="w-32 font-bold">Ordem de Compra</label>
              <select value={form.purchase_order || ''} onChange={(e) => setForm({ ...form, purchase_order: e.target.value ? Number(e.target.value) : null })} disabled={!isNew} className={inputCls}>
                <option value="">— sem PO (receção direta) —</option>
                {pos.map((p: any) => <option key={p.id} value={p.id}>{p.po_number} · {p.supplier_name}</option>)}
              </select></div>
            <div className="flex items-center"><label className="w-32 font-bold">Fatura Fornecedor</label>
              <input value={form.supplier_invoice_ref || ''} onChange={(e) => setForm({ ...form, supplier_invoice_ref: e.target.value })} className={inputCls} /></div>
            {!isNew && <div className="flex items-center"><label className="w-32 font-bold">Fornecedor</label><span className="p-1 text-gray-700">{grn?.supplier_name}</span></div>}
          </div>
        </div>

        {isNew ? (
          <div className="border border-[#a0a0a0] bg-[#fffbe6] p-3 text-gray-700">Crie a receção para lançar as linhas recebidas. (Nota: escolher uma PO herda fornecedor e armazém.)</div>
        ) : (
          <div className="border border-[#a0a0a0] bg-white p-2">
            <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Linhas Recebidas</h3>
            {!validated && (
              <div className="flex flex-wrap items-end gap-2 mb-3 bg-[#f8f8f8] p-2 border border-[#e0e0e0]">
                <select value={line.item} onChange={(e) => setLine({ ...line, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">— artigo —</option>
                  {items.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
                </select>
                <input placeholder="Qtd recebida" type="number" value={line.quantity_received} onChange={(e) => setLine({ ...line, quantity_received: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
                <select value={line.uom} onChange={(e) => setLine({ ...line, uom: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">un</option>
                  {uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code}</option>)}
                </select>
                <input placeholder="Custo unit." type="number" value={line.unit_cost} onChange={(e) => setLine({ ...line, unit_cost: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
                <ClassicButton icon={Plus} label="Adicionar" onClick={addComponent} />
              </div>
            )}
            <ClassicGrid
              rowKey="id"
              data={grn?.lines || []}
              columns={[
                { header: 'Cód.', accessor: 'item_code', width: '14%' },
                { header: 'Artigo', accessor: 'item_name', width: '40%' },
                { header: 'Qtd Recebida', accessor: (r: any) => `${fmt(r.quantity_received)} ${r.uom_code || ''}`, width: '22%' },
                { header: 'Custo', accessor: (r: any) => fmt(r.unit_cost), width: '18%' },
                { header: '', accessor: (r: any) => (!validated ? <button onClick={() => delLine.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button> : null), width: '6%' },
              ]}
            />
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}

export default function GoodsReceiptsView() {
  const [mode, setMode] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: grns = [] } = useGRNs();
  const del = useDeleteGRN();
  const open = (id: number | null) => { setSelectedId(id); setMode('detail'); };

  if (mode === 'detail') return <GRNDetail grnId={selectedId} onBack={() => setMode('list')} />;

  return (
    <ClassicWindow
      title="Receção de Mercadorias (GRN)"
      icon={<PackageCheck size={14} className="text-gray-300" />}
      footer={<>
        <ClassicButton icon={Plus} label="Nova Receção" onClick={() => open(null)} />
        <div className="text-gray-600">Nº registos: {grns.length}</div>
      </>}
    >
      <ClassicGrid
        rowKey="id"
        data={grns}
        onRowClick={(r) => open(r.id)}
        columns={[
          { header: 'Nº Receção', accessor: 'receipt_number', width: '18%' },
          { header: 'Fornecedor', accessor: 'supplier_name', width: '28%' },
          { header: 'PO', accessor: (r: any) => r.po_number || '—', width: '16%' },
          { header: 'Estado', accessor: (r: any) => <span className={r.status === 'Validated' ? 'text-green-700 font-bold' : ''}>{GRN_STATUS[r.status] || r.status}</span>, width: '20%' },
          { header: '', accessor: (r: any) => <button onClick={(e) => { e.stopPropagation(); if (confirm(`Apagar a receção ${r.receipt_number}?`)) del.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
        ]}
      />
    </ClassicWindow>
  );
}
