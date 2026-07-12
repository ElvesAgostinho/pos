import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { Toolbar, inputStyle, GridCheck } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

/**
 * PICKERS — as janelas de escolha múltipla ("Adicionar - Artigos",
 * "Adicionar - Sub Família").
 *
 * São multi-seleção de verdade: marcam-se dezenas de linhas, "Selecionar Tudo"
 * marca a lista FILTRADA (não a base toda — senão marcava-se sem querer o catálogo
 * inteiro), e só ao carregar em OK/Selecionar é que os escolhidos são devolvidos.
 */

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
      <span>{title}</span>
      <button onClick={onClose} className="w-5 h-5 bg-[#c0392b] text-white text-[12px] leading-none">✕</button>
    </div>
  );
}

// ----------------------------------------------------------------- Sub-Famílias
export function SubFamilyPicker({ exclude = [], onPick, onClose }:
  { exclude?: number[]; onPick: (rows: any[]) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number[]>([]);

  const { data: subs = [] } = useQuery({
    queryKey: ['posc', 'subs'],
    queryFn: async () => (await apiClient.get('inventory/pos/subfamilies/')).data,
  });

  const rows = useMemo(() => (subs as any[])
    .filter((s) => !exclude.includes(s.id))
    .filter((s) => !q || `${s.code} ${s.name}`.toLowerCase().includes(q.toLowerCase())),
    [subs, q, exclude]);

  const allOn = rows.length > 0 && rows.every((r) => sel.includes(r.id));
  const toggle = (id: number) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-[#f4f4f4] border border-[#888] w-[620px] max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <Head title="Adicionar - Sub Família" onClose={onClose} />

        <div className="flex items-center gap-3 px-3 py-2 bg-white border-b border-[#d0d0d0]">
          <span className="text-[12px] text-[#333]">Pesquisar:</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus className={`${inp} w-[240px]`} style={inputStyle} />
          <label className="flex items-center gap-2 text-[12px] ml-3">
            <input type="checkbox" checked={allOn}
              onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} className="w-4 h-4" />
            Selecionar Tudo
          </label>
        </div>

        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
              <th className="w-[42px] border-b border-[#d0d0d0]" />
              <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Descrição</th>
            </tr></thead>
            <tbody>
              {rows.map((s: any) => (
                <tr key={s.id} onClick={() => toggle(s.id)}
                  className={`border-b border-[#eee] cursor-pointer ${sel.includes(s.id) ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                  <td className="text-center py-1.5">
                    <input type="checkbox" checked={sel.includes(s.id)} onChange={() => toggle(s.id)}
                      onClick={(e) => e.stopPropagation()} className="w-4 h-4" />
                  </td>
                  <td className="px-2 py-1.5 text-[#1a4f8a]">{s.code} ({s.name})</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={2} className="text-center text-[#999] py-8">Sem sub-famílias.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="px-3 py-1 text-[11px] text-[#666] bg-[#f4f4f4] border-t border-[#e0e0e0]">
          {sel.length} selecionada(s) de {rows.length}
        </div>
        <Toolbar actions={[
          { icon: '✔', label: 'Selecionar', color: '#1f7a34',
            onClick: () => onPick(rows.filter((r) => sel.includes(r.id))) },
          { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
        ]} />
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- Artigos
export function ItemPicker({ exclude = [], onPick, onClose, title = 'Adicionar - Artigos', max = 1000 }:
  { exclude?: number[]; onPick: (rows: any[]) => void; onClose: () => void; title?: string; max?: number }) {
  const [f, setF] = useState<any>({ group: '', family: '', subfamily: '', item_type: '', module: '', state: '', q: '' });
  const [applied, setApplied] = useState<any>({});
  const [sel, setSel] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);

  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'groups'], queryFn: async () => (await apiClient.get('inventory/pos/groups/')).data });
  const { data: families = [] } = useQuery({
    queryKey: ['posc', 'families', f.group],
    queryFn: async () => (await apiClient.get('inventory/pos/families/', { params: { group: f.group || undefined } })).data,
  });
  const { data: subs = [] } = useQuery({
    queryKey: ['posc', 'subs', f.family, f.group],
    queryFn: async () => (await apiClient.get('inventory/pos/subfamilies/', { params: { family: f.family || undefined, group: f.group || undefined } })).data,
  });
  const { data: items = [] } = useQuery({
    queryKey: ['posc', 'pick-articles', applied],
    queryFn: async () => {
      const params: any = {};
      Object.entries(applied).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await apiClient.get('inventory/pos/articles/', { params });
      return r.data?.results || r.data || [];
    },
  });

  const qc = useQueryClient();
  // A caixa "Ativo" grava logo: um artigo inativo deixa de poder ser vendido (o
  // servidor recusa a linha), mas o histórico dele mantém-se intacto.
  const setActive = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) =>
      apiClient.patch(`inventory/pos/articles/${id}/`, { is_active: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posc'] }),
    onError: notifyError,
  });

  const rows: any[] = useMemo(() => (items as any[]).filter((i) => !exclude.includes(i.id)), [items, exclude]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const view = rows.slice((page - 1) * size, page * size);
  const allOn = rows.length > 0 && sel.length === rows.length;
  const over = sel.length > max;

  const toggle = (id: number) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const sl = 'border border-[#8a95a3] px-1 py-1 text-[12px] bg-white w-full';

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-[#f4f4f4] border border-[#888] w-[1180px] max-w-[97vw] h-[86vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <Head title={title} onClose={onClose} />

        {/* Filtros */}
        <div className="flex gap-4 p-3 bg-white border-b border-[#d0d0d0]">
          <div className="flex-1 grid grid-cols-[70px_1fr_70px_1fr] gap-x-3 gap-y-2 items-center text-[12px]">
            <span>Grupo:</span>
            <select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value, family: '', subfamily: '' })} className={sl} style={inputStyle}>
              <option value="">(Todos)</option>
              {(groups as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <span>Tipo:</span>
            <select value={f.item_type} onChange={(e) => setF({ ...f, item_type: e.target.value })} className={sl} style={inputStyle}>
              <option value="">Todos</option>
              <option value="SIMPLE">Simples</option>
              <option value="COMBO">Menu / Combo</option>
              <option value="SERVICE">Serviço</option>
            </select>

            <span>Família:</span>
            <select value={f.family} onChange={(e) => setF({ ...f, family: e.target.value, subfamily: '' })} className={sl} style={inputStyle}>
              <option value="">(Todos)</option>
              {(families as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <span>Estado:</span>
            <select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} className={sl} style={inputStyle}>
              <option value="">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Inativos</option>
            </select>

            <span>Sub Família:</span>
            <select value={f.subfamily} onChange={(e) => setF({ ...f, subfamily: e.target.value })} className={sl} style={inputStyle}>
              <option value="">(Todos)</option>
              {(subs as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <span className="whitespace-nowrap">Texto livre:</span>
            <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (setApplied({ ...f }), setPage(1))}
              className={sl} style={inputStyle} />
          </div>
          <button onClick={() => { setApplied({ ...f }); setPage(1); }}
            className="w-[150px] bg-[#3c3c3c] text-white flex flex-col items-center justify-center gap-1 hover:bg-[#2b2b2b]">
            <span className="text-[20px]">⟳</span>
            <span className="text-[13px]">Pesquisar</span>
          </button>
        </div>

        <div className={`px-3 py-1.5 text-[12px] font-bold ${over ? 'text-[#c0392b]' : 'text-[#333]'}`}>
          (Selecionado: {sel.length}) (Máximo: {max}){over && ' — reduza a seleção'}
        </div>

        {/* Grelha */}
        <div className="flex-1 overflow-auto bg-white border-y border-[#d0d0d0]">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
              <th className="w-[42px] border-b border-[#d0d0d0]" />
              {['Código', 'Descrição', 'Grupo', 'Família', 'Sub Família', 'Preço', 'Iva', 'Impressoras', 'Ativo'].map((h) => (
                <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {view.map((i: any) => (
                <tr key={i.id} onClick={() => toggle(i.id)}
                  className={`border-b border-[#eee] cursor-pointer ${sel.includes(i.id) ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                  <td className="text-center py-1.5">
                    <input type="checkbox" checked={sel.includes(i.id)} onChange={() => toggle(i.id)}
                      onClick={(e) => e.stopPropagation()} className="w-4 h-4" />
                  </td>
                  <td className="px-2 py-1.5 font-mono whitespace-nowrap">{i.code}</td>
                  <td className="px-2 py-1.5">{i.name}</td>
                  <td className="px-2 py-1.5">{i.group_name}</td>
                  <td className="px-2 py-1.5">{i.family_name}</td>
                  <td className="px-2 py-1.5">{i.subfamily_name}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">(1: {Number(i.sale_price || 0).toFixed(2)})</td>
                  <td className="px-2 py-1.5 text-[#1a4f8a] whitespace-nowrap italic">{Number(i.tax_percentage || 0).toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-[11px] text-[#666]">{i.printers_label}</td>
                  <td className="text-center">
                    <GridCheck checked={i.is_active} onChange={(v) => setActive.mutate({ id: i.id, v })}
                      title="Artigo ativo — desligar tira-o da venda no POS" />
                  </td>
                </tr>
              ))}
              {view.length === 0 && <tr><td colSpan={10} className="text-center text-[#999] py-10">Sem artigos. Ajuste os filtros e carregue em Pesquisar.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="flex items-center gap-3 px-3 py-2 bg-[#f4f4f4] text-[12px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allOn}
              onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} className="w-4 h-4" />
            Selecionar Tudo
          </label>
          <span className="ml-2">Nº registos a visualizar:</span>
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} className={`${inp} w-[80px]`} style={inputStyle}>
            {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-1 disabled:opacity-30">⏮</button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-1 disabled:opacity-30">◀</button>
          <span>Página</span>
          <input value={page} onChange={(e) => setPage(Math.min(pages, Math.max(1, Number(e.target.value) || 1)))}
            className={`${inp} w-[54px] text-center`} style={inputStyle} />
          <span>de {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-1 disabled:opacity-30">▶</button>
          <button onClick={() => setPage(pages)} disabled={page === pages} className="px-1 disabled:opacity-30">⏭</button>
          <span className="ml-auto text-[#555]">
            Nº registos a visualizar {rows.length ? (page - 1) * size + 1 : 0} - {Math.min(page * size, rows.length)} de {rows.length}
          </span>
        </div>

        <Toolbar actions={[
          { icon: '✔', label: 'OK', color: over ? '#999' : '#1f7a34',
            onClick: () => { if (!over) onPick(rows.filter((r) => sel.includes(r.id))); } },
          { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
        ]} />
      </div>
    </div>
  );
}
