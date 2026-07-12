import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import { Keyboard, Plus, Trash2, Save, Search, ArrowLeft, ArrowRight } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useOutlets } from '../../hooks/usePosMgmt';
import { notifyError, notifyGuide } from '../../utils/friendlyError';

const PALETTE = ['#1565c0', '#2e7d32', '#c9820a', '#a01818', '#6a1b9a', '#0e7490', '#b5651d', '#334155', '#7a1f3d', '#8a4b1a'];
const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

/**
 * Designer de Teclado do POS — desenha o teclado táctil: que artigos aparecem,
 * em que CATEGORIA (separador), com que COR, em que ORDEM e a que PREÇO.
 * É exatamente isto que o operador vê no terminal.
 */
export default function PosKeyboardDesigner() {
  const qc = useQueryClient();
  const { data: outlets = [] } = useOutlets();
  const [outlet, setOutlet] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState<number | null>(null);

  const { data: configs = [] } = useQuery({
    queryKey: ['pos', 'kbd', outlet],
    queryFn: async () => (await apiClient.get('pos/product-configs/', { params: { outlet } })).data,
    enabled: !!outlet,
  });
  const { data: items = [] } = useQuery({
    queryKey: ['pos', 'kbd-items', search],
    queryFn: async () => {
      const d = (await apiClient.get('inventory/items/', { params: { search: search || undefined } })).data;
      return d?.results || d || [];
    },
    enabled: !!outlet,
  });

  const rows: any[] = Array.isArray(configs) ? configs : (configs as any)?.results || [];
  const sel = rows.find((c) => c.id === selId) || null;
  const cats = Array.from(new Set(rows.map((c) => c.pos_category || 'GERAL')));

  const inval = () => qc.invalidateQueries({ queryKey: ['pos', 'kbd'] });
  const upd = useMutation({
    mutationFn: ({ id, data }: any) => apiClient.patch(`pos/product-configs/${id}/`, data),
    onSuccess: inval, onError: notifyError,
  });
  const add = useMutation({
    mutationFn: (item: any) => apiClient.post('pos/product-configs/', {
      outlet, item: item.id, pos_category: (item.category_name || 'GERAL').toUpperCase(),
      pos_price: item.sale_price || 0, button_color: PALETTE[rows.length % PALETTE.length],
      sort_order: rows.length, is_available: true,
    }),
    onSuccess: inval, onError: notifyError,
  });
  const del = useMutation({
    mutationFn: (id: number) => apiClient.delete(`pos/product-configs/${id}/`),
    onSuccess: () => { setSelId(null); inval(); }, onError: notifyError,
  });

  const move = (c: any, dir: number) => upd.mutate({ id: c.id, data: { sort_order: Math.max(0, (c.sort_order || 0) + dir) } });

  const addItem = (it: any) => {
    if (!outlet) { notifyGuide({ title: 'Escolha o outlet', message: 'Primeiro escolha o outlet (restaurante/bar) cujo teclado quer desenhar.', hint: 'Use a lista "Outlet" no topo.' }); return; }
    if (rows.some((c) => c.item === it.id)) { notifyGuide({ title: 'Já está no teclado', message: `"${it.name}" já tem um botão neste outlet.`, hint: 'Clique no botão existente para o editar.' }); return; }
    add.mutate(it);
  };

  return (
    <ClassicWindow title="Designer de Teclado do POS (Layouts)" icon={<Keyboard size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{rows.length} botão(ões) em {cats.length} categoria(s) — é isto que o operador vê no terminal</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Outlet:</label>
          <select value={outlet || ''} onChange={(e) => { setOutlet(Number(e.target.value) || undefined); setSelId(null); }} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— escolher —</option>
            {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <span className="text-gray-500 ml-auto">Clique num botão para editar cor, categoria, preço e ordem</span>
        </div>

        {!outlet ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Escolha um outlet para desenhar o seu teclado.</div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Artigos disponíveis */}
            <div className="w-56 flex-shrink-0 border-r border-[#a0a0a0] flex flex-col bg-[#fafafa]">
              <div className="flex items-center gap-1 p-2 border-b border-[#e0e0e0] text-[11px]">
                <Search size={12} className="text-gray-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Artigo…" className="border border-[#a0a0a0] p-1 flex-1 bg-white" />
              </div>
              <div className="flex-1 overflow-auto p-1.5 space-y-1">
                {items.slice(0, 40).map((it: any) => (
                  <button key={it.id} onClick={() => addItem(it)}
                    className="w-full flex items-center justify-between gap-1 px-2 py-1.5 bg-white border border-[#d0d0d0] hover:bg-[#e6f3ff] text-[11px] text-left">
                    <span className="truncate">{it.name}</span><Plus size={12} className="text-[#1e3f66] flex-shrink-0" />
                  </button>
                ))}
                {items.length === 0 && <div className="text-[11px] text-gray-400 text-center py-3">Sem artigos.</div>}
              </div>
            </div>

            {/* Pré-visualização do TECLADO (como no terminal) */}
            <div className="flex-1 overflow-auto p-3" style={{ background: 'radial-gradient(120% 120% at 0% 0%, #101a28 0%, #0b111b 60%)' }}>
              {cats.map((cat) => (
                <div key={cat} className="mb-4">
                  <div className="text-white/70 text-[11px] font-bold uppercase mb-1.5 tracking-wide">{cat}</div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                    {rows.filter((c) => (c.pos_category || 'GERAL') === cat).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((c) => (
                      <button key={c.id} onClick={() => setSelId(c.id)}
                        className="h-20 rounded-xl flex flex-col items-center justify-center text-white p-1 text-center"
                        style={{
                          background: c.button_color || '#334155',
                          opacity: c.is_available ? 1 : 0.35,
                          border: c.id === selId ? '3px solid #c9a400' : '1px solid rgba(0,0,0,0.35)',
                          boxShadow: c.id === selId ? '0 0 0 3px rgba(201,164,0,0.35)' : 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 5px rgba(0,0,0,0.4)',
                        }}>
                        <span className="text-[12px] font-bold leading-tight line-clamp-2">{c.item_name}</span>
                        <span className="text-[11px] opacity-90 mt-0.5">{money(c.pos_price)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {rows.length === 0 && <div className="text-white/40 text-sm text-center py-12">Teclado vazio — junte artigos pela lista à esquerda.</div>}
            </div>

            {/* Propriedades do botão */}
            {sel && (
              <div className="w-64 flex-shrink-0 border-l border-[#a0a0a0] bg-[#f7f8fa] flex flex-col text-[11px]">
                <div className="px-3 py-2 bg-[#1e3f66] text-white font-bold flex items-center justify-between">
                  <span className="truncate">{sel.item_name}</span>
                  <button onClick={() => setSelId(null)} className="text-[14px] leading-none hover:text-[#ffd1d1]">×</button>
                </div>
                <div className="p-3 space-y-3 flex-1 overflow-auto">
                  <div>
                    <span className="text-gray-600 block mb-1">Categoria (separador no POS)</span>
                    <input defaultValue={sel.pos_category || 'GERAL'} onBlur={(e) => upd.mutate({ id: sel.id, data: { pos_category: e.target.value.toUpperCase() } })}
                      className="border border-[#a0a0a0] p-1 w-full bg-white" />
                  </div>
                  <div>
                    <span className="text-gray-600 block mb-1">Preço no POS</span>
                    <input type="number" defaultValue={sel.pos_price ?? ''} onBlur={(e) => upd.mutate({ id: sel.id, data: { pos_price: Number(e.target.value) || 0 } })}
                      className="border border-[#a0a0a0] p-1 w-full bg-white" />
                  </div>
                  <div>
                    <span className="text-gray-600 block mb-1">Cor do botão</span>
                    <div className="grid grid-cols-5 gap-1">
                      {PALETTE.map((c) => (
                        <button key={c} onClick={() => upd.mutate({ id: sel.id, data: { button_color: c } })}
                          className="h-7 rounded" style={{ background: c, border: sel.button_color === c ? '2px solid #111' : '1px solid #bbb' }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600 block mb-1">Ordem no teclado</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => move(sel, -1)} className="px-2 py-1 border border-[#a0a0a0] bg-white"><ArrowLeft size={12} /></button>
                      <span className="px-2 font-bold">{sel.sort_order ?? 0}</span>
                      <button onClick={() => move(sel, 1)} className="px-2 py-1 border border-[#a0a0a0] bg-white"><ArrowRight size={12} /></button>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600 block mb-1">Área de produção (para onde vai o pedido)</span>
                    <select value={sel.kds_station || 'KITCHEN'} onChange={(e) => upd.mutate({ id: sel.id, data: { kds_station: e.target.value } })}
                      className="border border-[#a0a0a0] p-1 w-full bg-white">
                      <option value="KITCHEN">Cozinha</option>
                      <option value="BAR">Bar</option>
                      <option value="PASTRY">Padaria / Pastelaria</option>
                      <option value="NONE">Sem produção (venda direta)</option>
                    </select>
                    <span className="text-[10px] text-gray-500">O pedido aparece no ecrã dessa área e o POS avisa quando ficar pronto.</span>
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={!!sel.is_available} onChange={(e) => upd.mutate({ id: sel.id, data: { is_available: e.target.checked } })} />
                    Disponível (visível no terminal)
                  </label>
                  <div className="pt-2 border-t border-[#e0e0e0] flex gap-2">
                    <ClassicButton icon={Save} label="Gravado auto." onClick={() => qc.invalidateQueries({ queryKey: ['pos', 'kbd'] })} />
                    <button onClick={() => confirm(`Remover "${sel.item_name}" do teclado?`) && del.mutate(sel.id)}
                      className="px-2 text-red-600 hover:text-red-800"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}
