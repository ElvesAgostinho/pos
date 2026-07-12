import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import GridToggle from '../ui/GridToggle';
import { Package, Plus, Trash2, Save, Search } from 'lucide-react';
import { useMdItems, useMdCreateItem, useMdUpdateItem, useMdDeleteItem, useMdUoms, useMdCategories, useMdBrands } from '../../hooks/useMasterData';
import { ITEM_TYPES } from '../../api/masterdata';
import type { MdItem } from '../../api/masterdata';

const money = (v: any) => v == null || v === '' ? '—' : Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const typeLabel = (v: string) => ITEM_TYPES.find((t) => t.value === v)?.label || v;
const inp = 'border border-[#a0a0a0] p-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3f66]';

function Field({ label, children, req }: any) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <label className="w-36 text-right text-gray-600">{label}{req && <span className="text-red-600"> *</span>}</label>
      {children}
    </div>
  );
}

const TABS = ['Geral', 'Preços & IVA', 'Stock & Compras'] as const;

export default function ItemsView() {
  const [search, setSearch] = useState('');
  const { data: items = [], isLoading } = useMdItems(search ? { search } : undefined);
  const { data: uoms = [] } = useMdUoms();
  const { data: categories = [] } = useMdCategories();
  const { data: brands = [] } = useMdBrands();
  const createItem = useMdCreateItem();
  const updateItem = useMdUpdateItem();
  const delItem = useMdDeleteItem();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [tab, setTab] = useState<typeof TABS[number]>('Geral');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<MdItem>>({});
  const [err, setErr] = useState('');

  const set = (patch: Partial<MdItem>) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => {
    setEditingId(null); setErr(''); setTab('Geral');
    setForm({ item_type: 'RawMaterial', is_active: true, is_sold: true, is_purchased: true, tax_percentage: 14, base_uom: uoms[0]?.id, min_stock: 0 });
    setMode('edit');
  };
  const openEdit = (it: MdItem) => { setEditingId(it.id!); setForm(it); setErr(''); setTab('Geral'); setMode('edit'); };

  const save = () => {
    if (!form.code || !form.name) { setErr('Código e Designação são obrigatórios.'); setTab('Geral'); return; }
    if (!form.base_uom) { setErr('Escolha a Unidade Base.'); setTab('Geral'); return; }
    const payload = { ...form };
    const onError = (e: any) => setErr('Erro: ' + JSON.stringify(e?.response?.data));
    if (editingId) updateItem.mutate({ id: editingId, data: payload }, { onSuccess: () => setMode('list'), onError });
    else createItem.mutate(payload, { onSuccess: () => setMode('list'), onError });
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow title={editingId ? `Editar Artigo — ${form.code || ''}` : 'Novo Artigo'} icon={<Package size={14} className="text-gray-300" />}
        footer={<><ClassicButton icon={Save} label="Gravar Artigo" onClick={save} /><ClassicButton label="Cancelar" onClick={() => setMode('list')} /><div className="text-red-600 text-[11px]">{err}</div></>}>
        <div className="flex flex-col h-full bg-[#f0f0f0] text-[11px]">
          {/* Separadores */}
          <div className="flex gap-0.5 px-2 pt-2 border-b border-[#a0a0a0]">
            {TABS.map((tt) => (
              <button key={tt} onClick={() => setTab(tt)} className={`px-4 py-1.5 border border-b-0 rounded-t ${tab === tt ? 'bg-white border-[#a0a0a0] font-bold text-[#1e3f66]' : 'bg-[#dcdcdc] border-[#c0c0c0] text-gray-600'}`}>{tt}</button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="border border-[#a0a0a0] bg-white p-3 max-w-2xl">
              {tab === 'Geral' && <>
                <Field label="Código" req><input value={form.code || ''} onChange={(e) => set({ code: e.target.value })} className={`${inp} w-48`} /></Field>
                <Field label="Designação" req><input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} className={`${inp} flex-1`} /></Field>
                <Field label="Código de barras"><input value={form.barcode || ''} onChange={(e) => set({ barcode: e.target.value })} className={`${inp} w-56`} /></Field>
                <Field label="Tipo"><select value={form.item_type || 'RawMaterial'} onChange={(e) => set({ item_type: e.target.value })} className={`${inp} w-56`}>{ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
                <Field label="Categoria"><select value={form.category ?? ''} onChange={(e) => set({ category: e.target.value ? Number(e.target.value) : null })} className={`${inp} w-56`}><option value="">— sem categoria —</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <Field label="Marca"><select value={form.brand ?? ''} onChange={(e) => set({ brand: e.target.value ? Number(e.target.value) : null })} className={`${inp} w-56`}><option value="">— sem marca —</option>{brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                <Field label="Unidade Base" req><select value={form.base_uom ?? ''} onChange={(e) => set({ base_uom: Number(e.target.value) })} className={`${inp} w-56`}><option value="">— escolher —</option>{uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</select></Field>
                <Field label="Imagem (URL)"><input value={form.image_url || ''} onChange={(e) => set({ image_url: e.target.value })} className={`${inp} flex-1`} placeholder="https://…" /></Field>
                <Field label="Ativo"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => set({ is_active: e.target.checked })} /></Field>
              </>}
              {tab === 'Preços & IVA' && <>
                <Field label="Preço de Venda"><input type="number" value={form.sale_price ?? ''} onChange={(e) => set({ sale_price: e.target.value })} className={`${inp} w-40 text-right`} /> <span className="text-gray-400 ml-1">Kz</span></Field>
                <Field label="Preço de Compra"><input type="number" value={form.purchase_price ?? ''} onChange={(e) => set({ purchase_price: e.target.value })} className={`${inp} w-40 text-right`} /> <span className="text-gray-400 ml-1">Kz</span></Field>
                <Field label="IVA %"><input type="number" value={form.tax_percentage ?? 0} onChange={(e) => set({ tax_percentage: e.target.value })} className={`${inp} w-24 text-right`} /></Field>
                <Field label="Custo médio atual"><span className="font-mono">{money(form.current_average_cost)} Kz</span> <span className="text-gray-400 ml-2">(calculado pelo motor de stock)</span></Field>
                {form.sale_price && form.current_average_cost != null && Number(form.current_average_cost) > 0 && (
                  <Field label="Margem"><span className="font-bold text-green-700">{((1 - Number(form.current_average_cost) / Number(form.sale_price)) * 100).toFixed(1)}%</span></Field>
                )}
              </>}
              {tab === 'Stock & Compras' && <>
                <Field label="Stock mínimo"><input type="number" value={form.min_stock ?? 0} onChange={(e) => set({ min_stock: e.target.value })} className={`${inp} w-32 text-right`} /> <span className="text-gray-400 ml-1">alerta de reposição</span></Field>
                <Field label="Stock máximo"><input type="number" value={form.max_stock ?? ''} onChange={(e) => set({ max_stock: e.target.value })} className={`${inp} w-32 text-right`} /></Field>
                <Field label="Vende-se"><input type="checkbox" checked={form.is_sold ?? true} onChange={(e) => set({ is_sold: e.target.checked })} /> <span className="text-gray-500 ml-1">disponível no POS/venda</span></Field>
                <Field label="Compra-se"><input type="checkbox" checked={form.is_purchased ?? true} onChange={(e) => set({ is_purchased: e.target.checked })} /> <span className="text-gray-500 ml-1">comprável a fornecedor</span></Field>
                <Field label="Fracionável"><input type="checkbox" checked={form.allow_fraction ?? false} onChange={(e) => set({ allow_fraction: e.target.checked })} /> <span className="text-gray-500 ml-1">permite quantidade decimal (ex.: peso)</span></Field>
              </>}
            </div>
          </div>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Código', accessor: 'code', width: '13%' },
    { header: 'Designação', accessor: 'name', width: '30%' },
    { header: 'Tipo', accessor: (r: MdItem) => typeLabel(r.item_type), width: '15%' },
    { header: 'Categoria', accessor: (r: MdItem) => r.category_name || '—', width: '13%' },
    { header: 'P. Venda', accessor: (r: MdItem) => money(r.sale_price), width: '11%' },
    { header: 'UN', accessor: (r: MdItem) => r.base_uom_code, width: '7%' },
    { header: 'Ativo', width: '6%',
      accessor: (r: MdItem) => <GridToggle endpoint="inventory/items" id={r.id} field="is_active"
        value={!!r.is_active} invalidate="masterdata"
        title="Desligar tira o artigo da venda no POS (o histórico mantém-se)" /> },
    { header: '', accessor: (r: MdItem) => <button onClick={(e) => { e.stopPropagation(); if (confirm(`Apagar o artigo ${r.name}?`)) delItem.mutate(r.id!); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
  ];

  return (
    <ClassicWindow title="Artigos (Master Data)" icon={<Package size={14} className="text-gray-300" />}
      footer={<><ClassicButton icon={Plus} label="Novo Artigo" onClick={openNew} /><div className="text-gray-600">Nº registos: {items.length}{isLoading ? ' (a carregar…)' : ''}</div></>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <div className="flex items-center border border-[#a0a0a0] bg-white px-1">
            <Search size={12} className="text-gray-500" />
            <input placeholder="Pesquisar código, designação ou código de barras…" value={search} onChange={(e) => setSearch(e.target.value)} className="p-1 focus:outline-none w-72" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid columns={columns} data={items} rowKey="id" onRowClick={(row) => openEdit(row)} />
        </div>
      </div>
    </ClassicWindow>
  );
}
