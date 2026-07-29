import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { money, Glyph } from './kit';

const TIPOS = [
  { v: '', l: '(Todos)' },
  { v: 'RawMaterial', l: 'Matéria-Prima' },
  { v: 'Manufactured', l: 'Produto Produzido' },
  { v: 'Retail', l: 'Produto de Revenda' },
  { v: 'Service', l: 'Serviço' },
];

/** "Componentes" — o mesmo motor de pesquisa dos Artigos (inventory/pos/articles/),
    para escolher o que entra na ficha técnica de outro artigo. Nada de inventar uma
    segunda lista: é a mesma tabela, com filtros e paginação reais. */
export default function ComponentsPicker({ onClose, onPick }: {
  onClose: () => void; onPick: (item: any) => void;
}) {
  const [grupo, setGrupo] = useState('');
  const [familia, setFamilia] = useState('');
  const [subfamilia, setSubfamilia] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const [qAplicado, setQAplicado] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<any | null>(null);
  const pageSize = 25;

  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'groups'], queryFn: async () => (await apiClient.get('inventory/pos/groups/')).data });
  const { data: families = [] } = useQuery({ queryKey: ['posc', 'families'], queryFn: async () => (await apiClient.get('inventory/pos/families/')).data });
  const { data: subfamilies = [] } = useQuery({ queryKey: ['posc', 'subs'], queryFn: async () => (await apiClient.get('inventory/pos/subfamilies/')).data });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['posc', 'components-picker', grupo, familia, subfamilia, tipo, estado, qAplicado, page],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize };
      if (grupo) params.group = grupo;
      if (familia) params.family = familia;
      if (subfamilia) params.subfamily = subfamilia;
      if (tipo) params.item_type = tipo;
      if (estado) params.state = estado;
      if (qAplicado) params.q = qAplicado;
      const r = await apiClient.get('inventory/pos/articles/', { params });
      // paginação opcional: sem ?page devolvia array; com ?page devolve {results,count}
      if (Array.isArray(r.data)) return { results: r.data, count: r.data.length };
      return r.data;
    },
  });

  const linhas = data?.results || [];
  const total = data?.count ?? linhas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  const pesquisar = () => { setPage(1); setQAplicado(q); refetch(); };

  const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] w-full';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-[1100px] max-w-[95vw] h-[720px] max-h-[92vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 bg-[#2b2b2b] text-white">
          <span className="text-[14px] font-bold">Componentes</span>
          <button onClick={onClose} className="text-white/80 hover:text-white"><Glyph icon="✕" size={16} /></button>
        </div>

        <div className="p-3 border-b border-[#ddd] grid grid-cols-4 gap-2 items-end">
          <label className="text-[11px] text-[#555] flex flex-col gap-0.5">Grupo:
            <select value={grupo} onChange={(e) => { setGrupo(e.target.value); setFamilia(''); setSubfamilia(''); }} className={inp}>
              <option value="">(Todos)</option>
              {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-[#555] flex flex-col gap-0.5">Família:
            <select value={familia} onChange={(e) => { setFamilia(e.target.value); setSubfamilia(''); }} className={inp}>
              <option value="">(Todas)</option>
              {families.filter((f: any) => !grupo || f.group === Number(grupo)).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-[#555] flex flex-col gap-0.5">Sub Família:
            <select value={subfamilia} onChange={(e) => setSubfamilia(e.target.value)} className={inp}>
              <option value="">(Todas)</option>
              {subfamilies.filter((s: any) => !familia || s.family === Number(familia)).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-[#555] flex flex-col gap-0.5">Tipo:
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inp}>
              {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-[#555] flex flex-col gap-0.5">Estado:
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inp}>
              <option value="">(Todos)</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </label>
          <label className="text-[11px] text-[#555] flex flex-col gap-0.5 col-span-2">Pesquisa por texto livre:
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
              placeholder="Código, nome, código de barras…" className={inp} />
          </label>
          <button onClick={pesquisar}
            className="h-[30px] px-4 text-[12px] font-bold text-white bg-[#2b2b2b] hover:bg-[#3c3c3c]">
            {isFetching ? 'A procurar…' : 'Pesquisar'}
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-[#eee]">
              <tr>
                <th className="w-[28px] border border-[#ddd]"></th>
                {['Código', 'Descrição', 'Grupo', 'Família', 'Sub Família', 'Preço', 'Ativo'].map((h) => (
                  <th key={h} className="text-left px-2 py-1 border border-[#ddd] font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((it: any) => (
                <tr key={it.id} onClick={() => setSel(it)} onDoubleClick={() => onPick(it)}
                  className={`cursor-pointer ${sel?.id === it.id ? 'bg-[#cfe8ff]' : 'hover:bg-[#f5f5f5]'}`}>
                  <td className="text-center border border-[#eee]">
                    <input type="radio" checked={sel?.id === it.id} onChange={() => setSel(it)} />
                  </td>
                  <td className="px-2 py-1 border border-[#eee]">{it.code}</td>
                  <td className="px-2 py-1 border border-[#eee]">{it.name}</td>
                  <td className="px-2 py-1 border border-[#eee]">{it.group_name || '—'}</td>
                  <td className="px-2 py-1 border border-[#eee]">{it.family_name || '—'}</td>
                  <td className="px-2 py-1 border border-[#eee]">{it.subfamily_name || '—'}</td>
                  <td className="px-2 py-1 border border-[#eee] text-right">{money(it.sale_price)}</td>
                  <td className="px-2 py-1 border border-[#eee] text-center">{it.is_active ? <Glyph icon="✔" size={13} /> : '—'}</td>
                </tr>
              ))}
              {!isFetching && linhas.length === 0 && (
                <tr><td colSpan={8} className="text-center text-[#999] py-8">Sem artigos com estes filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t border-[#ddd] bg-[#f7f7f7] text-[12px]">
          <span>
            {total > 0
              ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} de ${total} · Página ${page} de ${totalPaginas}`
              : '0 registos'}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={page <= 1} className="px-2 py-1 border border-[#ccc] disabled:opacity-30 inline-flex"><Glyph icon="⏮" size={13} /></button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 border border-[#ccc] disabled:opacity-30">‹</button>
            <button onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas} className="px-2 py-1 border border-[#ccc] disabled:opacity-30">›</button>
            <button onClick={() => setPage(totalPaginas)} disabled={page >= totalPaginas} className="px-2 py-1 border border-[#ccc] disabled:opacity-30 inline-flex"><Glyph icon="⏭" size={13} /></button>
          </div>
        </div>

        <div className="flex justify-between px-3 py-2 border-t border-[#ddd]">
          <button onClick={() => sel && onPick(sel)} disabled={!sel}
            className="flex items-center gap-2 px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: '#1f7a34' }}>
            <Glyph icon="✔" size={14} /> OK
          </button>
          <button onClick={onClose}
            className="flex items-center gap-2 px-4 py-1.5 text-[12px] font-bold text-white" style={{ background: '#c0392b' }}>
            <Glyph icon="✖" size={14} /> Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
