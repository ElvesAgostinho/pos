import { useState } from 'react';
import { Toolbar, money } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar } from '../../ui/dialogo';
import { useMdItems, useMdCreateItem, useMdUpdateItem, useMdDeleteItem, useMdUoms } from '../../hooks/useMasterData';
import type { MdItem } from '../../api/masterdata';

/** Produtos & Serviços do hotel — minibar, spa, lavandaria, late check-out…
    qualquer extra que se lança na conta do hóspede (folio). É o MESMO cadastro
    do POS (inventory.Item, `masterdata`), só filtrado ao tipo "Serviço" e com
    um formulário muito mais simples do que o Artigo completo do POS (sem KDS,
    código de barras, ficha técnica, descontos — isso é venda em sala, não um
    extra de hotel). O ecrã completo de Artigos continua a existir para quem
    precisar dele — não se cria nenhum modelo novo. */

const genCode = () => `SRV${Date.now().toString(36).toUpperCase()}`;
const blank = { name: '', sale_price: '', tax_percentage: 14, is_sold: true, track_stock: false };

export default function PmsProductsServicesView() {
  const { data: items = [] } = useMdItems({ item_type: 'Service' });
  const { data: uoms = [] } = useMdUoms();
  const createItem = useMdCreateItem();
  const updateItem = useMdUpdateItem();
  const delItem = useMdDeleteItem();

  const rows = (items as MdItem[]).filter((i) => i.item_type === 'Service');

  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);

  const select = (r: MdItem) => { setSelId(r.id!); setForm({ ...r, track_stock: !(r as any).no_stock_movement }); };
  const novo = () => { setSelId(null); setForm(blank); };

  const save = async () => {
    if (!form.name?.trim()) { aviso('O nome é obrigatório.'); return; }
    const payload: any = {
      name: form.name.trim(),
      item_type: 'Service',
      sale_price: form.sale_price === '' ? null : form.sale_price,
      tax_percentage: form.tax_percentage ?? 0,
      is_sold: !!form.is_sold,
      no_stock_movement: !form.track_stock,
    };
    try {
      if (selId) {
        await updateItem.mutateAsync({ id: selId, data: payload });
      } else {
        if (!uoms.length) { aviso('Ainda não há nenhuma Unidade de Stock configurada (Configuração POS → Unidades de Stock) — crie uma primeiro.'); return; }
        await createItem.mutateAsync({ ...payload, code: genCode(), base_uom: (uoms[0] as any).id });
      }
      novo();
    } catch (e) { notifyError(e); }
  };

  const remove = async () => {
    if (!selId) return;
    if (!(await confirmar(`Eliminar "${form.name}"?`))) return;
    try { await delItem.mutateAsync(selId); novo(); } catch (e) { notifyError(e); }
  };

  const inp = 'border border-[#7FA9B1] p-1';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[#7FA9B1]">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={select} columns={[
            { header: 'Nome', accessor: 'name', width: '40%' },
            { header: 'Preço', accessor: (r: MdItem) => `${money(r.sale_price)} Kz`, width: '20%' },
            { header: 'IVA %', accessor: 'tax_percentage', width: '15%' },
            { header: 'Stock', accessor: (r: any) => (r.no_stock_movement ? 'Não' : 'Sim'), width: '12%' },
            { header: 'À venda', accessor: (r: MdItem) => (r.is_sold ? 'Sim' : 'Não'), width: '13%' },
          ]} />
        </div>
        <div className="w-1/2 p-3 space-y-2 text-[11px] overflow-auto">
          <div className="font-bold text-[#062A31]">{selId ? 'Editar Produto/Serviço' : 'Novo Produto/Serviço'}</div>
          <label className="flex flex-col">Nome<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Preço de venda (Kz)
              <input type="number" min="0" step="0.01" value={form.sale_price ?? ''} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} className={inp} />
            </label>
            <label className="flex-1 flex flex-col">IVA %
              <input type="number" min="0" step="0.01" value={form.tax_percentage ?? 0} onChange={(e) => setForm({ ...form, tax_percentage: e.target.value })} className={inp} />
            </label>
          </div>
          <label className="flex items-center gap-2 py-1 cursor-pointer">
            <input type="checkbox" checked={!!form.is_sold} onChange={(e) => setForm({ ...form, is_sold: e.target.checked })} className="w-4 h-4" />
            Disponível para venda / lançamento na conta
          </label>
          <label className="flex items-center gap-2 py-1 cursor-pointer">
            <input type="checkbox" checked={!!form.track_stock} onChange={(e) => setForm({ ...form, track_stock: e.target.checked })} className="w-4 h-4" />
            Controlar stock (desligado = típico num serviço, ex.: massagem, late check-out)
          </label>
        </div>
      </div>
      <Toolbar actions={[
        { label: 'Novo', icon: '＋', color: '#062A31', onClick: novo },
        { label: 'Gravar', icon: '💾', color: '#062A31', onClick: save },
        { label: 'Eliminar', icon: '✕', onClick: remove, disabled: !selId, color: '#B0392B' },
      ]} />
    </div>
  );
}
