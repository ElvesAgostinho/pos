import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { useFnbMenus, useFnbMenuItems } from '../../../hooks/useFnb';

const MENU_TYPES: Record<string, string> = {
  ALACARTE: 'À la carte', BUFFET: 'Buffet', BANQUET: 'Banquete', DRINKS: 'Carta de Bebidas',
  ROOMSERVICE: 'Room Service', KIDS: 'Menu Infantil', SEASONAL: 'Sazonal / Especial',
};
const OUTLET_TYPES: Record<string, string> = {
  RESTAURANT: 'Restaurante', BAR: 'Bar', POOL_BAR: 'Pool Bar / Rooftop', COFFEE: 'Coffee Shop',
  ROOM_SERVICE: 'Room Service', BANQUET: 'Buffet / Banquete',
};
const AOA = (n: any) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kz';

export default function FnbMenusView() {
  const { query, create, remove } = useFnbMenus();
  const menus = query.data ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const items = useFnbMenuItems(selected ?? undefined);
  const lines = items.query.data ?? [];

  const [m, setM] = useState<any>({ name: '', menu_type: 'ALACARTE', outlet_type: '' });
  const [li, setLi] = useState<any>({ section: '', name: '', price: '' });

  const addMenu = () => {
    if (!m.name) return;
    create.mutate({ ...m, outlet_type: m.outlet_type || null }, { onSuccess: () => setM({ name: '', menu_type: 'ALACARTE', outlet_type: '' }) });
  };
  const addLine = () => {
    if (!li.name || !selected) return;
    items.create.mutate({ ...li, menu: selected, price: li.price || 0 } as any, { onSuccess: () => setLi({ section: '', name: '', price: '' }) });
  };

  return (
    <ClassicWindow
      title="Menu Management — Cartas & Fichas de Menu"
      icon={<BookOpen size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Cartas: {menus.length}</div>}
    >
      <div className="flex h-full">
        {/* Cartas */}
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <input placeholder="Nome da carta" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
            <select value={m.menu_type} onChange={(e) => setM({ ...m, menu_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              {Object.entries(MENU_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={m.outlet_type} onChange={(e) => setM({ ...m, outlet_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              <option value="">— Outlet —</option>
              {Object.entries(OUTLET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ClassicButton icon={Plus} label="Criar Carta" onClick={addMenu} />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid
              rowKey="id" data={menus} selectedRowId={selected ?? undefined}
              onRowClick={(r: any) => setSelected(r.id)}
              columns={[
                { header: 'Carta', accessor: 'name', width: '40%' },
                { header: 'Tipo', accessor: (r: any) => MENU_TYPES[r.menu_type] || r.menu_type, width: '25%' },
                { header: 'Itens', accessor: 'item_count', width: '15%' },
                { header: '', accessor: (r: any) => <button onClick={(e) => { e.stopPropagation(); if (confirm(`Apagar a carta ${r.name}?`)) remove.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
              ]}
            />
          </div>
        </div>

        {/* Itens da carta */}
        <div className="w-1/2 flex flex-col">
          {selected ? (
            <>
              <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
                <input placeholder="Secção (Entradas…)" value={li.section} onChange={(e) => setLi({ ...li, section: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
                <input placeholder="Prato" value={li.name} onChange={(e) => setLi({ ...li, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
                <input type="number" placeholder="Preço" value={li.price} onChange={(e) => setLi({ ...li, price: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
                <ClassicButton icon={Plus} label="Adicionar" onClick={addLine} />
              </div>
              <div className="flex-1 overflow-hidden">
                <ClassicGrid
                  rowKey="id" data={lines}
                  columns={[
                    { header: 'Secção', accessor: 'section', width: '22%' },
                    { header: 'Prato', accessor: 'name', width: '34%' },
                    { header: 'Preço', accessor: (r: any) => AOA(r.price), width: '18%' },
                    { header: 'Margem', accessor: (r: any) => r.margin != null ? `${r.margin}%` : '—', width: '16%' },
                    { header: '', accessor: (r: any) => <button onClick={() => items.remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
                  ]}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Selecione uma carta para gerir os pratos.</div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
