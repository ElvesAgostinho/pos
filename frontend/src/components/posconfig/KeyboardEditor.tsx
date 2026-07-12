import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
let SEQ = 1;
const uid = () => `t${SEQ++}`;

/**
 * DESIGNER DE TECLADO — é isto que o operador vai ver e tocar no terminal.
 *
 * Estrutura: PÁGINAS (a fila de cima: COMIDAS, BEBIDAS, CAFETARIA) → TECLAS.
 * Uma tecla é uma PASTA (abre outro nível: SNACKS, PETISCOS…) ou um ARTIGO (vende).
 *
 * O teclado grava-se INTEIRO de uma vez: é uma árvore, e gravar tecla a tecla
 * deixaria pais sem filhos se um pedido falhasse a meio.
 */
export default function KeyboardEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [kb, setKb] = useState<any>({ number: 1, name: '', price_level: 1, cols: 4, rows: 4, show_codes: false, show_prices: false, ...row });
  const [keys, setKeys] = useState<any[]>([]);
  const [page, setPage] = useState<string | null>(null);      // página selecionada
  const [folder, setFolder] = useState<string | null>(null);  // pasta aberta dentro da página
  const [sel, setSel] = useState<string | null>(null);        // tecla selecionada
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');

  const { data: full } = useQuery({
    queryKey: ['posc', 'kb', row?.id],
    queryFn: async () => (await apiClient.get(`pos/config/keyboards/${row.id}/`)).data,
    enabled: !!row?.id,
  });
  useEffect(() => {
    if (!full) return;
    setKb(full);
    const ks = (full.keys || []).map((k: any) => ({ ...k, tmp_id: `k${k.id}`, parent: k.parent ? `k${k.parent}` : null }));
    setKeys(ks);
    const first = ks.find((k: any) => !k.parent);
    setPage(first?.tmp_id ?? null);
  }, [full]);

  const { data: articles = [] } = useQuery({
    queryKey: ['posc', 'kb-items', q],
    queryFn: async () => {
      const r = await apiClient.get('inventory/pos/articles/', { params: { q: q || undefined } });
      return (r.data?.results || r.data || []).slice(0, 60);
    },
    enabled: picker,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = { number: kb.number, name: kb.name, price_level: kb.price_level, cols: kb.cols, rows: kb.rows, show_codes: kb.show_codes, show_prices: kb.show_prices };
      const r = isNew ? await apiClient.post('pos/config/keyboards/', body)
                      : await apiClient.patch(`pos/config/keyboards/${row.id}/`, body);
      await apiClient.post(`pos/config/keyboards/${r.data.id}/save_keys/`, { keys });
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({ title: 'Teclado gravado', message: 'É este desenho que os terminais deste setor passam a mostrar.' });
      onClose();
    },
    onError: notifyError,
  });

  // --- manipulação das teclas ---
  const level = folder || page;                                  // nível visível
  const pages = keys.filter((k) => !k.parent);
  const visible = keys.filter((k) => k.parent === level).sort((a, b) => a.sort_order - b.sort_order);
  const S = keys.find((k) => k.tmp_id === sel);

  const upd = (id: string, patch: any) => setKeys((ks) => ks.map((k) => k.tmp_id === id ? { ...k, ...patch } : k));
  const addPage = () => {
    const t = uid();
    setKeys([...keys, { tmp_id: t, parent: null, kind: 'PAGE', label: 'NOVA PÁGINA', color: '#7a4b1a', text_color: '#ffffff', sort_order: pages.length, span: 1 }]);
    setPage(t); setFolder(null); setSel(t);
  };
  const addFolder = () => {
    if (!level) return;
    const t = uid();
    setKeys([...keys, { tmp_id: t, parent: level, kind: 'FOLDER', label: 'NOVA PASTA', color: '#1565c0', text_color: '#ffffff', sort_order: visible.length, span: 1 }]);
    setSel(t);
  };
  const addItems = (items: any[]) => {
    if (!level) return;
    const base = visible.length;
    setKeys([...keys, ...items.map((it, i) => ({
      tmp_id: uid(), parent: level, kind: 'ITEM', label: it.name, item: it.id,
      item_name: it.name, item_code: it.code, item_price: it.prices?.[0]?.price ?? it.sale_price,
      color: '#2e7d32', text_color: '#ffffff', sort_order: base + i, span: 1,
    }))]);
    setPicker(false);
  };
  const removeKey = () => {
    if (!sel) return;
    // Remover uma pasta remove o que está dentro dela — senão ficavam teclas órfãs.
    const kill = new Set([sel]);
    let grew = true;
    while (grew) {
      grew = false;
      keys.forEach((k) => { if (k.parent && kill.has(k.parent) && !kill.has(k.tmp_id)) { kill.add(k.tmp_id); grew = true; } });
    }
    setKeys(keys.filter((k) => !kill.has(k.tmp_id)));
    if (kill.has(page!)) setPage(null);
    if (kill.has(folder!)) setFolder(null);
    setSel(null);
  };
  const rename = () => {
    if (!sel) return;
    const v = prompt('Nome da tecla:', S?.label);
    if (v) upd(sel, { label: v });
  };
  const sortKeys = () => {
    const sorted = [...visible].sort((a, b) => a.label.localeCompare(b.label));
    setKeys(keys.map((k) => {
      const i = sorted.findIndex((s) => s.tmp_id === k.tmp_id);
      return i >= 0 ? { ...k, sort_order: i } : k;
    }));
  };
  const move = (dir: -1 | 1) => {
    if (!sel) return;
    const i = visible.findIndex((k) => k.tmp_id === sel);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return;
    const a = visible[i], b = visible[j];
    setKeys(keys.map((k) => k.tmp_id === a.tmp_id ? { ...k, sort_order: b.sort_order }
      : k.tmp_id === b.tmp_id ? { ...k, sort_order: a.sort_order } : k));
  };

  const Side = ({ onClick, color, children, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}
      className="w-full flex items-center gap-2 px-2 py-1.5 bg-[#3c3c3c] text-white text-[12px] hover:bg-[#4c4c4c] disabled:opacity-35">
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]" style={{ background: color }}>●</span>
      {children}
    </button>
  );

  const Key = ({ k, onOpen }: any) => (
    <button onClick={() => { setSel(k.tmp_id); onOpen?.(); }}
      className="h-[90px] flex flex-col items-center justify-center px-2 text-center font-bold text-[13px] leading-tight"
      style={{
        background: k.color, color: k.text_color,
        gridColumn: `span ${k.span || 1}`,
        outline: sel === k.tmp_id ? '3px solid #f0a500' : 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 3px rgba(0,0,0,0.3)',
      }}>
      <span>{k.label}</span>
      {kb.show_codes && k.item_code && <span className="text-[10px] font-normal opacity-80">{k.item_code}</span>}
      {kb.show_prices && k.item_price != null && <span className="text-[11px] font-normal opacity-90">{money(k.item_price)}</span>}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo teclado' : `A editar ${kb.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex items-center gap-6 px-4 py-2 border-b border-[#e0e0e0] text-[13px]">
        <label className="flex items-center gap-3">
          <span className="w-[70px] text-[#333]">Número:</span>
          <input type="number" value={kb.number ?? 1} onChange={(e) => setKb({ ...kb, number: Number(e.target.value) })} className={`${inp} w-[110px]`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-3 flex-1">
          <span className="w-[75px] text-[#333]">Descrição:</span>
          <input value={kb.name || ''} onChange={(e) => setKb({ ...kb, name: e.target.value })} className={`${inp} flex-1`} style={inputStyle} />
        </label>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Ferramentas */}
        <div className="w-[270px] flex-shrink-0 border-r border-[#c0c0c0] overflow-auto p-3 space-y-2 text-[12px]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!kb.show_codes} onChange={(e) => setKb({ ...kb, show_codes: e.target.checked })} className="w-4 h-4" />Visualizar Códigos</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!kb.show_prices} onChange={(e) => setKb({ ...kb, show_prices: e.target.checked })} className="w-4 h-4" />Visualizar Preços</label>

          <div className="space-y-1 pt-1">
            <Side onClick={addPage} color="#2b8fd6">Adicionar Página</Side>
            <Side onClick={addFolder} color="#2b8fd6" disabled={!level}>Adicionar Pasta</Side>
            <Side onClick={() => setPicker(true)} color="#2b8fd6" disabled={!level}>Adicionar Artigos</Side>
            <Side onClick={removeKey} color="#c0392b" disabled={!sel}>Remover Tecla</Side>
            <Side onClick={rename} color="#29b6f6" disabled={!sel}>Renomear tecla</Side>
            <Side onClick={sortKeys} color="#c9a400" disabled={!level}>Ordenar Teclas</Side>
            <div className="flex gap-1">
              <button onClick={() => move(-1)} disabled={!sel} className="flex-1 py-1.5 bg-[#3c3c3c] text-white disabled:opacity-35">◀ Recuar</button>
              <button onClick={() => move(1)} disabled={!sel} className="flex-1 py-1.5 bg-[#3c3c3c] text-white disabled:opacity-35">Avançar ▶</button>
            </div>
          </div>

          <div className="pt-2 border-t border-[#e0e0e0] space-y-1.5">
            <label className="flex items-center gap-2"><span className="w-[80px]">Tipo Preço:</span>
              <input type="number" min={1} max={6} value={kb.price_level ?? 1} onChange={(e) => setKb({ ...kb, price_level: Number(e.target.value) })} className={`${inp} w-[70px]`} /></label>
            <label className="flex items-center gap-2"><span className="w-[80px]">Cor de Fundo:</span>
              <input type="color" value={S?.color || '#1565c0'} disabled={!sel} onChange={(e) => upd(sel!, { color: e.target.value })} className="w-9 h-7 border border-[#8a95a3] disabled:opacity-40" />
              <input value={S?.color || ''} disabled={!sel} onChange={(e) => upd(sel!, { color: e.target.value })} className={`${inp} flex-1 min-w-0 disabled:bg-[#f2f2f2]`} /></label>
            <label className="flex items-center gap-2"><span className="w-[80px]">Cor do texto:</span>
              <input type="color" value={S?.text_color || '#ffffff'} disabled={!sel} onChange={(e) => upd(sel!, { text_color: e.target.value })} className="w-9 h-7 border border-[#8a95a3] disabled:opacity-40" />
              <input value={S?.text_color || ''} disabled={!sel} onChange={(e) => upd(sel!, { text_color: e.target.value })} className={`${inp} flex-1 min-w-0 disabled:bg-[#f2f2f2]`} /></label>
            <label className="flex items-center gap-2"><span className="w-[80px]">Horizontal:</span>
              <input type="number" min={1} max={8} value={kb.cols ?? 4} onChange={(e) => setKb({ ...kb, cols: Number(e.target.value) })} className={`${inp} w-[70px]`} /></label>
            <label className="flex items-center gap-2"><span className="w-[80px]">Vertical:</span>
              <input type="number" min={1} max={8} value={kb.rows ?? 4} onChange={(e) => setKb({ ...kb, rows: Number(e.target.value) })} className={`${inp} w-[70px]`} /></label>
            <label className="flex items-center gap-2"><span className="w-[80px]">Largura:</span>
              <input type="number" min={1} max={4} value={S?.span || 1} disabled={!sel} onChange={(e) => upd(sel!, { span: Number(e.target.value) })} className={`${inp} w-[70px] disabled:bg-[#f2f2f2]`} />
              <span className="text-[10px] text-[#888]">colunas</span></label>
          </div>
        </div>

        {/* Pré-visualização (é isto que o operador vê) */}
        <div className="flex-1 overflow-auto p-3">
          {/* Páginas */}
          <div className="flex gap-2 pb-3 border-b border-[#e0e0e0] overflow-x-auto">
            {pages.map((p) => (
              <button key={p.tmp_id} onClick={() => { setPage(p.tmp_id); setFolder(null); setSel(p.tmp_id); }}
                className="min-w-[150px] h-[80px] px-3 font-bold text-[13px]"
                style={{
                  background: p.color, color: p.text_color,
                  outline: page === p.tmp_id ? '3px solid #f0a500' : 'none',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 3px rgba(0,0,0,0.3)',
                }}>{p.label}</button>
            ))}
            {pages.length === 0 && <span className="text-[12px] text-[#999] py-6">Sem páginas — carregue em "Adicionar Página".</span>}
          </div>

          {/* Migalhas (quando se entra numa pasta) */}
          {folder && (
            <div className="flex items-center gap-2 py-2 text-[12px]">
              <button onClick={() => setFolder(null)} className="text-[#1565c0] font-bold hover:underline">
                ◀ {keys.find((k) => k.tmp_id === page)?.label}
              </button>
              <span className="text-[#999]">/</span>
              <span className="font-bold">{keys.find((k) => k.tmp_id === folder)?.label}</span>
            </div>
          )}

          {/* Teclas */}
          <div className="grid gap-2 pt-3" style={{ gridTemplateColumns: `repeat(${kb.cols || 4}, minmax(0, 1fr))` }}>
            {visible.map((k) => (
              <Key key={k.tmp_id} k={k} onOpen={() => k.kind === 'FOLDER' && setFolder(k.tmp_id)} />
            ))}
          </div>
          {level && visible.length === 0 && (
            <div className="text-center text-[#999] text-[12px] py-10">
              Nível vazio — acrescente pastas ou artigos.
            </div>
          )}
        </div>
      </div>

      {/* Escolher artigos */}
      {picker && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[70]" onClick={() => setPicker(false)}>
          <div className="bg-white border border-[#888] w-[720px] max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
              <span>Adicionar Artigos</span>
              <button onClick={() => setPicker(false)}>✕</button>
            </div>
            <div className="p-2 border-b border-[#e0e0e0]">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar artigo…"
                className={`${inp} w-full`} style={inputStyle} autoFocus />
            </div>
            <div className="flex-1 overflow-auto">
              {articles.map((a: any) => (
                <button key={a.id} onClick={() => addItems([a])}
                  className="w-full flex items-center justify-between px-3 py-2 text-[12px] border-b border-[#eee] hover:bg-[#e6f0fa] text-left">
                  <span><b>{a.code}</b> · {a.name}</span>
                  <span className="text-[#666]">{money(a.prices?.[0]?.price ?? a.sale_price)}</span>
                </button>
              ))}
              {articles.length === 0 && <div className="text-center text-[#999] py-8 text-[12px]">Sem artigos.</div>}
            </div>
            <div className="p-2 border-t border-[#e0e0e0] flex justify-end">
              <button onClick={() => addItems(articles)} className="px-3 py-1.5 bg-[#2b2b2b] text-white text-[12px] font-bold">
                Adicionar todos os {articles.length}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
